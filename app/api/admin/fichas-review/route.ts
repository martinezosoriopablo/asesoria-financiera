// app/api/admin/fichas-review/route.ts
// List all fund_fichas + fi_fichas for admin review

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";

const FICHA_FIELDS = "tac_serie, nombre_fondo_pdf, serie_detectada, rent_1m, rent_3m, rent_6m, rent_12m, horizonte_inversion, tolerancia_riesgo, rescatable, updated_at, beneficio_apv, beneficio_57bis, beneficio_107lir, beneficio_108lir, notas_tributarias, objetivo";

export async function GET(request: NextRequest) {
  const blocked = await applyRateLimit(request, "fichas-review", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();
  const PAGE = 1000;

  // --- Fondos Mutuos (fund_fichas) ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fmFichas: any[] = [];
  let fmOffset = 0;
  while (true) {
    const { data, error: fetchErr } = await supabase
      .from("fund_fichas")
      .select(`fo_run, fm_serie, ${FICHA_FIELDS}`)
      .order("fo_run")
      .range(fmOffset, fmOffset + PAGE - 1);
    if (fetchErr) return NextResponse.json({ success: false, error: fetchErr.message }, { status: 500 });
    if (!data || data.length === 0) break;
    fmFichas = fmFichas.concat(data);
    if (data.length < PAGE) break;
    fmOffset += PAGE;
  }

  // --- Fondos de Inversión (fi_fichas) ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fiFichas: any[] = [];
  let fiOffset = 0;
  while (true) {
    const { data, error: fetchErr } = await supabase
      .from("fi_fichas")
      .select(`fi_rut, fi_serie, ${FICHA_FIELDS}`)
      .order("fi_rut")
      .range(fiOffset, fiOffset + PAGE - 1);
    if (fetchErr) return NextResponse.json({ success: false, error: fetchErr.message }, { status: 500 });
    if (!data || data.length === 0) break;
    fiFichas = fiFichas.concat(data);
    if (data.length < PAGE) break;
    fiOffset += PAGE;
  }

  // --- VW lookup for FM ---
  const fmRuns = [...new Set(fmFichas.map(f => f.fo_run))];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let vwAll: any[] = [];
  for (let i = 0; i < fmRuns.length; i += 500) {
    const chunk = fmRuns.slice(i, i + 500);
    const { data: vw } = await supabase
      .from("vw_fondos_completo")
      .select("fo_run, fm_serie, nombre_fondo, nombre_agf, familia_estudios, tac_sintetica, rent_12m_nominal")
      .in("fo_run", chunk);
    if (vw) vwAll = vwAll.concat(vw);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vwMap: Record<string, any> = {};
  for (const v of vwAll) vwMap[`${v.fo_run}-${v.fm_serie}`] = v;

  // --- FI lookup from fondos_inversion ---
  const fiRuts = [...new Set(fiFichas.map(f => f.fi_rut))];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fiAll: any[] = [];
  for (let i = 0; i < fiRuts.length; i += 500) {
    const chunk = fiRuts.slice(i, i + 500);
    const { data: fi } = await supabase
      .from("fondos_inversion")
      .select("rut, nombre, administradora")
      .in("rut", chunk);
    if (fi) fiAll = fiAll.concat(fi);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fiMap: Record<string, any> = {};
  for (const f of fiAll) fiMap[f.rut] = f;

  // --- Merge FM ---
  const mergedFm = fmFichas.map(f => {
    const v = vwMap[`${f.fo_run}-${f.fm_serie}`];
    return {
      fo_run: f.fo_run,
      fm_serie: f.fm_serie,
      tipo: "FM" as const,
      ...f,
      nombre_vw: v?.nombre_fondo || null,
      agf: v?.nombre_agf || null,
      familia: v?.familia_estudios || null,
      tac_vw: v?.tac_sintetica ?? null,
      rent_12m_vw: v?.rent_12m_nominal ?? null,
      in_vw: !!v,
    };
  });

  // --- Merge FI ---
  const mergedFi = fiFichas.map(f => {
    const fi = fiMap[f.fi_rut];
    return {
      fo_run: Number(f.fi_rut),
      fm_serie: f.fi_serie,
      tipo: "FI" as const,
      ...f,
      nombre_vw: fi?.nombre || null,
      agf: fi?.administradora || null,
      familia: null,
      tac_vw: null,
      rent_12m_vw: null,
      in_vw: !!fi,
    };
  });

  const merged = [...mergedFm, ...mergedFi];

  return NextResponse.json({ success: true, fichas: merged, total: merged.length });
}

// PATCH /api/admin/fichas-review — update individual fields on a ficha
export async function PATCH(request: NextRequest) {
  const blocked = await applyRateLimit(request, "fichas-patch", { limit: 30, windowSeconds: 60 });
  if (blocked) return blocked;

  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  const { tipo, fo_run, fm_serie, fi_rut, fi_serie, field, value } = await request.json();
  const EDITABLE = ["tac_serie", "horizonte_inversion", "tolerancia_riesgo", "beneficio_apv", "beneficio_57bis", "beneficio_107lir", "beneficio_108lir", "notas_tributarias", "objetivo", "rent_1m", "rent_3m", "rent_6m", "rent_12m", "nombre_fondo_pdf"];
  if (!EDITABLE.includes(field)) {
    return NextResponse.json({ success: false, error: `Campo '${field}' no es editable` }, { status: 400 });
  }

  const supabase = createAdminClient();

  if (tipo === "FM") {
    if (!fo_run || !fm_serie) return NextResponse.json({ success: false, error: "fo_run y fm_serie requeridos" }, { status: 400 });
    const { error } = await supabase.from("fund_fichas").update({ [field]: value, updated_at: new Date().toISOString() }).eq("fo_run", fo_run).eq("fm_serie", fm_serie);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } else if (tipo === "FI") {
    if (!fi_rut || !fi_serie) return NextResponse.json({ success: false, error: "fi_rut y fi_serie requeridos" }, { status: 400 });
    const { error } = await supabase.from("fi_fichas").update({ [field]: value, updated_at: new Date().toISOString() }).eq("fi_rut", fi_rut).eq("fi_serie", fi_serie);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } else {
    return NextResponse.json({ success: false, error: "tipo debe ser FM o FI" }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}

// DELETE /api/admin/fichas-review — delete a ficha by type + key
export async function DELETE(request: NextRequest) {
  const blocked = await applyRateLimit(request, "fichas-delete", { limit: 30, windowSeconds: 60 });
  if (blocked) return blocked;

  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  const { tipo, fo_run, fm_serie, fi_rut, fi_serie } = await request.json();
  const supabase = createAdminClient();

  if (tipo === "FM") {
    if (!fo_run || !fm_serie) {
      return NextResponse.json({ success: false, error: "fo_run y fm_serie requeridos" }, { status: 400 });
    }
    const { error } = await supabase.from("fund_fichas").delete().eq("fo_run", fo_run).eq("fm_serie", fm_serie);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } else if (tipo === "FI") {
    if (!fi_rut || !fi_serie) {
      return NextResponse.json({ success: false, error: "fi_rut y fi_serie requeridos" }, { status: 400 });
    }
    const { error } = await supabase.from("fi_fichas").delete().eq("fi_rut", fi_rut).eq("fi_serie", fi_serie);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } else {
    return NextResponse.json({ success: false, error: "tipo debe ser FM o FI" }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
