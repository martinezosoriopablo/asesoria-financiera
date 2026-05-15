// app/api/tax/simulate/route.ts
import { NextRequest } from "next/server";
import { requireAdvisor } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";
import { runAllScenarios } from "@/lib/tax/scenarios";
import type { TaxSimulatorInputs } from "@/lib/tax/types";

export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "tax-simulate", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  return handleApiError("tax-simulate", async () => {
    const body = await request.json() as {
      inputs: TaxSimulatorInputs;
      utaValueUF?: number;
      ufValue?: number;
    };

    if (!body.inputs || !body.inputs.holdings || body.inputs.holdings.length === 0) {
      return errorResponse("Se requieren holdings para simular", 400);
    }

    const utaValueUF = body.utaValueUF ?? 7.5;
    const ufValue = body.ufValue ?? 38000;

    const scenarios = runAllScenarios(body.inputs, utaValueUF, ufValue);
    const recommended = scenarios.find(s => s.recomendado)?.nombre.charAt(0) ?? "D";

    return successResponse({
      scenarios,
      recommended,
      taxMap: body.inputs.holdings,
    });
  });
}
