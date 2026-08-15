// app/api/portal/patrimonio/route.ts
import { NextRequest } from "next/server";
import { requireClient } from "@/lib/auth/require-client";
import { createAdminClient } from "@/lib/auth/api-auth";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";
import { applyRateLimit } from "@/lib/rate-limit";
import { getCurrentRates } from "@/lib/bcch";
import { computePatrimonioSummary } from "@/lib/patrimonio/summary";

export async function GET(request: NextRequest) {
  const rl = await applyRateLimit(request, "portal-patrimonio", { limit: 60 });
  if (rl) return rl;

  const { client, error } = await requireClient();
  if (error) return error;

  return handleApiError("portal-patrimonio", async () => {
    const supabase = createAdminClient();
    const id = client!.id;
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

    const rates = await getCurrentRates(); // { usd, uf, ... } (sin eur)
    const portfolioCLP = (!snap.error && snap.data?.total_value != null) ? Number(snap.data.total_value) : null;

    // Strip advisor-internal fields before sending to client
    const strip = (rows: Record<string, unknown>[] | null) =>
      (rows ?? []).map(({ notas: _n, created_by: _c, ...rest }) => rest) as any[];
    const seguros = strip(seg.data);
    const inmuebles = strip(inm.data);
    const activos = strip(act.data);

    const resumen = computePatrimonioSummary(
      { seguros, inmuebles, activos },
      portfolioCLP,
      { usd: rates.usd, eur: 0, uf: rates.uf }
    );

    return successResponse({
      seguros,
      inmuebles,
      activos,
      resumen,
      rates: { usd: rates.usd, eur: 0, uf: rates.uf },
    });
  });
}
