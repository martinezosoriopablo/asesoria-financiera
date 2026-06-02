// app/api/portfolio/radiografia/route.ts
// Radiografía consolidada: carga snapshots por custodio, clasifica holdings
// al sistema de 14 categorías del comité, compara vs modelo, genera deviaciones.

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";
import {
  COMITE_CATEGORIES,
  classifyHolding,
  mapClientProfile,
  getCategoryById,
  type HoldingForClassification,
  type ComiteRole,
} from "@/lib/comite-categories";
import { mapSectorToSleeve, mapSectorToCategory, type StockProfile } from "@/lib/sector-mapping";
import { detectInstrumentType } from "@/lib/instrument-type";
import { generateObservations } from "@/lib/observations";

// ── Types ────────────────────────────────────────────────────────────────

interface SnapshotHolding {
  fundName: string;
  securityId?: string | null;
  quantity?: number;
  marketPrice?: number;
  marketValue: number;
  marketValueCLP?: number;
  assetClass?: string;
  currency?: string;
  couponRate?: number | null;
  maturityDate?: string | null;
}

interface EnrichedHolding extends SnapshotHolding {
  custodian: string;
  custodianType: string;
  familiaEstudios: string | null;
}

interface ModelPosicion {
  categoria: string; // label like "RV USA Large Cap"
  role?: string;
  modelo_pct: number;
  vista?: "OW" | "UW" | "N";
  conviction?: string | null;
  etf_us?: string;
  etf_ucits?: string;
  justificacion?: string;
}

interface CategoryResult {
  categoria: string;
  categoriaLabel: string;
  role: ComiteRole;
  targetPct: number;
  actualPct: number;
  deltaPp: number;
  estado: "SOBREPONDERADO" | "SUBPONDERADO" | "EN_RANGO";
  vista: "OW" | "UW" | "N";
  conviction: string | null;
  currentHoldings: Array<{
    fundName: string;
    securityId: string | null;
    marketValueCLP: number;
    weightPct: number;
    custodian: string;
    custodianType: string;
    classificationConfidence: "high" | "medium" | "low";
  }>;
  proposedAction: {
    direction: "buy" | "sell" | "hold";
    amountCLP: number;
    instrument: string;
    ticker: string | null;
    custodian: string;
    custodianType: string;
  } | null;
}

interface SectorBreakdownItem {
  sector: string;
  sleeveId: string | null;
  actualPct: number;
  sleevePct: number | null;
  deltaPp: number;
  sleeveVista: "OW" | "UW" | "N" | null;
  sleeveConviction: "ALTA" | "MEDIA" | "BAJA" | null;
  holdings: Array<{
    fundName: string;
    ticker: string;
    marketValueUSD: number;
    weightInSector: number;
  }>;
}

interface TradeSuggestion {
  action: "REDUCIR" | "AGREGAR" | "MANTENER";
  reason: string;
  holdings?: string[];
  amountUSD?: number;
  instrument?: string;
  instrumentTicker?: string;
  priority: "alta" | "media" | "baja";
}

