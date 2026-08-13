// app/api/clients/[id]/patrimonio/resumen/route.ts
import { NextRequest } from "next/server";
import { requireClientAccess, createAdminClient } from "@/lib/auth/api-auth";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";
import { applyRateLimit } from "@/lib/rate-limit";
import { getCurrentRates } from "@/lib/bcch";
import { computePatrimonioSummary } from "@/lib/patrimonio/summary";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rl = await applyRateLimit(request, "patrimonio-resumen", { limit: 60 });
  if (rl) return rl;

  const { error } = await requireClientAccess(id);
  if (error) return error;

  return handleApiError("patrimonio-resumen", async () => {
    const supabase = createAdminClient();
    const [seg, inm, act, snap] = await Promise.all([
      supabase.from("client_seguros").select("*").eq("client_id", id),
      supabase.from("client_inmuebles").select("*").eq("client_id", id),
      supabase.from("client_activos_financieros").select("*").eq("client_id", id),
      supabase
        .from("portfolio_snapshots")
        .select("total_value")
        .eq("client_id", id)
        .neq("source", "api-prices")
        .order("snapshot_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (seg.error || inm.error || act.error) return errorResponse("Error al cargar el patrimonio", 500);

    const rates = await getCurrentRates(); // { usd, uf, ... } (getCurrentRates no entrega eur; el feature solo usa CLP/UF/USD)
    const portfolioCLP = snap.data ? Number(snap.data.total_value) : null;

    const summary = computePatrimonioSummary(
      { seguros: seg.data ?? [], inmuebles: inm.data ?? [], activos: act.data ?? [] },
      portfolioCLP,
      { usd: rates.usd, eur: 0, uf: rates.uf }
    );

    return successResponse({ ...summary, rates: { usd: rates.usd, eur: 0, uf: rates.uf } });
  });
}
