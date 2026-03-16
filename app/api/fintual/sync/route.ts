// app/api/fintual/sync/route.ts
// Sincroniza datos de fondos mutuos desde la API de Fintual

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import {
  getProviders,
  getProviderFunds,
  getFundSeries,
} from "@/lib/fintual-api";
import { applyRateLimit } from "@/lib/rate-limit";

interface SyncResult {
  providers: number;
  funds: number;
  series: number;
  errors: string[];
}

// POST: Sincronizar catálogo completo de fondos
export async function POST(request: NextRequest) {
  const blocked = applyRateLimit(request, "sync-fintual", { limit: 5, windowSeconds: 60 });
  if (blocked) return blocked;

  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    const { searchParams } = new URL(request.url);
    const providerId = searchParams.get("provider_id");
    const fullSync = searchParams.get("full") === "true";

    const result: SyncResult = {
      providers: 0,
      funds: 0,
      series: 0,
      errors: [],
    };

    // Obtener proveedores
    const providers = await getProviders();
    result.providers = providers.length;

    // Filtrar proveedores chilenos de fondos mutuos (excluir ETFs internacionales, etc.)
    const chileanProviders = providers.filter((p) => {
      const name = p.attributes.name.toLowerCase();
      return (
        name.includes("agf") ||
        name.includes("bci") ||
        name.includes("santander") ||
        name.includes("itau") ||
        name.includes("itaú") ||
        name.includes("security") ||
        name.includes("banchile") ||
        name.includes("larrainvial") ||
        name.includes("larrain") ||
        name.includes("sura") ||
        name.includes("principal") ||
        name.includes("scotiabank") ||
        name.includes("credicorp") ||
        name.includes("btg") ||
        name.includes("bice") ||
        name.includes("fintual") ||
        name.includes("bancoestado") ||
        name.includes("compass") ||
        name.includes("euroamerica") ||
        name.includes("zurich") ||
        name.includes("moneda") ||
        name.includes("nevasa")
      );
    });

    // Si se especifica un proveedor, solo sincronizar ese
    const providersToSync = providerId
      ? chileanProviders.filter((p) => p.id === providerId)
      : fullSync
      ? chileanProviders
      : chileanProviders.slice(0, 5); // Por defecto solo los primeros 5

    for (const provider of providersToSync) {
      try {
        // Guardar/actualizar proveedor
        await supabase.from("fintual_providers").upsert(
          {
            fintual_id: provider.id,
            name: provider.attributes.name,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "fintual_id" }
        );

        // Obtener fondos del proveedor
        const funds = await getProviderFunds(provider.id);

        for (const fund of funds) {
          try {
            // Obtener series del fondo
            const series = await getFundSeries(fund.id);

            for (const serie of series) {
              result.series++;

              // Extraer RUN del símbolo si existe (ej: "FFMM-8177-A")
              let run = serie.attributes.run;
              if (!run && serie.attributes.symbol) {
                const match = serie.attributes.symbol.match(/(\d{4,6})/);
                if (match) run = match[1];
              }

              // Guardar en la tabla de fondos de Fintual
              await supabase.from("fintual_funds").upsert(
                {
                  fintual_id: serie.id,
                  conceptual_asset_id: fund.id,
                  provider_id: provider.id,
                  provider_name: provider.attributes.name,
                  fund_name: fund.attributes.name,
                  serie_name: serie.attributes.name,
                  symbol: serie.attributes.symbol,
                  run: run,
                  currency: serie.attributes.currency || "CLP",
                  last_price: serie.attributes.last_value,
                  last_price_date: serie.attributes.last_day,
                  updated_at: new Date().toISOString(),
                },
                { onConflict: "fintual_id" }
              );
            }

            result.funds++;
          } catch (fundError) {
            const errMsg = `Error syncing fund ${fund.attributes.name}: ${fundError}`;
            console.error(errMsg);
            result.errors.push(errMsg);
          }
        }
      } catch (providerError) {
        const errMsg = `Error syncing provider ${provider.attributes.name}: ${providerError}`;
        console.error(errMsg);
        result.errors.push(errMsg);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Sincronización completada",
      result,
    });
  } catch (error) {
    console.error("Error in Fintual sync:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    );
  }
}

// GET: Obtener estado de la sincronización
export async function GET(request: NextRequest) {
  const blocked = applyRateLimit(request, "fintual-sync-status", { limit: 30, windowSeconds: 60 });
  if (blocked) return blocked;

  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    // Contar registros
    const { count: providersCount } = await supabase
      .from("fintual_providers")
      .select("*", { count: "exact", head: true });

    const { count: fundsCount } = await supabase
      .from("fintual_funds")
      .select("*", { count: "exact", head: true });

    // Obtener última actualización
    const { data: lastUpdate } = await supabase
      .from("fintual_funds")
      .select("updated_at")
      .order("updated_at", { ascending: false })
      .limit(1)
      .single();

    return NextResponse.json({
      success: true,
      stats: {
        providers: providersCount || 0,
        funds: fundsCount || 0,
        lastUpdate: lastUpdate?.updated_at || null,
      },
    });
  } catch (error) {
    console.error("Error getting sync status:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    );
  }
}