// ── POST handler ─────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "radiografia", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  return handleApiError("radiografia", async () => {
    const supabase = createAdminClient();
    const body = await request.json();
    const { clientId, perfilOverride } = body as {
      clientId?: string;
      perfilOverride?: string;
    };

    // ── 1. Validate input ────────────────────────────────────────────────
    if (!clientId) {
      return errorResponse("clientId es requerido", 400);
    }

    // ── 2. Load client ───────────────────────────────────────────────────
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id, nombre, apellido")
      .eq("id", clientId)
      .single();

    if (clientError || !client) {
      return errorResponse("Cliente no encontrado", 404);
    }

    const clientName = `${client.nombre} ${client.apellido}`.trim();

    // ── 3. Load risk profile ─────────────────────────────────────────────
    const { data: riskProfile } = await supabase
      .from("risk_profiles")
      .select("perfil_riesgo")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const perfilCliente = perfilOverride || riskProfile?.perfil_riesgo || "moderado";
    const perfilModelo = mapClientProfile(perfilCliente);

    // ── 4. Load latest snapshots per custodian ───────────────────────────
    // Exclude api-prices (auto-generated daily, not real cartolas)
    const { data: allSnapshots, error: snapError } = await supabase
      .from("portfolio_snapshots")
      .select("id, snapshot_date, total_value, holdings, custodian, custodian_type, source")
      .eq("client_id", clientId)
      .neq("source", "api-prices")
      .order("snapshot_date", { ascending: false });

    if (snapError || !allSnapshots || allSnapshots.length === 0) {
      return errorResponse("No se encontraron snapshots para este cliente", 404);
    }

    // Group by custodian → take latest per custodian
    const latestByCustodian = new Map<string, typeof allSnapshots[0]>();
    for (const snap of allSnapshots) {
      const key = snap.custodian || "__default__";
      if (!latestByCustodian.has(key)) {
        latestByCustodian.set(key, snap);
      }
    }

    // ── 5. Consolidate holdings ──────────────────────────────────────────
    const consolidatedHoldings: EnrichedHolding[] = [];
    const custodiansList: Array<{ name: string; type: string; snapshotDate: string }> = [];

    for (const [custKey, snap] of latestByCustodian) {
      const custodianName = custKey === "__default__" ? "Principal" : custKey;
      const custodianType = snap.custodian_type || "corredora";
      custodiansList.push({
        name: custodianName,
        type: custodianType,
        snapshotDate: snap.snapshot_date,
      });

      const holdings = (snap.holdings || []) as SnapshotHolding[];
      for (const h of holdings) {
        consolidatedHoldings.push({
          ...h,
          custodian: custodianName,
          custodianType: custodianType,
          familiaEstudios: null, // will be enriched below
        });
      }
    }

    // ── 6. Calculate totalValueCLP ───────────────────────────────────────
    const totalValueCLP = consolidatedHoldings.reduce(
      (sum, h) => sum + (h.marketValueCLP || h.marketValue || 0),
      0
    );

    if (totalValueCLP <= 0) {
      return errorResponse("El valor total del portafolio es 0", 400);
    }

    // ── 7. Enrich Chilean funds with familia_estudios ────────────────────
    const numericSecurityIds = consolidatedHoldings
      .map((h) => h.securityId?.trim())
      .filter((sid): sid is string => !!sid && /^\d+$/.test(sid))
      .map((sid) => parseInt(sid, 10));

    const uniqueRuns = [...new Set(numericSecurityIds)];

    const familiaMap = new Map<number, string | null>();
    if (uniqueRuns.length > 0) {
      // Batch query — may need pagination if many runs
      const PAGE = 1000;
      for (let offset = 0; offset < uniqueRuns.length; offset += PAGE) {
        const batch = uniqueRuns.slice(offset, offset + PAGE);
        const { data: fondos } = await supabase
          .from("vw_fondos_completo")
          .select("fo_run, familia_estudios")
          .in("fo_run", batch);

        if (fondos) {
          for (const f of fondos) {
            if (!familiaMap.has(f.fo_run)) {
              familiaMap.set(f.fo_run, f.familia_estudios);
            }
          }
        }
      }
    }

    // Apply familia_estudios to holdings
    for (const h of consolidatedHoldings) {
      const sid = h.securityId?.trim();
      if (sid && /^\d+$/.test(sid)) {
        const run = parseInt(sid, 10);
        h.familiaEstudios = familiaMap.get(run) ?? null;
      }
    }

    // ── 8. Classify each holding ─────────────────────────────────────────
    const classifiedHoldings = consolidatedHoldings.map((h) => {
      const input: HoldingForClassification = {
        fundName: h.fundName,
        securityId: h.securityId,
        marketValue: h.marketValueCLP || h.marketValue || 0,
        assetClass: h.assetClass,
        currency: h.currency,
        familiaEstudios: h.familiaEstudios,
        couponRate: h.couponRate,
        maturityDate: h.maturityDate,
      };
      const result = classifyHolding(input);
      return {
        ...h,
        categoryId: result.categoryId,
        confidence: result.confidence,
        valueCLP: h.marketValueCLP || h.marketValue || 0,
      };
    });

    // ── 8b. Enrich stocks with sector data ────────────────────────────
    const stockTickers = classifiedHoldings
      .filter((h) => {
        const sid = h.securityId?.trim() || "";
        return sid && !/^\d+$/.test(sid) && /^[A-Z]{1,6}$/.test(sid);
      })
      .map((h) => h.securityId!.trim().toUpperCase());

    const uniqueStockTickers = [...new Set(stockTickers)];
    const stockProfiles = new Map<string, StockProfile>();

    if (uniqueStockTickers.length > 0) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);

      const { data: cached } = await supabase
        .from("stock_profiles" as any)
        .select("ticker, name, sector, industry, market_cap, country, exchange")
        .in("ticker", uniqueStockTickers)
        .gte("fetched_at", cutoff.toISOString());

      for (const row of (cached || []) as any[]) {
        stockProfiles.set(row.ticker, {
          ticker: row.ticker,
          name: row.name || row.ticker,
          sector: row.sector || "",
          industry: row.industry || "",
          marketCap: row.market_cap || 0,
          country: row.country || "",
          exchange: row.exchange || "",
        });
      }

      const missingTickers = uniqueStockTickers.filter((t) => !stockProfiles.has(t));
      if (missingTickers.length > 0) {
        const { fetchStockOverviews } = await import("@/lib/stock-profiles");
        const fetched = await fetchStockOverviews(missingTickers);

        const rows = Array.from(fetched.values()).map((p) => ({
          ticker: p.ticker,
          name: p.name,
          sector: p.sector,
          industry: p.industry,
          market_cap: p.marketCap,
          country: p.country,
          exchange: p.exchange,
          fetched_at: new Date().toISOString(),
        }));
        if (rows.length > 0) {
          await supabase.from("stock_profiles" as any).upsert(rows, { onConflict: "ticker" });
        }

        for (const [t, p] of fetched) stockProfiles.set(t, p);
      }

      // Reclassify stocks using sector data (upgrade from low to medium confidence)
      for (const h of classifiedHoldings) {
        const sid = h.securityId?.trim().toUpperCase() || "";
        const profile = stockProfiles.get(sid);
        if (profile && h.confidence === "low") {
          h.categoryId = mapSectorToCategory(profile);
          h.confidence = "medium";
        }
      }
    }

    // ── 9. Load model portfolio ──────────────────────────────────────────
    const { data: latestDate } = await supabase
      .from("model_portfolios")
      .select("report_date")
      .order("report_date", { ascending: false })
      .limit(1)
      .single();

    if (!latestDate) {
      return errorResponse("No se encontraron carteras modelo", 404);
    }

    const { data: modelRow } = await supabase
      .from("model_portfolios")
      .select("perfil, posiciones, sleeves, nota_comite, report_date")
      .eq("report_date", latestDate.report_date)
      .eq("perfil", perfilModelo)
      .single();

    if (!modelRow) {
      return errorResponse(
        `No se encontró cartera modelo para el perfil "${perfilModelo}"`,
        404
      );
    }

    const posiciones = (modelRow.posiciones || []) as ModelPosicion[];
    const sleeves = (modelRow.sleeves || []) as Array<Record<string, unknown>>;

    // Build label → posicion map for matching
    const posicionByLabel = new Map<string, ModelPosicion>();
    for (const pos of posiciones) {
      posicionByLabel.set(pos.categoria, pos);
    }

    // ── 10. Load fund mappings per custodian_type ────────────────────────
    const custodianTypes = [...new Set(custodiansList.map((c) => c.type))].filter(
      (t) => t !== "internacional"
    );

    interface FundMapping {
      categoria: string;
      custodian_type: string;
      advisor_preferred_funds: {
        fund_name: string | null;
        ticker: string | null;
      };
    }

    const allMappings: FundMapping[] = [];
    if (custodianTypes.length > 0) {
      const { data: mappings } = await supabase
        .from("model_fund_mapping")
        .select(`
          categoria, custodian_type,
          advisor_preferred_funds!inner (fund_name, ticker)
        `)
        .eq("advisor_id", advisor!.id)
        .in("custodian_type", custodianTypes);

      if (mappings) {
        allMappings.push(...(mappings as unknown as FundMapping[]));
      }
    }

    // ── 11. Build category comparison ────────────────────────────────────
    // Aggregate actual allocation by categoryId
    const actualByCat = new Map<string, number>();
    const holdingsByCat = new Map<string, typeof classifiedHoldings>();

    for (const h of classifiedHoldings) {
      const cat = h.categoryId;
      actualByCat.set(cat, (actualByCat.get(cat) || 0) + h.valueCLP);
      if (!holdingsByCat.has(cat)) holdingsByCat.set(cat, []);
      holdingsByCat.get(cat)!.push(h);
    }

    const flags: Array<{ type: string; holdingName: string; message: string }> = [];

    const categories: CategoryResult[] = COMITE_CATEGORIES.map((cat) => {
      // Match model posicion by label
      const posicion = posicionByLabel.get(cat.label);
      const targetPct = posicion?.modelo_pct ?? 0;
      const actualValueCLP = actualByCat.get(cat.id) || 0;
      const actualPct = totalValueCLP > 0
        ? Math.round((actualValueCLP / totalValueCLP) * 10000) / 100
        : 0;
      const deltaPp = Math.round((actualPct - targetPct) * 100) / 100;

      const estado: CategoryResult["estado"] =
        deltaPp > 2 ? "SOBREPONDERADO" : deltaPp < -2 ? "SUBPONDERADO" : "EN_RANGO";

      const vista = (posicion?.vista as "OW" | "UW" | "N") || "N";
      const conviction = posicion?.conviction ?? null;

      // Current holdings in this category
      const catHoldings = holdingsByCat.get(cat.id) || [];
      const currentHoldings = catHoldings.map((h) => {
        // Track low confidence classifications
        if (h.confidence === "low") {
          flags.push({
            type: "low_confidence",
            holdingName: h.fundName,
            message: `"${h.fundName}" clasificado como ${cat.label} con confianza baja`,
          });
        }
        return {
          fundName: h.fundName,
          securityId: h.securityId?.trim() || null,
          marketValueCLP: h.valueCLP,
          weightPct: Math.round((h.valueCLP / totalValueCLP) * 10000) / 100,
          custodian: h.custodian,
          custodianType: h.custodianType,
          classificationConfidence: h.confidence,
        };
      });

      // Proposed action if deviation > 2pp
      let proposedAction: CategoryResult["proposedAction"] = null;
      if (Math.abs(deltaPp) > 2) {
        const direction: "buy" | "sell" = deltaPp < 0 ? "buy" : "sell";
        const amountCLP = Math.round(Math.abs(deltaPp / 100) * totalValueCLP);

        // Determine instrument: check fund mapping first, then fallback to ETF
        let instrument = cat.label;
        let ticker: string | null = null;
        let actionCustodian = "Principal";
        let actionCustodianType = "corredora";

        // Try fund mapping (for agf/corredora custodians)
        const mapping = allMappings.find((m) => m.categoria === cat.id);
        if (mapping) {
          instrument = mapping.advisor_preferred_funds.fund_name || cat.label;
          ticker = mapping.advisor_preferred_funds.ticker;
          actionCustodian = custodiansList.find((c) => c.type === mapping.custodian_type)?.name || "Principal";
          actionCustodianType = mapping.custodian_type;
        } else {
          // Fallback to ETF (internacional)
          const intlCustodian = custodiansList.find((c) => c.type === "internacional");
          if (intlCustodian) {
            ticker = cat.etfUS;
            instrument = cat.etfUS ? `ETF ${cat.etfUS}` : cat.label;
            actionCustodian = intlCustodian.name;
            actionCustodianType = "internacional";
          } else if (custodiansList.length > 0) {
            // Use first available custodian
            actionCustodian = custodiansList[0].name;
            actionCustodianType = custodiansList[0].type;
          }
        }

        proposedAction = {
          direction,
          amountCLP,
          instrument,
          ticker,
          custodian: actionCustodian,
          custodianType: actionCustodianType,
        };
      }

      return {
        categoria: cat.id,
        categoriaLabel: cat.label,
        role: cat.role,
        targetPct,
        actualPct,
        deltaPp,
        estado,
        vista,
        conviction,
        currentHoldings,
        proposedAction,
      };
    });

    // ── 12. Allocation summary by role ───────────────────────────────────
    const allocationInit = { actual: 0, target: 0, delta: 0 };
    const allocation: Record<ComiteRole, { actual: number; target: number; delta: number }> = {
      rv: { ...allocationInit },
      rf: { ...allocationInit },
      alt: { ...allocationInit },
      cash: { ...allocationInit },
    };

    for (const cat of categories) {
      allocation[cat.role].actual += cat.actualPct;
      allocation[cat.role].target += cat.targetPct;
    }
    for (const role of Object.keys(allocation) as ComiteRole[]) {
      allocation[role].actual = Math.round(allocation[role].actual * 100) / 100;
      allocation[role].target = Math.round(allocation[role].target * 100) / 100;
      allocation[role].delta = Math.round((allocation[role].actual - allocation[role].target) * 100) / 100;
    }

    // ── 12b. Build sector breakdown (normalized within RV) ─────────
    const rvHoldings = classifiedHoldings.filter((h) => {
      const cat = getCategoryById(h.categoryId);
      return cat?.role === "rv";
    });

    const rvTotalCLP = rvHoldings.reduce((s, h) => s + h.valueCLP, 0);

    const sectorGroups = new Map<string, typeof rvHoldings>();
    for (const h of rvHoldings) {
      const sid = h.securityId?.trim().toUpperCase() || "";
      const profile = stockProfiles.get(sid);
      const sector = profile?.sector || "Other";
      if (!sectorGroups.has(sector)) sectorGroups.set(sector, []);
      sectorGroups.get(sector)!.push(h);
    }

    const sleeveMap = new Map<string, { vista: string; conviction: string; peso_pct: number }>();
    for (const s of sleeves) {
      const id = (s.id as string) || (s.sector as string) || "";
      if (id) {
        sleeveMap.set(id, {
          vista: (s.vista as string) || "N",
          conviction: (s.conviction as string) || "",
          peso_pct: (s.peso_pct as number) || 0,
        });
      }
    }

    const sectorBreakdown: SectorBreakdownItem[] = Array.from(sectorGroups.entries())
      .map(([sector, holdings]) => {
        const sectorValueCLP = holdings.reduce((s, h) => s + h.valueCLP, 0);
        const actualPct = rvTotalCLP > 0
          ? Math.round((sectorValueCLP / rvTotalCLP) * 10000) / 100
          : 0;

        const sleeveId = mapSectorToSleeve(sector);
        const sleeve = sleeveId ? sleeveMap.get(sleeveId) : null;

        return {
          sector,
          sleeveId,
          actualPct,
          sleevePct: sleeve?.peso_pct ?? null,
          deltaPp: sleeve?.peso_pct != null
            ? Math.round((actualPct - sleeve.peso_pct) * 100) / 100
            : 0,
          sleeveVista: (sleeve?.vista as SectorBreakdownItem["sleeveVista"]) ?? null,
          sleeveConviction: (sleeve?.conviction as SectorBreakdownItem["sleeveConviction"]) ?? null,
          holdings: holdings.map((h) => ({
            fundName: h.fundName,
            ticker: h.securityId?.trim() || "",
            marketValueUSD: h.marketValue || 0,
            weightInSector: sectorValueCLP > 0
              ? Math.round((h.valueCLP / sectorValueCLP) * 10000) / 100
              : 0,
          })),
        };
      })
      .sort((a, b) => Math.abs(b.deltaPp) - Math.abs(a.deltaPp));

    // ── 12d. Build instrument breakdown ─────────────────────────────────
    const instrumentBreakdown: {
      stocks: Array<{
        ticker: string;
        name: string;
        sector: string;
        industry: string;
        country: string;
        marketValueUSD: number;
        marketValueCLP: number;
        weightPct: number;
        categoryId: string;
        confidence: string;
      }>;
      funds: Array<{
        fundName: string;
        securityId: string;
        categoryId: string;
        categoryLabel: string;
        marketValueCLP: number;
        weightPct: number;
        confidence: string;
      }>;
      bonds: Array<{
        name: string;
        securityId: string;
        couponRate: number;
        maturityDate: string;
        creditRating: string | null;
        bondType: "government" | "corporate" | "em_sovereign";
        marketValueUSD: number;
        marketValueCLP: number;
        weightPct: number;
      }>;
      etfs: Array<{
        ticker: string;
        name: string;
        categoryId: string;
        categoryLabel: string;
        marketValueCLP: number;
        weightPct: number;
      }>;
      cash: Array<{
        name: string;
        marketValueCLP: number;
        weightPct: number;
        currency: string;
      }>;
    } = { stocks: [], funds: [], bonds: [], etfs: [], cash: [] };

    for (const h of classifiedHoldings) {
      const instrType = detectInstrumentType(h);
      const weightPct = totalValueCLP > 0
        ? Math.round((h.valueCLP / totalValueCLP) * 10000) / 100
        : 0;

      switch (instrType) {
        case "stock": {
          const sid = h.securityId?.trim().toUpperCase() || "";
          const profile = stockProfiles.get(sid);
          instrumentBreakdown.stocks.push({
            ticker: sid,
            name: profile?.name || h.fundName,
            sector: profile?.sector || "Sin clasificar",
            industry: profile?.industry || "",
            country: profile?.country || "",
            marketValueUSD: h.marketValue || 0,
            marketValueCLP: h.valueCLP,
            weightPct,
            categoryId: h.categoryId,
            confidence: h.confidence,
          });
          break;
        }
        case "fund": {
          const cat = getCategoryById(h.categoryId);
          instrumentBreakdown.funds.push({
            fundName: h.fundName,
            securityId: h.securityId?.trim() || "",
            categoryId: h.categoryId,
            categoryLabel: cat?.label || h.categoryId,
            marketValueCLP: h.valueCLP,
            weightPct,
            confidence: h.confidence,
          });
          break;
        }
        case "bond": {
          const bondType: "government" | "corporate" | "em_sovereign" =
            h.categoryId === "rf_em_sovereign" ? "em_sovereign" :
            h.categoryId === "rf_ust_belly" || h.categoryId === "rf_ust_short" || h.categoryId === "rf_tips" ? "government" :
            "corporate";
          instrumentBreakdown.bonds.push({
            name: h.fundName,
            securityId: h.securityId?.trim() || "",
            couponRate: h.couponRate || 0,
            maturityDate: h.maturityDate || "",
            creditRating: (h as any).creditRating || null,
            bondType,
            marketValueUSD: h.marketValue || 0,
            marketValueCLP: h.valueCLP,
            weightPct,
          });
          break;
        }
        case "etf": {
          const cat = getCategoryById(h.categoryId);
          instrumentBreakdown.etfs.push({
            ticker: h.securityId?.trim().toUpperCase() || "",
            name: h.fundName,
            categoryId: h.categoryId,
            categoryLabel: cat?.label || h.categoryId,
            marketValueCLP: h.valueCLP,
            weightPct,
          });
          break;
        }
        case "cash": {
          instrumentBreakdown.cash.push({
            name: h.fundName,
            marketValueCLP: h.valueCLP,
            weightPct,
            currency: h.currency || "USD",
          });
          break;
        }
      }
    }

    // ── 12e. Generate observations ──────────────────────────────────
    const allHoldingsForObs = classifiedHoldings.map((h) => ({
      name: h.securityId?.trim() || h.fundName,
      weightPct: totalValueCLP > 0
        ? Math.round((h.valueCLP / totalValueCLP) * 10000) / 100
        : 0,
      confidence: h.confidence,
    }));

    const observations = generateObservations({
      allocation,
      holdings: allHoldingsForObs,
      sectorBreakdown: sectorBreakdown.map((s) => ({
        sector: s.sector,
        sleeveVista: s.sleeveVista,
        deltaPp: s.deltaPp,
      })),
    });

    // ── 12c. Generate trade suggestions ────────────────────────────
    const tradeSuggestions: TradeSuggestion[] = [];

    for (const role of ["rf", "alt", "cash"] as ComiteRole[]) {
      const alloc = allocation[role];
      if (alloc.target > 0 && alloc.actual < alloc.target - 3) {
        const gap = alloc.target - alloc.actual;
        const roleCats = categories.filter((c) => c.role === role && c.targetPct > 0);
        const biggest = roleCats.sort((a, b) => b.targetPct - a.targetPct)[0];
        if (biggest) {
          const catDef = getCategoryById(biggest.categoria);
          tradeSuggestions.push({
            action: "AGREGAR",
            reason: `${role.toUpperCase()} subponderado ${Math.abs(gap).toFixed(1)}pp vs modelo. Considerar agregar exposicion.`,
            instrument: catDef?.etfUS ? `ETF ${catDef.etfUS}` : biggest.categoriaLabel,
            instrumentTicker: catDef?.etfUS || undefined,
            amountUSD: undefined,
            priority: gap > 10 ? "alta" : "media",
          });
        }
      }
    }

    for (const sb of sectorBreakdown) {
      if (sb.sleevePct == null) continue;
      const delta = sb.actualPct - sb.sleevePct;

      if (delta > 5) {
        const topHoldings = sb.holdings
          .sort((a, b) => b.marketValueUSD - a.marketValueUSD)
          .slice(0, 3)
          .map((h) => h.ticker);

        tradeSuggestions.push({
          action: "REDUCIR",
          reason: `${sb.sector} sobreponderado +${delta.toFixed(1)}pp vs sleeve${sb.sleeveVista ? ` (vista: ${sb.sleeveVista})` : ""}.`,
          holdings: topHoldings,
          priority: delta > 15 ? "alta" : "media",
        });
      } else if (delta < -5 && sb.sleeveVista === "OW") {
        tradeSuggestions.push({
          action: "AGREGAR",
          reason: `${sb.sector} subponderado ${Math.abs(delta).toFixed(1)}pp, vista OW del comite${sb.sleeveConviction ? ` (conviction ${sb.sleeveConviction})` : ""}.`,
          priority: sb.sleeveConviction === "ALTA" ? "alta" : "media",
        });
      }
    }

    const priorityOrder = { alta: 0, media: 1, baja: 2 };
    tradeSuggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    const isAllInternacional = custodiansList.every((c) => c.type === "internacional");

    // ── 13. Flag unmapped custodians ─────────────────────────────────────
    for (const cust of custodiansList) {
      if (cust.type !== "internacional") {
        const hasMappings = allMappings.some((m) => m.custodian_type === cust.type);
        if (!hasMappings) {
          flags.push({
            type: "unmapped_custodian",
            holdingName: cust.name,
            message: `Custodio "${cust.name}" (${cust.type}) no tiene mapeo de fondos configurado`,
          });
        }
      }
    }

    // ── 14. Build response ───────────────────────────────────────────────
    return successResponse({
      data: {
        clientId,
        clientName,
        perfilModelo,
        perfilCliente,
        reportDate: modelRow.report_date,
        notaComite: modelRow.nota_comite || null,
        totalValueCLP,
        categories,
        allocation,
        flags,
        sleeves,
        custodians: custodiansList,
        sectorBreakdown,
        tradeSuggestions,
        stockProfiles: Object.fromEntries(stockProfiles),
        instrumentBreakdown,
        observations,
        taxAnalysisEnabled: !isAllInternacional,
      },
    });
  });
}
