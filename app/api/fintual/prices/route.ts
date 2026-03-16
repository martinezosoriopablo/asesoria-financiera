// app/api/fintual/prices/route.ts
// Obtiene y almacena precios de fondos desde Fintual

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { getSeriesPrices, calculateReturns, DividendAdjustment } from "@/lib/fintual-api";
import { applyRateLimit } from "@/lib/rate-limit";

// GET: Obtener precios de un fondo
export async function GET(request: NextRequest) {
  const blocked = applyRateLimit(request, "fintual-prices", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    const { searchParams } = new URL(request.url);
    const fintualId = searchParams.get("fintual_id");
    const fundId = searchParams.get("fund_id");
    const fromDate = searchParams.get("from_date");
    const toDate = searchParams.get("to_date") || new Date().toISOString().split("T")[0];
    const days = parseInt(searchParams.get("days") || "30");

    // Parámetros opcionales para ajuste de dividendos
    const hasDividend = searchParams.get("has_dividend") === "true";
    const dividendYield = searchParams.get("dividend_yield");
    const dividendDate = searchParams.get("dividend_date");

    const dividendAdjustment: DividendAdjustment | undefined = hasDividend
      ? {
          has_dividend: true,
          dividend_yield: dividendYield ? parseFloat(dividendYield) : undefined,
          dividend_date: dividendDate || undefined,
        }
      : undefined;

    if (!fintualId && !fundId) {
      return NextResponse.json(
        { success: false, error: "Se requiere fintual_id o fund_id" },
        { status: 400 }
      );
    }

    // Si se proporciona fund_id, buscar el fintual_id
    let targetFintualId = fintualId;
    if (!targetFintualId && fundId) {
      const { data: fund } = await supabase
        .from("fintual_funds")
        .select("fintual_id")
        .eq("id", fundId)
        .single();

      if (!fund) {
        return NextResponse.json(
          { success: false, error: "Fondo no encontrado" },
          { status: 404 }
        );
      }
      targetFintualId = fund.fintual_id;
    }

    // Calcular fecha de inicio si no se proporciona
    const startDate =
      fromDate ||
      new Date(Date.now() - days * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];

    // Obtener precios de Fintual
    const prices = await getSeriesPrices(targetFintualId!, startDate, toDate);

    if (prices.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          fintualId: targetFintualId,
          prices: [],
          returns: {},
        },
      });
    }

    // Calcular rentabilidades (con ajuste de dividendos si se proporciona)
    const returns = calculateReturns(prices, dividendAdjustment);

    // Formatear datos
    const formattedPrices = prices.map((p) => ({
      date: p.attributes.date,
      price: p.attributes.price,
      nav: p.attributes.net_asset_value,
      patrimony: p.attributes.total_net_assets,
      shareholders: p.attributes.shareholders,
    }));

    return NextResponse.json({
      success: true,
      data: {
        fintualId: targetFintualId,
        prices: formattedPrices,
        returns,
        latestPrice: formattedPrices[0],
        dividendAdjustment: dividendAdjustment || null,
      },
    });
  } catch (error) {
    console.error("Error fetching prices:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    );
  }
}

// POST: Sincronizar precios de uno o varios fondos
export async function POST(request: NextRequest) {
  const blocked = applyRateLimit(request, "fintual-prices-sync", { limit: 5, windowSeconds: 60 });
  if (blocked) return blocked;

  const { error: authError2 } = await requireAdvisor();
  if (authError2) return authError2;

  const supabase = createAdminClient();

  try {
    const body = await request.json();
    const { fintual_ids, days = 365 } = body;

    if (!fintual_ids || !Array.isArray(fintual_ids) || fintual_ids.length === 0) {
      // Si no se especifican IDs, sincronizar todos los fondos
      const { data: funds } = await supabase
        .from("fintual_funds")
        .select("fintual_id")
        .limit(100); // Limitar para evitar timeout

      if (!funds || funds.length === 0) {
        return NextResponse.json(
          { success: false, error: "No hay fondos para sincronizar" },
          { status: 400 }
        );
      }

      body.fintual_ids = funds.map((f) => f.fintual_id);
    }

    const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    const toDate = new Date().toISOString().split("T")[0];

    const results = {
      synced: 0,
      errors: [] as string[],
      pricesAdded: 0,
    };

    for (const fintualId of body.fintual_ids) {
      try {
        const prices = await getSeriesPrices(fintualId, fromDate, toDate);

        if (prices.length === 0) {
          continue;
        }

        // Preparar datos para insertar
        const priceRecords = prices.map((p) => ({
          fintual_fund_id: fintualId,
          date: p.attributes.date,
          price: p.attributes.price,
          nav: p.attributes.net_asset_value,
          total_assets: p.attributes.total_assets,
          patrimony: p.attributes.total_net_assets,
          shares_outstanding: p.attributes.outstanding_shares,
          shareholders: p.attributes.shareholders,
        }));

        // Insertar precios (ignorar duplicados)
        const { error } = await supabase
          .from("fintual_prices")
          .upsert(priceRecords, {
            onConflict: "fintual_fund_id,date",
            ignoreDuplicates: true,
          });

        if (error) {
          console.error(`Error inserting prices for ${fintualId}:`, error);
          results.errors.push(`${fintualId}: ${error.message}`);
        } else {
          results.pricesAdded += priceRecords.length;
        }

        // Actualizar último precio en fintual_funds
        const latestPrice = prices.sort((a, b) =>
          b.attributes.date.localeCompare(a.attributes.date)
        )[0];

        await supabase
          .from("fintual_funds")
          .update({
            last_price: latestPrice.attributes.price,
            last_price_date: latestPrice.attributes.date,
            updated_at: new Date().toISOString(),
          })
          .eq("fintual_id", fintualId);

        results.synced++;
      } catch (err) {
        const errMsg = `Error syncing ${fintualId}: ${err}`;
        console.error(errMsg);
        results.errors.push(errMsg);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Sincronizados ${results.synced} fondos`,
      results,
    });
  } catch (error) {
    console.error("Error in price sync:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    );
  }
}
