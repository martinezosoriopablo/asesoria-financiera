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

// Las posiciones del cartera_modelo existen en DOS esquemas: el viejo
// (categoria/modelo_pct/etf_us/etf_ucits/vista) y el nuevo, ago 2026
// (clase/peso_pct/ticker_us/ticker_ucits/view) SIN campo `categoria`.
// Índices para derivar la ComiteCategory desde el ticker (robusto) o la etiqueta.
const byTicker = new Map<string, ComiteCategory>();
const byLabelNorm = new Map<string, ComiteCategory>();
const normLbl = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
for (const c of COMITE_CATEGORIES) {
  if (c.etfUS) byTicker.set(c.etfUS.toUpperCase(), c);
  if (c.etfUCITS) byTicker.set(c.etfUCITS.toUpperCase(), c);
  byLabelNorm.set(normLbl(c.label), c);
}
// Resuelve la categoría de una posición tolerando ambos esquemas: primero por
// `categoria` (viejo), luego por ticker US/UCITS, luego por la etiqueta `clase`.
function resolvePosCategory(raw: Record<string, unknown>): ComiteCategory | undefined {
  const catId = (raw.categoria as string) || "";
  if (catId) { const c = resolveCategoria(catId); if (c) return c; }
  for (const key of ["etf_us", "ticker_us", "etf_ucits", "ticker_ucits"]) {
    const t = raw[key];
    if (typeof t === "string" && t) { const c = byTicker.get(t.toUpperCase()); if (c) return c; }
  }
  const clase = (raw.clase ?? raw.label ?? raw.description) as string | undefined;
  if (clase) {
    const n = normLbl(clase);
    if (byLabelNorm.has(n)) return byLabelNorm.get(n);
    for (const [k, c] of byLabelNorm) if (n.startsWith(k)) return c; // "rv usa large cap" ⊂ "rv usa large cap s p 500"
  }
  return undefined;
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

    // 3. Cartera-modelo del comité (vigente por perfil, desde el repositorio unificado)
    const { data: carteraRow } = await supabase
      .from("vw_reports_vigentes").select("report_date, payload")
      .eq("type", "cartera_modelo").eq("perfil", perfilModelo).maybeSingle();
    if (!carteraRow) return successResponse({ ok: false, reason: "sin_modelo", perfil_modelo: perfilModelo });
    const modelo = {
      report_date: carteraRow.report_date as string,
      posiciones: ((carteraRow.payload as { posiciones?: unknown })?.posiciones ?? []) as unknown,
    };

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

    // 5. Componer filas por posición del comité con peso > 0.
    //    Tolera ambos esquemas: peso_pct/ticker_us/ticker_ucits/view (nuevo) y
    //    modelo_pct/etf_us/etf_ucits/vista (viejo). La categoría se deriva por
    //    ticker/etiqueta cuando no viene el campo `categoria`.
    const posiciones = (modelo.posiciones || []) as Array<Record<string, unknown>>;

    const rows: RecomendacionRow[] = [];
    for (const raw of posiciones) {
      const pct = Number(raw.modelo_pct ?? raw.peso_pct) || 0;
      if (pct <= 0) continue;
      const cat = resolvePosCategory(raw);
      if (!cat) continue;
      const comite = {
        etf_us: ((raw.etf_us ?? raw.ticker_us) as string | null) ?? cat.etfUS,
        etf_ucits: ((raw.etf_ucits ?? raw.ticker_ucits) as string | null) ?? cat.etfUCITS,
        modelo_pct: pct,
        vista: (raw.vista ?? raw.view ?? null) as string | null,
        conviction: (raw.conviction ?? null) as string | null,
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
