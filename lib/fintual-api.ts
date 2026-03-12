// lib/fintual-api.ts
// Cliente para la API pública de Fintual (fondos mutuos chilenos)

const FINTUAL_API_BASE = "https://fintual.cl/api";

// Tipos de datos de la API de Fintual
export interface FintualProvider {
  id: string;
  type: "asset_provider";
  attributes: {
    name: string;
  };
}

export interface FintualConceptualAsset {
  id: string;
  type: "conceptual_asset";
  attributes: {
    name: string;
    symbol?: string;
    category?: string;
    currency?: string;
    run?: string; // RUN del fondo (código CMF)
    data_source?: string;
  };
}

export interface FintualRealAsset {
  id: string;
  type: "real_asset";
  attributes: {
    name: string;
    symbol?: string; // Ej: "FM-PR-DEUDA-CRT-PLAN1"
    serie?: string;
    run?: string;
    last_day?: string; // Última fecha con datos
    last_value?: number; // Último valor cuota
    currency?: string;
    expense_ratio?: number;
  };
}

export interface FintualDayData {
  id: string;
  type: "real_asset_day";
  attributes: {
    date: string; // YYYY-MM-DD
    price: number; // Valor cuota
    net_asset_value?: number;
    total_assets?: number;
    total_net_assets?: number; // Patrimonio
    outstanding_shares?: number; // Cuotas en circulación
    new_shares?: number;
    redeemed_shares?: number;
    shareholders?: number; // Número de partícipes
    fixed_management_fee?: number;
    variable_management_fee?: number;
    fixed_fee?: number;
    purchase_fee?: number;
    redemption_fee?: number;
  };
}

interface FintualResponse<T> {
  data: T[];
}

// Obtener lista de proveedores (AGFs)
export async function getProviders(): Promise<FintualProvider[]> {
  const response = await fetch(`${FINTUAL_API_BASE}/asset_providers`, {
    headers: { Accept: "application/json" },
    next: { revalidate: 86400 }, // Cache 24 horas
  });

  if (!response.ok) {
    throw new Error(`Fintual API error: ${response.status}`);
  }

  const data: FintualResponse<FintualProvider> = await response.json();
  return data.data;
}

// Obtener fondos de un proveedor
export async function getProviderFunds(providerId: string): Promise<FintualConceptualAsset[]> {
  const response = await fetch(
    `${FINTUAL_API_BASE}/asset_providers/${providerId}/conceptual_assets`,
    {
      headers: { Accept: "application/json" },
      next: { revalidate: 3600 }, // Cache 1 hora
    }
  );

  if (!response.ok) {
    // Algunos proveedores no tienen fondos
    if (response.status === 404) return [];
    throw new Error(`Fintual API error: ${response.status}`);
  }

  const data: FintualResponse<FintualConceptualAsset> = await response.json();
  return data.data;
}

// Obtener series de un fondo (conceptual asset)
export async function getFundSeries(conceptualAssetId: string): Promise<FintualRealAsset[]> {
  const response = await fetch(
    `${FINTUAL_API_BASE}/conceptual_assets/${conceptualAssetId}/real_assets`,
    {
      headers: { Accept: "application/json" },
      next: { revalidate: 3600 },
    }
  );

  if (!response.ok) {
    if (response.status === 404) return [];
    throw new Error(`Fintual API error: ${response.status}`);
  }

  const data: FintualResponse<FintualRealAsset> = await response.json();
  return data.data;
}

// Obtener valores cuota históricos de una serie
export async function getSeriesPrices(
  realAssetId: string,
  fromDate?: string,
  toDate?: string
): Promise<FintualDayData[]> {
  const params = new URLSearchParams();
  if (fromDate) params.set("from_date", fromDate);
  if (toDate) params.set("to_date", toDate);

  const url = `${FINTUAL_API_BASE}/real_assets/${realAssetId}/days${
    params.toString() ? `?${params.toString()}` : ""
  }`;

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 300 }, // Cache 5 minutos
  });

  if (!response.ok) {
    if (response.status === 404) return [];
    throw new Error(`Fintual API error: ${response.status}`);
  }

  const data: FintualResponse<FintualDayData> = await response.json();
  return data.data;
}

// Buscar un fondo por RUN
export async function searchFundByRun(run: string): Promise<FintualRealAsset | null> {
  // La API de Fintual no tiene endpoint de búsqueda directa
  // Tendríamos que buscar en nuestra BD local
  return null;
}

// Obtener el último valor cuota de una serie
export async function getLatestPrice(realAssetId: string): Promise<FintualDayData | null> {
  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const prices = await getSeriesPrices(realAssetId, thirtyDaysAgo, today);

  if (prices.length === 0) return null;

  // Ordenar por fecha descendente y retornar el más reciente
  return prices.sort((a, b) =>
    b.attributes.date.localeCompare(a.attributes.date)
  )[0];
}

// Calcular rentabilidad entre dos fechas
export function calculateReturn(
  startPrice: number,
  endPrice: number
): number {
  if (startPrice <= 0) return 0;
  return ((endPrice - startPrice) / startPrice) * 100;
}

// Calcular rentabilidades para múltiples períodos
export function calculateReturns(
  prices: FintualDayData[]
): {
  rent_1d?: number;
  rent_7d?: number;
  rent_30d?: number;
  rent_90d?: number;
  rent_365d?: number;
  rent_ytd?: number;
} {
  if (prices.length < 2) return {};

  // Ordenar por fecha descendente
  const sorted = [...prices].sort((a, b) =>
    b.attributes.date.localeCompare(a.attributes.date)
  );

  const latestPrice = sorted[0].attributes.price;
  const latestDate = new Date(sorted[0].attributes.date);

  const findPriceAtDaysAgo = (days: number): number | undefined => {
    const targetDate = new Date(latestDate);
    targetDate.setDate(targetDate.getDate() - days);

    // Buscar el precio más cercano a la fecha objetivo
    const closest = sorted.find((p) => {
      const pDate = new Date(p.attributes.date);
      return pDate <= targetDate;
    });

    return closest?.attributes.price;
  };

  const findYTDPrice = (): number | undefined => {
    const startOfYear = new Date(latestDate.getFullYear(), 0, 1);
    const closest = sorted.find((p) => {
      const pDate = new Date(p.attributes.date);
      return pDate <= startOfYear;
    });
    return closest?.attributes.price;
  };

  const results: {
    rent_1d?: number;
    rent_7d?: number;
    rent_30d?: number;
    rent_90d?: number;
    rent_365d?: number;
    rent_ytd?: number;
  } = {};

  const price1d = findPriceAtDaysAgo(1);
  const price7d = findPriceAtDaysAgo(7);
  const price30d = findPriceAtDaysAgo(30);
  const price90d = findPriceAtDaysAgo(90);
  const price365d = findPriceAtDaysAgo(365);
  const priceYTD = findYTDPrice();

  if (price1d) results.rent_1d = calculateReturn(price1d, latestPrice);
  if (price7d) results.rent_7d = calculateReturn(price7d, latestPrice);
  if (price30d) results.rent_30d = calculateReturn(price30d, latestPrice);
  if (price90d) results.rent_90d = calculateReturn(price90d, latestPrice);
  if (price365d) results.rent_365d = calculateReturn(price365d, latestPrice);
  if (priceYTD) results.rent_ytd = calculateReturn(priceYTD, latestPrice);

  return results;
}
