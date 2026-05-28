// app/api/clients/[id]/benchmark/route.ts

import { NextRequest } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
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
    const { error } = await requireAdvisor();
    if (error) return error;

    const { id: clientId } = await params;
    const supabase = createAdminClient();

    const { data, error: dbError } = await supabase
      .from("clients")
      .select("benchmark_config")
      .eq("id", clientId)
      .single();

    if (dbError) return errorResponse("Cliente no encontrado", 404);

    return successResponse({
      benchmark: (data.benchmark_config as BenchmarkComponent[] | null) || DEFAULT_BENCHMARK,
    });
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleApiError("benchmark-put", async () => {
    const { error } = await requireAdvisor();
    if (error) return error;

    const { id: clientId } = await params;
    const body = await request.json();
    const { benchmark } = body as { benchmark: BenchmarkComponent[] };

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

    const supabase = createAdminClient();
    const { error: dbError } = await supabase
      .from("clients")
      .update({ benchmark_config: benchmark })
      .eq("id", clientId);

    if (dbError) return errorResponse("Error al guardar benchmark", 500);

    return successResponse({ benchmark });
  });
}
