// app/api/portfolio/snapshots/[id]/route.ts
// API para operaciones CRUD en snapshots individuales

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient, getSubordinateAdvisorIds } from "@/lib/auth/api-auth";
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

/** Check if advisor owns the client associated with a snapshot */
async function checkSnapshotOwnership(
  supabase: ReturnType<typeof createAdminClient>,
  clientId: string,
  advisor: { id: string; rol: string }
) {
  const { data: client } = await supabase
    .from("clients")
    .select("id, asesor_id")
    .eq("id", clientId)
    .single();

  if (!client) return { ok: false as const, status: 404, error: "Cliente no encontrado" };

  if (client.asesor_id && client.asesor_id !== advisor.id) {
    if (advisor.rol === "admin") {
      const allowedIds = await getSubordinateAdvisorIds(advisor.id);
      if (!allowedIds.includes(client.asesor_id)) {
        return { ok: false as const, status: 403, error: "No autorizado" };
      }
    } else {
      return { ok: false as const, status: 403, error: "No autorizado" };
    }
  }

  return { ok: true as const };
}

// GET - Obtener un snapshot específico
export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  const blocked = applyRateLimit(request, "snapshot-get", { limit: 30, windowSeconds: 60 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    const { id: snapshotId } = await context.params;

    const { data: snapshot, error } = await supabase
      .from("portfolio_snapshots")
      .select("*")
      .eq("id", snapshotId)
      .single();

    if (error || !snapshot) {
      return NextResponse.json(
        { success: false, error: "Snapshot no encontrado" },
        { status: 404 }
      );
    }

    // Verify client ownership
    const access = await checkSnapshotOwnership(supabase, snapshot.client_id, advisor!);
    if (!access.ok) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
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

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
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

    // Verify client ownership
    const access = await checkSnapshotOwnership(supabase, existingSnapshot.client_id, advisor!);
    if (!access.ok) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
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

    // Atomically recalculate returns if total_value changed
    if (body.totalValue !== undefined) {
      const { error: rpcError } = await supabase.rpc(
        "calculate_snapshot_returns",
        {
          p_snapshot_id: snapshotId,
          p_total_value: body.totalValue,
        }
      );

      if (rpcError) {
        console.error("Error calculating snapshot returns:", rpcError);
        // Non-fatal: the snapshot was saved, returns just weren't updated
      } else {
        // Re-fetch the snapshot to include the updated returns
        const { data: refreshed } = await supabase
          .from("portfolio_snapshots")
          .select("*")
          .eq("id", snapshotId)
          .single();

        if (refreshed) {
          return NextResponse.json({
            success: true,
            data: refreshed,
          });
        }
      }
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

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
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

    // Verify client ownership
    const access = await checkSnapshotOwnership(supabase, existingSnapshot.client_id, advisor!);
    if (!access.ok) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
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
