// app/api/portfolio/dividends/route.ts
// Registrar dividendos para ajustar correctamente el valor cuota del portfolio
// Los dividendos aumentan el valor del portfolio SIN cambiar las cuotas,
// así la rentabilidad refleja correctamente el retorno total (precio + dividendos)

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { applyRateLimit } from "@/lib/rate-limit";

// POST: Registrar un dividendo
export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "dividends", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  try {
    const supabase = await createSupabaseServerClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const { clientId, date, amount, note } = await request.json();

    if (!clientId || !date || !amount) {
      return NextResponse.json(
        { success: false, error: "clientId, date y amount son requeridos" },
        { status: 400 }
      );
    }

    if (amount <= 0) {
      return NextResponse.json(
        { success: false, error: "El monto debe ser positivo" },
        { status: 400 }
      );
    }

    // 1. Registrar el dividendo en la tabla de dividendos
    const { error: insertError } = await supabase
      .from("portfolio_dividends")
      .insert({
        client_id: clientId,
        dividend_date: date,
        amount,
        note: note || null,
        created_by: user.id,
      });

    if (insertError) {
      console.error("Error inserting dividend:", insertError);
      return NextResponse.json(
        { success: false, error: insertError.message },
        { status: 500 }
      );
    }

    // 2. Ajustar el snapshot del día del dividendo (si existe)
    // El dividendo se suma al total_value pero NO cambia total_cuotas
    // Esto hace que el valor cuota suba, reflejando el retorno del dividendo
    const { data: snapshot } = await supabase
      .from("portfolio_snapshots")
      .select("id, total_value, total_cuotas, net_cash_flow, deposits")
      .eq("client_id", clientId)
      .eq("snapshot_date", date)
      .maybeSingle();

    if (snapshot) {
      // Sumar dividendo al valor total (valor cuota sube)
      // Dividendo NO es cash flow (es retorno), así que NO lo sumamos a net_cash_flow
      // Solo sumamos al valor total para que el valor cuota suba
      await supabase
        .from("portfolio_snapshots")
        .update({
          total_value: snapshot.total_value + amount,
        })
        .eq("id", snapshot.id);
    }

    return NextResponse.json({
      success: true,
      message: `Dividendo de $${amount.toFixed(2)} registrado para ${date}`,
      snapshotAdjusted: !!snapshot,
    });
  } catch (error: unknown) {
    console.error("Error in dividends:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    );
  }
}

// GET: Listar dividendos de un cliente
export async function GET(request: NextRequest) {
  const blocked = await applyRateLimit(request, "dividends-get", { limit: 30, windowSeconds: 60 });
  if (blocked) return blocked;

  try {
    const supabase = await createSupabaseServerClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");

    if (!clientId) {
      return NextResponse.json({ success: false, error: "clientId requerido" }, { status: 400 });
    }

    const { data: dividends, error } = await supabase
      .from("portfolio_dividends")
      .select("*")
      .eq("client_id", clientId)
      .order("dividend_date", { ascending: false });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: dividends });
  } catch (error: unknown) {
    console.error("Error in dividends GET:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    );
  }
}
