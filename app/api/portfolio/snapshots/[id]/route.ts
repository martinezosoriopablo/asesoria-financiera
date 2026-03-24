// app/api/portfolio/snapshots/[id]/route.ts
// API para operaciones CRUD en snapshots individuales

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { applyRateLimit } from "@/lib/rate-limit";

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
  const blocked = applyRateLimit(request, "snapshot-get", { limit: 30, windowSeconds: 60 });
  if (blocked) return blocked;

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
  const blocked = applyRateLimit(request, "snapshot-put", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

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

    // Helper functions to prevent database overflow
    const clampPercent = (value: number): number => {
      if (!Number.isFinite(value)) return 0;
      return Math.max(-9999.99, Math.min(9999.99, value));
    };

    const clampMoney = (value: number): number => {
      if (!Number.isFinite(value)) return 0;
      return Math.max(-9999999999999999, Math.min(9999999999999999, Math.round(value * 100) / 100));
    };

    // Preparar datos de actualización
    const updateData: Record<string, unknown> = {};

    if (body.snapshotDate) {
      updateData.snapshot_date = body.snapshotDate;
    }

    if (body.totalValue !== undefined) {
      updateData.total_value = clampMoney(body.totalValue);
    }

    if (body.totalCostBasis !== undefined) {
      updateData.total_cost_basis = clampMoney(body.totalCostBasis);
      updateData.unrealized_gain_loss = body.totalValue
        ? clampMoney(body.totalValue - body.totalCostBasis)
        : null;
    }

    if (body.composition) {
      updateData.equity_percent = clampPercent(body.composition.equity?.percent || 0);
      updateData.fixed_income_percent = clampPercent(body.composition.fixedIncome?.percent || 0);
      updateData.alternatives_percent = clampPercent(body.composition.alternatives?.percent || 0);
      updateData.cash_percent = clampPercent(body.composition.cash?.percent || 0);
      updateData.equity_value = clampMoney(body.composition.equity?.value || 0);
      updateData.fixed_income_value = clampMoney(body.composition.fixedIncome?.value || 0);
      updateData.alternatives_value = clampMoney(body.composition.alternatives?.value || 0);
      updateData.cash_value = clampMoney(body.composition.cash?.value || 0);
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

      if (prevSnapshot && prevSnapshot.total_value > 0) {
        updateData.daily_return = clampPercent(
          ((body.totalValue - prevSnapshot.total_value) / prevSnapshot.total_value) * 100
        );
      }

      // Obtener primer snapshot para calcular retorno acumulado
      const { data: firstSnapshot } = await supabase
        .from("portfolio_snapshots")
        .select("total_value")
        .eq("client_id", clientId)
        .order("snapshot_date", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (firstSnapshot && firstSnapshot.total_value > 0) {
        updateData.cumulative_return = clampPercent(
          ((body.totalValue - firstSnapshot.total_value) / firstSnapshot.total_value) * 100
        );
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
  const blocked = applyRateLimit(request, "snapshot-delete", { limit: 5, windowSeconds: 60 });
  if (blocked) return blocked;

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
      .select("id, client_id, snapshot_date, source")
      .eq("id", snapshotId)
      .single();

    if (fetchError || !existingSnapshot) {
      return NextResponse.json(
        { success: false, error: "Snapshot no encontrado" },
        { status: 404 }
      );
    }

    const isCartola = existingSnapshot.source === "manual" ||
      existingSnapshot.source === "statement" ||
      existingSnapshot.source === "excel";

    // If deleting a cartola, also delete api-prices snapshots that depend on it
    // (interpolated snapshots between this cartola and the next one)
    if (isCartola) {
      // Find the next cartola date
      const { data: nextCartola } = await supabase
        .from("portfolio_snapshots")
        .select("snapshot_date")
        .eq("client_id", existingSnapshot.client_id)
        .gt("snapshot_date", existingSnapshot.snapshot_date)
        .in("source", ["manual", "statement", "excel"])
        .order("snapshot_date", { ascending: true })
        .limit(1)
        .maybeSingle();

      // Delete api-prices snapshots between this cartola and the next
      const deleteQuery = supabase
        .from("portfolio_snapshots")
        .delete()
        .eq("client_id", existingSnapshot.client_id)
        .eq("source", "api-prices")
        .gte("snapshot_date", existingSnapshot.snapshot_date);

      if (nextCartola) {
        deleteQuery.lt("snapshot_date", nextCartola.snapshot_date);
      }

      const { error: deleteApiError } = await deleteQuery;
      if (deleteApiError) {
        console.error("Error deleting api-prices snapshots:", deleteApiError);
      }
    }

    // Delete the snapshot itself
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
      deletedRelated: isCartola,
    });
  } catch (error) {
    console.error("Error in DELETE snapshot:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
