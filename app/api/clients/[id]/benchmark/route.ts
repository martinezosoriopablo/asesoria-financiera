// app/api/clients/[id]/benchmark/route.ts

import { NextRequest } from "next/server";
import { requireClientAccess, createAdminClient } from "@/lib/auth/api-auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { handleApiError } from "@/lib/api-response";
import type { BenchmarkComponent } from "@/lib/prices/types";

// Default benchmark: UF + 2%
const DEFAULT_BENCHMARK: BenchmarkComponent[] = [
  { ticker: "UF", weight: 1.0, spread: 2.0 },
];

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleApiError("benchmark-get", async () => {
    const { id: clientId } = await params;
    const { error } = await requireClientAccess(clientId);
    if (error) return error;

    const supabase = createAdminClient();

    const { data, error: dbError } = await supabase
      .from("clients")
      .select("benchmark_config, benchmark_mode")
      .eq("id", clientId)
      .single();

    if (dbError) return errorResponse("Cliente no encontrado", 404);

    return successResponse({
      benchmark: (data.benchmark_config as BenchmarkComponent[] | null) || DEFAULT_BENCHMARK,
      benchmark_mode: (data.benchmark_mode as string | null) || "uf_spread",
    });
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleApiError("benchmark-put", async () => {
    const { id: clientId } = await params;
    const { error } = await requireClientAccess(clientId);
    if (error) return error;

    const body = await request.json();
    const { benchmark, benchmark_mode } = body as {
      benchmark?: BenchmarkComponent[];
      benchmark_mode?: "uf_spread" | "market_proxy";
    };

    const update: Record<string, unknown> = {};

    if (benchmark !== undefined) {
      if (!Array.isArray(benchmark) || benchmark.length === 0) {
        return errorResponse("benchmark debe ser un array no vacío", 400);
      }
      const totalWeight = benchmark.reduce((s, b) => s + (b.weight || 0), 0);
      if (Math.abs(totalWeight - 1.0) > 0.01) {
        return errorResponse(`Los pesos deben sumar 1.0 (actual: ${totalWeight.toFixed(2)})`, 400);
      }
      for (const b of benchmark) {
        if (!b.ticker || typeof b.weight !== "number") {
          return errorResponse("Cada componente requiere ticker y weight", 400);
        }
      }
      update.benchmark_config = benchmark;
    }

    if (benchmark_mode !== undefined) {
      if (benchmark_mode !== "uf_spread" && benchmark_mode !== "market_proxy") {
        return errorResponse("benchmark_mode inválido", 400);
      }
      update.benchmark_mode = benchmark_mode;
    }

    if (Object.keys(update).length === 0) {
      return errorResponse("Nada que actualizar", 400);
    }

    const supabase = createAdminClient();
    const { error: dbError } = await supabase
      .from("clients")
      .update(update)
      .eq("id", clientId);

    if (dbError) return errorResponse("Error al guardar benchmark", 500);

    return successResponse({ benchmark, benchmark_mode });
  });
}
