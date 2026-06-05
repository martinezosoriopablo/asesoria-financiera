import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/api-response";

// GET - List advisor's preferred funds, enriched with ficha data
export async function GET(request: NextRequest) {
  const blocked = await applyRateLimit(request, "preferred-funds", { limit: 30, windowSeconds: 60 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  return handleApiError("preferred-funds-get", async () => {
  const { data, error } = await supabase
    .from("advisor_preferred_funds")
    .select("*")
    .eq("advisor_id", advisor!.id)
    .eq("active", true)
    .order("category", { ascending: true });

  if (error) throw error;
  if (!data || data.length === 0) return NextResponse.json({ success: true, funds: [] });

  // Enrich with fichas data (TAC, beneficios tributarios, objetivo)
  // FM fichas are in fund_fichas (keyed by fo_run + fm_serie)
  // FI fichas are in fi_fichas (keyed by fi_rut + fi_serie)
  const fmFunds = data.filter((f) => !f.fund_run.endsWith("-FI"));
  const fiFunds = data.filter((f) => f.fund_run.endsWith("-FI"));

  interface FichaData {
    tac_serie: number | null;
    beneficio_107lir: boolean | null;
    beneficio_108lir: boolean | null;
    beneficio_apv: boolean | null;
    beneficio_57bis: boolean | null;
    notas_tributarias: string | null;
    objetivo: string | null;
    horizonte_inversion: string | null;
    tolerancia_riesgo: string | null;
  }

  const fichaMap = new Map<string, FichaData>();

  // Fetch FM fichas
  if (fmFunds.length > 0) {
    const fmRuns = [...new Set(fmFunds.map((f) => parseInt(f.fund_run.split("-")[0], 10)))].filter((r) => r > 0);
    if (fmRuns.length > 0) {
      const { data: fichas } = await supabase
        .from("fund_fichas")
        .select("fo_run, fm_serie, tac_serie, beneficio_107lir, beneficio_108lir, beneficio_apv, beneficio_57bis, notas_tributarias, objetivo, horizonte_inversion, tolerancia_riesgo")
        .in("fo_run", fmRuns);
      if (fichas) {
        for (const f of fichas) {
          fichaMap.set(`${f.fo_run}-${f.fm_serie}`, f);
        }
      }
    }
  }

  // Fetch FI fichas
  if (fiFunds.length > 0) {
    const fiRuts = fiFunds.map((f) => f.fund_run.replace(/-FI$/, ""));
    if (fiRuts.length > 0) {
      const { data: fichas } = await supabase
        .from("fi_fichas")
        .select("fi_rut, fi_serie, tac_serie, beneficio_107lir, beneficio_108lir, beneficio_apv, beneficio_57bis, notas_tributarias, objetivo, horizonte_inversion, tolerancia_riesgo")
        .in("fi_rut", fiRuts);
      if (fichas) {
        for (const f of fichas) {
          fichaMap.set(`${f.fi_rut}-${f.fi_serie}`, f);
        }
      }
    }
  }

  const enrichedFunds = data.map((fund) => {
    // For FI funds, try "RUT-FI" key first, then just "RUT-" variations
    let ficha = fichaMap.get(fund.fund_run);
    if (!ficha && fund.fund_run.endsWith("-FI")) {
      // fi_fichas might store serie as "UNICA" or other value
      const rut = fund.fund_run.replace(/-FI$/, "");
      for (const [key, val] of fichaMap) {
        if (key.startsWith(rut + "-")) {
          ficha = val;
          break;
        }
      }
    }
    return {
      ...fund,
      tac: ficha?.tac_serie ?? null,
      beneficio_tributario: ficha ? formatBeneficio(ficha) : null,
      objetivo: ficha?.objetivo ?? null,
      horizonte: ficha?.horizonte_inversion ?? null,
      tolerancia_riesgo: ficha?.tolerancia_riesgo ?? null,
    };
  });

  return NextResponse.json({ success: true, funds: enrichedFunds });
  });
}

function formatBeneficio(ficha: {
  beneficio_107lir?: boolean | null; beneficio_108lir?: boolean | null;
  beneficio_apv?: boolean | null; beneficio_57bis?: boolean | null;
  notas_tributarias?: string | null;
}): string | null {
  const tags: string[] = [];
  if (ficha.beneficio_apv) tags.push("APV");
  if (ficha.beneficio_57bis) tags.push("57 bis");
  if (ficha.beneficio_107lir) tags.push("107 LIR");
  if (ficha.beneficio_108lir) tags.push("108 LIR");
  if (tags.length === 0 && ficha.notas_tributarias) return ficha.notas_tributarias;
  return tags.length > 0 ? tags.join(", ") : null;
}

// POST - Add a fund to preferred list
export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "preferred-funds-post", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  return handleApiError("preferred-funds-post", async () => {
    const body = await request.json();
    const { fund_run, fund_name, category, notes, ticker, instrument_type, expense_ratio, description, custodian_type } = body;

    if (!fund_run && !ticker) {
      return NextResponse.json({ error: "fund_run o ticker requerido" }, { status: 400 });
    }

    // For ETFs/stocks/bonds, generate a placeholder fund_run from ticker
    const effectiveFundRun = fund_run || `ETF-${ticker}`;

    const { data, error } = await supabase
      .from("advisor_preferred_funds")
      .upsert({
        advisor_id: advisor!.id,
        fund_run: effectiveFundRun,
        fund_name: fund_name || null,
        category: category || null,
        notes: notes || null,
        ticker: ticker || null,
        instrument_type: instrument_type || "fund",
        expense_ratio: expense_ratio ?? null,
        description: description || null,
        custodian_type: custodian_type || "agf",
        active: true,
      }, { onConflict: "advisor_id,fund_run" })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, fund: data });
  });
}

// PATCH - Update category/notes on a preferred fund
export async function PATCH(request: NextRequest) {
  const blocked = await applyRateLimit(request, "preferred-funds-patch", { limit: 20, windowSeconds: 60 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  return handleApiError("preferred-funds-patch", async () => {
    const { id, category, notes, ticker, instrument_type, expense_ratio, description, custodian_type } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "id requerido" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (category !== undefined) updates.category = category || null;
    if (notes !== undefined) updates.notes = notes || null;
    if (ticker !== undefined) updates.ticker = ticker || null;
    if (instrument_type !== undefined) updates.instrument_type = instrument_type;
    if (expense_ratio !== undefined) updates.expense_ratio = expense_ratio;
    if (description !== undefined) updates.description = description || null;
    if (custodian_type !== undefined) updates.custodian_type = custodian_type;

    const { error } = await supabase
      .from("advisor_preferred_funds")
      .update(updates)
      .eq("id", id)
      .eq("advisor_id", advisor!.id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  });
}

// DELETE - Remove a fund from preferred list (soft delete)
export async function DELETE(request: NextRequest) {
  const blocked = await applyRateLimit(request, "preferred-funds-delete", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  return handleApiError("preferred-funds-delete", async () => {
    const { searchParams } = new URL(request.url);
    const fundId = searchParams.get("id");

    if (!fundId) {
      return NextResponse.json({ error: "id requerido" }, { status: 400 });
    }

    const { error } = await supabase
      .from("advisor_preferred_funds")
      .update({ active: false })
      .eq("id", fundId)
      .eq("advisor_id", advisor!.id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  });
}
