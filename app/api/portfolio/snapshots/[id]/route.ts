// app/api/portfolio/snapshots/[id]/route.ts
// API para operaciones CRUD en snapshots individuales

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface UpdateData {
  snapshotDate?: string;
  totalValue?: number;
  totalCostBasis?: number;
  composition?: {
    equity?: { value: number; percent: number };
    fixedIncome?: { value: number; percent: number };
    alternatives?: { value: number; percent: number };
    cash?: { value: number; percent: number };
  };
  holdings?: unknown[];
}

// GET - Obtener un snapshot específico
export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const { id: snapshotId } = await context.params;

    const { data: snapshot, error } = await supabase
      .from("portfolio_snapshots")
      .select("*")
      .eq("id", snapshotId)
      .single();

    if (error) {
      console.error("Error fetching snapshot:", error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    if (!snapshot) {
      return NextResponse.json(
        { success: false, error: "Snapshot no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: snapshot,
    });
  } catch (error) {
    console.error("Error in GET snapshot:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

// PUT - Actualizar un snapshot
export async function PUT(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const { id: snapshotId } = await context.params;
    const body: UpdateData = await request.json();

    // Verificar que el snapshot existe
    const { data: existingSnapshot, error: fetchError } = await supabase
      .from("portfolio_snapshots")
      .select("id, client_id, snapshot_date")
      .eq("id", snapshotId)
      .single();

    if (fetchError || !existingSnapshot) {
      return NextResponse.json(
        { success: false, error: "Snapshot no encontrado" },
        { status: 404 }
      );
    }

    // Preparar datos de actualización
    const updateData: Record<string, unknown> = {};

    if (body.snapshotDate) {
      updateData.snapshot_date = body.snapshotDate;
    }

    if (body.totalValue !== undefined) {
      updateData.total_value = body.totalValue;
    }

    if (body.totalCostBasis !== undefined) {
      updateData.total_cost_basis = body.totalCostBasis;
      updateData.unrealized_gain_loss = body.totalValue
        ? body.totalValue - body.totalCostBasis
        : null;
    }

    if (body.composition) {
      updateData.equity_percent = body.composition.equity?.percent || 0;
      updateData.fixed_income_percent = body.composition.fixedIncome?.percent || 0;
      updateData.alternatives_percent = body.composition.alternatives?.percent || 0;
      updateData.cash_percent = body.composition.cash?.percent || 0;
      updateData.equity_value = body.composition.equity?.value || 0;
      updateData.fixed_income_value = body.composition.fixedIncome?.value || 0;
      updateData.alternatives_value = body.composition.alternatives?.value || 0;
      updateData.cash_value = body.composition.cash?.value || 0;
    }

    if (body.holdings) {
      updateData.holdings = body.holdings;
    }

    // Recalcular retornos si se cambió el valor
    if (body.totalValue !== undefined) {
      const clientId = existingSnapshot.client_id;
      const date = body.snapshotDate || existingSnapshot.snapshot_date;

      // Obtener snapshot anterior
      const { data: prevSnapshot } = await supabase
        .from("portfolio_snapshots")
        .select("total_value")
        .eq("client_id", clientId)
        .lt("snapshot_date", date)
        .order("snapshot_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (prevSnapshot) {
        updateData.daily_return =
          ((body.totalValue - prevSnapshot.total_value) / prevSnapshot.total_value) * 100;
      }

      // Obtener primer snapshot para calcular retorno acumulado
      const { data: firstSnapshot } = await supabase
        .from("portfolio_snapshots")
        .select("total_value")
        .eq("client_id", clientId)
        .order("snapshot_date", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (firstSnapshot) {
        updateData.cumulative_return =
          ((body.totalValue - firstSnapshot.total_value) / firstSnapshot.total_value) * 100;
      }
    }

    // Actualizar snapshot
    const { data: snapshot, error } = await supabase
      .from("portfolio_snapshots")
      .update(updateData)
      .eq("id", snapshotId)
      .select()
      .single();

    if (error) {
      console.error("Error updating snapshot:", error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: snapshot,
    });
  } catch (error) {
    console.error("Error in PUT snapshot:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

// DELETE - Eliminar un snapshot
export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const { id: snapshotId } = await context.params;

    // Verificar que el snapshot existe
    const { data: existingSnapshot, error: fetchError } = await supabase
      .from("portfolio_snapshots")
      .select("id")
      .eq("id", snapshotId)
      .single();

    if (fetchError || !existingSnapshot) {
      return NextResponse.json(
        { success: false, error: "Snapshot no encontrado" },
        { status: 404 }
      );
    }

    // Eliminar snapshot
    const { error } = await supabase
      .from("portfolio_snapshots")
      .delete()
      .eq("id", snapshotId);

    if (error) {
      console.error("Error deleting snapshot:", error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error("Error in DELETE snapshot:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
