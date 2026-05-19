// app/api/admin/data-health/route.ts
// Returns data health metrics: stale prices, ficha coverage, extraction quality

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const blocked = await applyRateLimit(request, "data-health", { limit: 5, windowSeconds: 60 });
  if (blocked) return blocked;

  const { error } = await requireAdvisor();
  if (error) return error;

  const admin = createAdminClient();
  const today = new Date().toISOString().split("T")[0];
  const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString().split("T")[0];

  // --- 1. Price freshness: how many fondos_mutuos have recent prices? ---
  // Total fondos
  const { count: totalFondos } = await admin
    .from("fondos_mutuos")
    .select("id", { count: "exact", head: true });

  // Fondos with price in last 3 days
  const { data: recentPrices } = await admin
    .from("fondos_rentabilidades_diarias")
    .select("fondo_id")
    .gte("fecha", threeDaysAgo)
    .limit(10000);

  const fondosWithRecentPrice = new Set(recentPrices?.map(p => p.fondo_id) || []);

  // Fondos with ANY price (ever)
  const { data: anyPrices } = await admin
    .from("fondos_rentabilidades_diarias")
    .select("fondo_id")
    .limit(10000);

  const fondosWithAnyPrice = new Set(anyPrices?.map(p => p.fondo_id) || []);

  // Latest price date overall
  const { data: latestPriceRow } = await admin
    .from("fondos_rentabilidades_diarias")
    .select("fecha")
    .order("fecha", { ascending: false })
    .limit(1)
    .single();

  // --- 2. Client portfolio staleness ---
  // Get all client holdings and check which have stale/missing prices
  const { data: activeClients } = await admin
    .from("clients")
    .select("id, nombre, apellido")
    .eq("status", "activo");

  const clientIds = (activeClients || []).map(c => c.id);

  // Latest snapshot per client
  const { data: allSnapshots } = await admin
    .from("portfolio_snapshots")
    .select("id, client_id, snapshot_date, source, holdings, total_value")
    .in("client_id", clientIds)
    .order("snapshot_date", { ascending: false });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const latestPerClient = new Map<string, any>();
  for (const snap of allSnapshots || []) {
    if (!latestPerClient.has(snap.client_id)) {
      latestPerClient.set(snap.client_id, snap);
    }
  }

  // Analyze holdings for stale prices
  interface StaleHolding {
    clientId: string;
    clientName: string;
    fundName: string;
    run: string;
    serie: string;
    snapshotDate: string;
    daysSinceSnapshot: number;
  }

  const staleHoldings: StaleHolding[] = [];
  const clientsWithStaleData: string[] = [];

  for (const client of activeClients || []) {
    const snap = latestPerClient.get(client.id);
    if (!snap) continue;

    const snapDate = new Date(snap.snapshot_date);
    const daysSince = Math.floor((Date.now() - snapDate.getTime()) / 86400000);

    if (daysSince > 7 && snap.source !== "statement") {
      clientsWithStaleData.push(`${client.nombre} ${client.apellido}`);
    }

    // Check individual holdings for unmatched funds
    const holdings = (snap.holdings || []) as Array<{
      fundName?: string; securityId?: string; serie?: string;
    }>;

    for (const h of holdings) {
      if (h.securityId && !fondosWithAnyPrice.has(h.securityId)) {
        staleHoldings.push({
          clientId: client.id,
          clientName: `${client.nombre} ${client.apellido}`,
          fundName: h.fundName || "Unknown",
          run: h.securityId || "",
          serie: h.serie || "",
          snapshotDate: snap.snapshot_date,
          daysSinceSnapshot: daysSince,
        });
      }
    }
  }

  // --- 3. Ficha coverage ---
  const { count: totalFichasFM } = await admin
    .from("fund_fichas")
    .select("fo_run", { count: "exact", head: true });

  const { count: totalFichasFI } = await admin
    .from("fi_fichas")
    .select("fi_rut", { count: "exact", head: true });

  // Fichas with TAC
  const { count: fichasWithTAC } = await admin
    .from("fund_fichas")
    .select("fo_run", { count: "exact", head: true })
    .not("tac_serie", "is", null);

  // Fichas extracted by gemini vs regex
  const { count: fichasGemini } = await admin
    .from("fund_fichas")
    .select("fo_run", { count: "exact", head: true })
    .not("objetivo", "is", null); // Gemini extracts objetivo, regex rarely does

  // Fichas with beneficio tributario data (only gemini extracts these)
  const { count: fichasWithBeneficio } = await admin
    .from("fund_fichas")
    .select("fo_run", { count: "exact", head: true })
    .eq("beneficio_apv", true);

  // --- 4. FI (fondos de inversión) sync status ---
  const { data: fiStatus } = await admin
    .from("fondos_inversion")
    .select("id, nombre, ultimo_sync, ultimo_sync_ok, ultimo_sync_error")
    .order("ultimo_sync", { ascending: false, nullsFirst: false })
    .limit(200);

  const fiTotal = fiStatus?.length || 0;
  const fiSynced = fiStatus?.filter(f => f.ultimo_sync_ok).length || 0;
  const fiFailed = fiStatus?.filter(f => f.ultimo_sync_error).length || 0;
  const fiNeverSynced = fiStatus?.filter(f => !f.ultimo_sync).length || 0;

  // --- 5. Exchange rate status ---
  let exchangeRateStatus = { dolar: 0, uf: 0, source: "unknown", date: "" };
  try {
    const ratesRes = await fetch(`${request.nextUrl.origin}/api/exchange-rates`);
    const ratesData = await ratesRes.json();
    if (ratesData.success) {
      exchangeRateStatus = {
        dolar: ratesData.usd,
        uf: ratesData.uf,
        source: ratesData.source || "unknown",
        date: ratesData.timestamp || "",
      };
    }
  } catch { /* ignore */ }

  return NextResponse.json({
    success: true,
    timestamp: today,
    prices: {
      totalFondos: totalFondos || 0,
      fondosWithRecentPrice: fondosWithRecentPrice.size,
      fondosWithAnyPrice: fondosWithAnyPrice.size,
      fondosWithoutPrice: (totalFondos || 0) - fondosWithAnyPrice.size,
      latestPriceDate: latestPriceRow?.fecha || null,
      coveragePercent: totalFondos ? Math.round((fondosWithRecentPrice.size / totalFondos) * 100) : 0,
    },
    clients: {
      totalActive: activeClients?.length || 0,
      withSnapshots: latestPerClient.size,
      withStaleData: clientsWithStaleData.length,
      staleClients: clientsWithStaleData.slice(0, 10),
    },
    staleHoldings: staleHoldings.slice(0, 20),
    fichas: {
      totalFM: totalFichasFM || 0,
      totalFI: totalFichasFI || 0,
      withTAC: fichasWithTAC || 0,
      tacCoveragePercent: totalFichasFM ? Math.round(((fichasWithTAC || 0) / totalFichasFM) * 100) : 0,
      likelyGemini: fichasGemini || 0,
      withBeneficio: fichasWithBeneficio || 0,
    },
    fi: {
      total: fiTotal,
      synced: fiSynced,
      failed: fiFailed,
      neverSynced: fiNeverSynced,
    },
    exchangeRates: exchangeRateStatus,
  });
}
