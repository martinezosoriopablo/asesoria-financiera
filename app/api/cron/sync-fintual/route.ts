// app/api/cron/sync-fintual/route.ts
// Cron job para sincronizar catálogo y precios de fondos desde Fintual
// Ejecutado diariamente por Vercel Cron o manualmente por un admin

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/auth/api-auth";
import {
  getProviders,
  getProviderFunds,
  getFundSeries,
  getSeriesPrices,
} from "@/lib/fintual-api";

// Lista de proveedores chilenos conocidos
const CHILEAN_PROVIDER_KEYWORDS = [
  "agf", "bci", "santander", "itau", "itaú", "security", "banchile",
  "larrainvial", "larrain", "sura", "principal", "scotiabank", "credicorp",
  "btg", "bice", "fintual", "bancoestado", "compass", "euroamerica",
  "zurich", "moneda", "nevasa",
];

function isChileanProvider(name: string): boolean {
  const lower = name.toLowerCase();
  return CHILEAN_PROVIDER_KEYWORDS.some((kw) => lower.includes(kw));
}

export const maxDuration = 300; // 5 minutos max (Vercel Pro)
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Verificar que viene de Vercel Cron o de un admin
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const startTime = Date.now();

  const result = {
    phase: "catalog",
    providers: 0,
    fundsProcessed: 0,
    seriesUpserted: 0,
    pricesFetched: 0,
    pricesUpserted: 0,
    errors: [] as string[],
    durationMs: 0,
  };

  try {
    // =============================================
    // FASE 1: Sincronizar catálogo (proveedores + fondos + series)
    // Collect all rows first, then batch upsert per table
    // =============================================
    const providers = await getProviders();
    const chileanProviders = providers.filter((p) =>
      isChileanProvider(p.attributes.name)
    );
    result.providers = chileanProviders.length;

    const allProviderRows: Record<string, unknown>[] = [];
    const allFundRows: Record<string, unknown>[] = [];

    for (const provider of chileanProviders) {
      try {
        allProviderRows.push({
          fintual_id: provider.id,
          name: provider.attributes.name,
          updated_at: new Date().toISOString(),
        });

        // Obtener fondos
        const funds = await getProviderFunds(provider.id);

        for (const fund of funds) {
          try {
            const series = await getFundSeries(fund.id);

            for (const serie of series) {
              let run = serie.attributes.run;
              if (!run && serie.attributes.symbol) {
                const match = serie.attributes.symbol.match(/(\d{4,6})/);
                if (match) run = match[1];
              }

              allFundRows.push({
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
              });
              result.seriesUpserted++;
            }
            result.fundsProcessed++;
          } catch (fundError) {
            result.errors.push(
              `Fund ${fund.attributes.name}: ${fundError}`
            );
          }
        }
      } catch (providerError) {
        result.errors.push(
          `Provider ${provider.attributes.name}: ${providerError}`
        );
      }
    }

    // Batch upsert providers
    if (allProviderRows.length > 0) {
      const { error } = await supabase
        .from("fintual_providers")
        .upsert(allProviderRows, { onConflict: "fintual_id" });
      if (error) {
        result.errors.push(`Batch upsert fintual_providers: ${error.message}`);
      }
    }

    // Batch upsert funds (Supabase has a row limit per request, chunk at 1000)
    const UPSERT_CHUNK_SIZE = 1000;
    for (let i = 0; i < allFundRows.length; i += UPSERT_CHUNK_SIZE) {
      const chunk = allFundRows.slice(i, i + UPSERT_CHUNK_SIZE);
      const { error } = await supabase
        .from("fintual_funds")
        .upsert(chunk, { onConflict: "fintual_id" });
      if (error) {
        result.errors.push(`Batch upsert fintual_funds (chunk ${i}): ${error.message}`);
      }
    }

    // =============================================
    // FASE 2: Sincronizar precios recientes (últimos 7 días)
    // Collect all price rows and fund updates, then batch upsert
    // =============================================
    result.phase = "prices";

    const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    const toDate = new Date().toISOString().split("T")[0];

    // Obtener todos los fondos de la DB
    const { data: allFunds } = await supabase
      .from("fintual_funds")
      .select("fintual_id")
      .order("updated_at", { ascending: false });

    const allPriceRows: Record<string, unknown>[] = [];
    const allFundUpdates: Record<string, unknown>[] = [];

    if (allFunds) {
      // Procesar en lotes de 20 para no exceder rate limits de Fintual
      const batchSize = 20;
      for (let i = 0; i < allFunds.length; i += batchSize) {
        const batch = allFunds.slice(i, i + batchSize);

        // Verificar si nos acercamos al timeout (4 min max para dejar margen)
        if (Date.now() - startTime > 240_000) {
          result.errors.push(
            `Timeout alcanzado. Procesados ${result.pricesFetched}/${allFunds.length} fondos.`
          );
          break;
        }

        await Promise.all(
          batch.map(async (fund) => {
            try {
              const prices = await getSeriesPrices(
                fund.fintual_id,
                fromDate,
                toDate
              );
              result.pricesFetched++;

              if (prices.length === 0) return;

              for (const p of prices) {
                allPriceRows.push({
                  fintual_fund_id: fund.fintual_id,
                  date: p.attributes.date,
                  price: p.attributes.price,
                  nav: p.attributes.net_asset_value,
                  total_assets: p.attributes.total_assets,
                  patrimony: p.attributes.total_net_assets,
                  shares_outstanding: p.attributes.outstanding_shares,
                  shareholders: p.attributes.shareholders,
                });
              }
              result.pricesUpserted += prices.length;

              // Track latest price for fund update
              const latest = prices.sort((a, b) =>
                b.attributes.date.localeCompare(a.attributes.date)
              )[0];

              allFundUpdates.push({
                fintual_id: fund.fintual_id,
                last_price: latest.attributes.price,
                last_price_date: latest.attributes.date,
                updated_at: new Date().toISOString(),
              });
            } catch (err) {
              result.errors.push(`Prices ${fund.fintual_id}: ${err}`);
            }
          })
        );
      }
    }

    // Batch upsert all prices
    for (let i = 0; i < allPriceRows.length; i += UPSERT_CHUNK_SIZE) {
      const chunk = allPriceRows.slice(i, i + UPSERT_CHUNK_SIZE);
      const { error } = await supabase
        .from("fintual_prices")
        .upsert(chunk, {
          onConflict: "fintual_fund_id,date",
          ignoreDuplicates: true,
        });
      if (error) {
        result.errors.push(`Batch upsert fintual_prices (chunk ${i}): ${error.message}`);
      }
    }

    // Batch upsert fund last_price updates
    if (allFundUpdates.length > 0) {
      for (let i = 0; i < allFundUpdates.length; i += UPSERT_CHUNK_SIZE) {
        const chunk = allFundUpdates.slice(i, i + UPSERT_CHUNK_SIZE);
        const { error } = await supabase
          .from("fintual_funds")
          .upsert(chunk, { onConflict: "fintual_id" });
        if (error) {
          result.errors.push(`Batch upsert fintual_funds prices (chunk ${i}): ${error.message}`);
        }
      }
    }

    result.phase = "done";
    result.durationMs = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      message: `Sync completado: ${result.providers} proveedores, ${result.fundsProcessed} fondos, ${result.seriesUpserted} series, ${result.pricesFetched} precios consultados`,
      result,
    });
  } catch (error) {
    result.durationMs = Date.now() - startTime;
    console.error("Cron sync-fintual error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Error desconocido",
        result,
      },
      { status: 500 }
    );
  }
}
