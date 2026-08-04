// GET /api/comite/recomendacion?clientId=…
// Compone las filas de 3 columnas (Comité | Mis Fondos | Decisión) para un cliente,
// desde la cartera-modelo del comité (model_portfolios) del perfil del cliente,
// filtrando "Mis Fondos" por el/los custodios del cliente. Ver spec 2026-07-25.
import { NextRequest } from "next/server";
import { requireClientAccess, createAdminClient } from "@/lib/auth/api-auth";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";
import { applyRateLimit } from "@/lib/rate-limit";
import { mapClientProfile, resolveCategoria } from "@/lib/comite-categories";
import { resolveMisFondos, defaultDecision, buildUnresolvedRow } from "@/lib/recomendacion/resolve";
import { getFichaMetrics } from "@/lib/comite/ficha-metrics";
import type { CustodianType, RecomendacionRow } from "@/lib/recomendacion/types";

export async function GET(request: NextRequest) {
  const rl = await applyRateLimit(request, "comite-recomendacion", { limit: 30 });
  if (rl) return rl;

  return handleApiError("comite-recomendacion-get", async () => {
    const clientId = request.nextUrl.searchParams.get("clientId");
    if (!clientId) return errorResponse("clientId es requerido", 400);

    const { advisor, error: accessError } = await requireClientAccess(clientId);
    if (accessError) return accessError;

    const supabase = createAdminClient();

    // 1. Perfil del cliente → perfil del modelo (clients.perfil_riesgo, fallback risk_profiles)
    const { data: client } = await supabase
      .from("clients").select("perfil_riesgo").eq("id", clientId).single();
    let perfilCliente = (client?.perfil_riesgo as string) || "";
    if (!perfilCliente) {
      const { data: rp } = await supabase
        .from("risk_profiles").select("perfil_riesgo")
        .eq("client_id", clientId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      perfilCliente = (rp?.perfil_riesgo as string) || "";
    }
    if (!perfilCliente) return successResponse({ ok: false, reason: "sin_perfil" });
    const perfilModelo = mapClientProfile(perfilCliente);

    // 2. Custodios del cliente (distinct custodian_type de sus snapshots).
    //    Override manual por query (?custodio=agf,internacional); si no hay override
    //    ni custodio detectado, se ASUME internacional (acceso a ETFs) con aviso (§6).
    const VALID_CUSTODIOS: CustodianType[] = ["agf", "corredora", "internacional"];
    const { data: snaps } = await supabase
      .from("portfolio_snapshots").select("custodian_type").eq("client_id", clientId);
    const detectados = [...new Set((snaps || [])
      .map(s => s.custodian_type as CustodianType | null).filter(Boolean))] as CustodianType[];

    const override = (request.nextUrl.searchParams.get("custodio") || "")
      .split(",").map(s => s.trim()).filter(s => VALID_CUSTODIOS.includes(s as CustodianType)) as CustodianType[];

    let custodios: CustodianType[];
    let custodioAsumido = false;
    if (override.length > 0) {
      custodios = override;
    } else if (detectados.length > 0) {
      custodios = detectados;
    } else {
      custodios = ["internacional"];
      custodioAsumido = true;
    }

    // 3. Cartera-modelo del comité (report_date más reciente)
    const { data: modelo } = await supabase
      .from("model_portfolios").select("report_date, posiciones")
      .eq("perfil", perfilModelo).order("report_date", { ascending: false }).limit(1).maybeSingle();
    if (!modelo) return successResponse({ ok: false, reason: "sin_modelo", perfil_modelo: perfilModelo });

    // 4. Fondos preferidos del asesor + mapeos categoría→fondo por custodio
    //    TAC/rent 12M se enriquecen desde vw_fondos_completo (FM) / fi_fichas (FI) via getFichaMetrics.
    const { data: preferred } = await supabase
      .from("advisor_preferred_funds")
      .select("id, fund_run, ticker, fund_name, custodian_type, category")
      .eq("advisor_id", advisor!.id);
    const { data: mappings } = await supabase
      .from("model_fund_mapping")
      .select("categoria, custodian_type, preferred_fund_id")
      .eq("advisor_id", advisor!.id);

    const fichaMetrics = await getFichaMetrics(supabase, (preferred || []).map(f => f.fund_run as string));
    const preferredFunds = (preferred || []).map(f => {
      const m = fichaMetrics.get(f.fund_run as string);
      return {
        id: f.id as string, fund_run: (f.fund_run as string) ?? null, ticker: (f.ticker as string) ?? null,
        nombre: (f.fund_name as string) || "", custodian_type: f.custodian_type as CustodianType,
        category: (f.category as string) || "", tac: m?.tac ?? null, rent_12m: m?.rent_12m ?? null,
      };
    });
    const mappingRows = (mappings || []).map(m => ({
      categoria: m.categoria as string, custodian_type: m.custodian_type as CustodianType,
      preferred_fund_id: m.preferred_fund_id as string,
    }));

    // 5. Componer filas por posición del comité con modelo_pct > 0
    const posiciones = (modelo.posiciones || []) as Array<{
      categoria: string; modelo_pct?: number; etf_us?: string | null; etf_ucits?: string | null;
      vista?: string | null; conviction?: string | null;
    }>;

    const rows: RecomendacionRow[] = [];
    for (const p of posiciones) {
      const pct = Number(p.modelo_pct) || 0;
      if (pct <= 0) continue;
      const cat = resolveCategoria(p.categoria);
      if (!cat) { rows.push(buildUnresolvedRow(p.categoria, pct)); continue; }
      const comite = {
        etf_us: p.etf_us ?? cat.etfUS, etf_ucits: p.etf_ucits ?? cat.etfUCITS,
        modelo_pct: pct, vista: p.vista ?? null, conviction: p.conviction ?? null,
      };
      const misFondos = resolveMisFondos({ categoria: cat.id, custodios, preferredFunds, mappings: mappingRows });
      // custodio del default: el del mejor fondo si existe, si no el primero del cliente
      const custodioDefault = misFondos[0]?.custodian_type || custodios[0];
      const decision = defaultDecision({ categoria: cat.id, role: cat.role, comite, misFondos, custodio: custodioDefault });
      rows.push({ categoria: cat.id, label: cat.label, role: cat.role, comite, misFondos, decision });
    }

    return successResponse({
      ok: true, perfil_cliente: perfilCliente, perfil_modelo: perfilModelo,
      comite_report_date: modelo.report_date, custodios,
      custodios_detectados: detectados, custodio_asumido: custodioAsumido, rows,
    });
  });
}
