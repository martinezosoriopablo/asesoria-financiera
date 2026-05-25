// app/api/comite/model-portfolios/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";

interface PositionInput {
  categoria: string;
  peso: number;
  etf_ref?: string;
  tesis?: string;
}

interface PerfilInput {
  nota_comite?: string;
  posiciones: PositionInput[];
}

interface ModelPortfolioUpload {
  report_date: string;
  perfiles: Record<string, PerfilInput>;
}

const VALID_PERFILES = [
  "ultra_conservador", "conservador", "moderado",
  "crecimiento", "agresivo", "muy_agresivo",
];

// POST — receive JSON, upsert 6 rows (one per profile)
export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "model-portfolios-post", { limit: 5, windowSeconds: 60 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    const body: ModelPortfolioUpload = await request.json();

    // Validate
    if (!body.report_date || !body.perfiles) {
      return NextResponse.json(
        { success: false, error: "report_date y perfiles son requeridos" },
        { status: 400 }
      );
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(body.report_date)) {
      return NextResponse.json(
        { success: false, error: "report_date debe tener formato YYYY-MM-DD" },
        { status: 400 }
      );
    }

    const perfilKeys = Object.keys(body.perfiles);
    const invalidPerfiles = perfilKeys.filter((p) => !VALID_PERFILES.includes(p));
    if (invalidPerfiles.length > 0) {
      return NextResponse.json(
        { success: false, error: `Perfiles inválidos: ${invalidPerfiles.join(", ")}` },
        { status: 400 }
      );
    }

    // Validate each profile's positions
    for (const [perfil, data] of Object.entries(body.perfiles)) {
      if (!data.posiciones || !Array.isArray(data.posiciones) || data.posiciones.length === 0) {
        return NextResponse.json(
          { success: false, error: `Perfil ${perfil} debe tener al menos una posición` },
          { status: 400 }
        );
      }
      const totalPeso = data.posiciones.reduce((sum, p) => sum + (p.peso || 0), 0);
      if (Math.abs(totalPeso - 100) > 1) {
        return NextResponse.json(
          { success: false, error: `Perfil ${perfil}: pesos suman ${totalPeso}%, deben sumar 100%` },
          { status: 400 }
        );
      }
    }

    // Delete existing rows for this report_date (upsert approach)
    await supabase
      .from("model_portfolios")
      .delete()
      .eq("report_date", body.report_date);

    // Insert new rows
    const rows = perfilKeys.map((perfil) => ({
      report_date: body.report_date,
      perfil,
      posiciones: body.perfiles[perfil].posiciones,
      nota_comite: body.perfiles[perfil].nota_comite || null,
      created_by: advisor!.id,
    }));

    const { data, error } = await supabase
      .from("model_portfolios")
      .insert(rows)
      .select("id, perfil, version, report_date");

    if (error) {
      console.error("Error inserting model portfolios:", error);
      return NextResponse.json(
        { success: false, error: "Error al guardar carteras modelo" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, inserted: data });
  } catch (error) {
    console.error("Error in model-portfolios POST:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    );
  }
}

// GET — returns active models (latest report_date per profile)
// ?perfil=moderado — single profile
// no param — all 6 active models
export async function GET(request: NextRequest) {
  const blocked = await applyRateLimit(request, "model-portfolios-get", { limit: 30, windowSeconds: 60 });
  if (blocked) return blocked;

  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();
  const { searchParams } = new URL(request.url);
  const perfil = searchParams.get("perfil");

  // Get the latest report_date
  const { data: latest } = await supabase
    .from("model_portfolios")
    .select("report_date")
    .order("report_date", { ascending: false })
    .limit(1)
    .single();

  if (!latest) {
    return NextResponse.json({ success: true, models: [], report_date: null });
  }

  let query = supabase
    .from("model_portfolios")
    .select("*")
    .eq("report_date", latest.report_date)
    .order("perfil");

  if (perfil) {
    query = query.eq("perfil", perfil);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    models: data || [],
    report_date: latest.report_date,
  });
}
