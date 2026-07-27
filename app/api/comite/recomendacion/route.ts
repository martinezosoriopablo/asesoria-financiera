// GET /api/comite/recomendacion?clientId=…
// Compone las filas de 3 columnas (Comité | Mis Fondos | Decisión) para un cliente,
// desde la cartera-modelo del comité (model_portfolios) del perfil del cliente,
// filtrando "Mis Fondos" por el/los custodios del cliente. Ver spec 2026-07-25.
import { NextRequest } from "next/server";
import { requireClientAccess, createAdminClient } from "@/lib/auth/api-auth";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";
import { applyRateLimit } from "@/lib/rate-limit";
import { COMITE_CATEGORIES, mapClientProfile, getCategoryById, type ComiteCategory } from "@/lib/comite-categories";
import { resolveMisFondos, defaultDecision } from "@/lib/recomendacion/resolve";
import type { CustodianType, RecomendacionRow } from "@/lib/recomendacion/types";

// Los model_portfolios guardan la categoría SIN el prefijo de rol (ej. "usa_large_cap",
// "ust_belly", "gold", "tbills"), mientras COMITE_CATEGORIES usa el id con prefijo
// (rv_usa_large_cap, rf_ust_belly, alt_gold, cash_tbills). Normalizamos para matchear
// (mismo criterio que la Radiografía). Índice por id "pelado" (sin rv_/rf_/alt_/cash_).
const ROLE_PREFIX = /^(rv|rf|alt|cash)_/;
const strippedIndex = new Map<string, ComiteCategory>();
for (const c of COMITE_CATEGORIES) {
  const key = c.id.replace(ROLE_PREFIX, "");
  if (!strippedIndex.has(key)) strippedIndex.set(key, c); // primer match (RV antes que RF para "chile")
}
function resolveCategoria(catId: string): ComiteCategory | undefined {
  return getCategoryById(catId) || strippedIndex.get(catId.replace(ROLE_PREFIX, ""));
}

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

    // 2. Custodios del cliente (distinct custodian_type de sus snapshots)
    const { data: snaps } = await supabase
      .from("portfolio_snapshots").select("custodian_type").eq("client_id", clientId);
    const custodios = [...new Set((snaps || [])
      .map(s => s.custodian_type as CustodianType | null).filter(Boolean))] as CustodianType[];
    if (custodios.length === 0) return successResponse({ ok: false, reason: "sin_custodio", perfil_modelo: perfilModelo });

    // 3. Cartera-modelo del comité (report_date más reciente)
    const { data: modelo } = await supabase
      .from("model_portfolios").select("report_date, posiciones")
      .eq("perfil", perfilModelo).order("report_date", { ascending: false }).limit(1).maybeSingle();
    if (!modelo) return successResponse({ ok: false, reason: "sin_modelo", perfil_modelo: perfilModelo });

    // 4. Fondos preferidos del asesor + mapeos categoría→fondo por custodio
    //    (advisor_preferred_funds no tiene columna TAC; se deja null — enriquecer TAC
    //    vía fund_fichas/vw_fondos_completo es un follow-up.)
    const { data: preferred } = await supabase
      .from("advisor_preferred_funds")
      .select("id, fund_run, ticker, fund_name, custodian_type, category")
      .eq("advisor_id", advisor!.id);
    const { data: mappings } = await supabase
      .from("model_fund_mapping")
      .select("categoria, custodian_type, preferred_fund_id")
      .eq("advisor_id", advisor!.id);

    const preferredFunds = (preferred || []).map(f => ({
      id: f.id as string, fund_run: (f.fund_run as string) ?? null, ticker: (f.ticker as string) ?? null,
      nombre: (f.fund_name as string) || "", custodian_type: f.custodian_type as CustodianType,
      category: (f.category as string) || "", tac: null as number | null, rent_12m: null as number | null,
    }));
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
      if (!cat) continue;
      const comite = {
        etf_us: p.etf_us ?? cat.etfUS, etf_ucits: p.etf_ucits ?? cat.etfUCITS,
        modelo_pct: pct, vista: p.vista ?? null, conviction: p.conviction ?? null,
      };
      const misFondos = resolveMisFondos({ categoria: p.categoria, custodios, preferredFunds, mappings: mappingRows });
      // custodio del default: el del mejor fondo si existe, si no el primero del cliente
      const custodioDefault = misFondos[0]?.custodian_type || custodios[0];
      const decision = defaultDecision({ categoria: p.categoria, role: cat.role, comite, misFondos, custodio: custodioDefault });
      rows.push({ categoria: p.categoria, label: cat.label, role: cat.role, comite, misFondos, decision });
    }

    return successResponse({
      ok: true, perfil_cliente: perfilCliente, perfil_modelo: perfilModelo,
      comite_report_date: modelo.report_date, custodios, rows,
    });
  });
}
