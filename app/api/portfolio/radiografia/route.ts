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
      .select("id, first_name, last_name")
      .eq("id", clientId)
      .single();

    if (clientError || !client) {
      return errorResponse("Cliente no encontrado", 404);
    }

    const clientName = `${client.first_name} ${client.last_name}`.trim();

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
      },
    });
  });
}
