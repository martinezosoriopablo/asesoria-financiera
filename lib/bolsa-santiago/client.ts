// lib/bolsa-santiago/client.ts
// Cliente para la API de la Bolsa de Santiago

const BOLSA_SANTIAGO_BASE_URL = "https://startup.bolsadesantiago.com/api/consulta";
const API_TOKEN = process.env.BOLSA_SANTIAGO_API_TOKEN;

interface BolsaSantiagoInstrumento {
  Nemo: string;
  Nombre: string;
  UltimoPrecio?: number;
  Variacion?: number;
  VariacionPorcentual?: number;
  Moneda?: string;
  FechaHora?: string;
  Volumen?: number;
  MontoTransado?: number;
  PrecioApertura?: number;
  PrecioMaximo?: number;
  PrecioMinimo?: number;
  PrecioCierre?: number;
}

interface BolsaSantiagoResumenAccion {
  Nemo: string;
  Nombre?: string;
  Empresa?: string;
  UltimoPrecio: number;
  Variacion: number;
  VariacionPorcentual: number;
  PrecioApertura?: number;
  PrecioMaximo?: number;
  PrecioMinimo?: number;
  PrecioCierreAnterior?: number;
  Volumen?: number;
  MontoTransado?: number;
  FechaHora?: string;
}

export interface ChileanStock {
  ticker: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  currency: string;
  volume?: number;
  open?: number;
  high?: number;
  low?: number;
  previousClose?: number;
  lastUpdate?: string;
}

async function makeRequest<T>(endpoint: string, body: Record<string, unknown> = {}): Promise<T | null> {
  if (!API_TOKEN) {
    console.error("BOLSA_SANTIAGO_API_TOKEN not configured");
    return null;
  }

  try {
    const url = `${BOLSA_SANTIAGO_BASE_URL}${endpoint}?access_token=${encodeURIComponent(API_TOKEN)}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.error(`Bolsa Santiago API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error calling Bolsa Santiago API:", error);
    return null;
  }
}

/**
 * Obtiene la lista de instrumentos válidos disponibles para operar
 */
export async function getInstrumentosValidos(): Promise<string[]> {
  const data = await makeRequest<{ instrumentos?: string[] }>(
    "/InstrumentosDisponibles/getInstrumentosValidos"
  );
  return data?.instrumentos || [];
}

/**
 * Obtiene información de todos los instrumentos de renta variable
 */
export async function getInstrumentosRV(): Promise<BolsaSantiagoInstrumento[]> {
  const data = await makeRequest<{ instrumentos?: BolsaSantiagoInstrumento[] }>(
    "/ClienteMD/getInstrumentosRV"
  );
  return data?.instrumentos || [];
}

/**
 * Obtiene el resumen detallado de una acción específica
 */
export async function getResumenAccion(nemo: string): Promise<ChileanStock | null> {
  const data = await makeRequest<BolsaSantiagoResumenAccion>(
    "/TickerOnDemand/getResumenAccion",
    { Nemo: nemo.toUpperCase() }
  );

  if (!data || !data.Nemo) {
    return null;
  }

  return {
    ticker: data.Nemo,
    name: data.Nombre || data.Empresa || data.Nemo,
    price: data.UltimoPrecio || 0,
    change: data.Variacion || 0,
    changePercent: data.VariacionPorcentual || 0,
    currency: "CLP",
    volume: data.Volumen,
    open: data.PrecioApertura,
    high: data.PrecioMaximo,
    low: data.PrecioMinimo,
    previousClose: data.PrecioCierreAnterior,
    lastUpdate: data.FechaHora,
  };
}

/**
 * Busca instrumentos chilenos por nombre o nemotécnico
 */
export async function searchChileanStocks(query: string): Promise<ChileanStock[]> {
  const instrumentos = await getInstrumentosRV();

  if (!instrumentos || instrumentos.length === 0) {
    return [];
  }

  const queryUpper = query.toUpperCase();

  // Filtrar por coincidencia en Nemo o Nombre
  const matches = instrumentos.filter((inst) => {
    const nemoMatch = inst.Nemo?.toUpperCase().includes(queryUpper);
    const nombreMatch = inst.Nombre?.toUpperCase().includes(queryUpper);
    return nemoMatch || nombreMatch;
  });

  return matches.slice(0, 15).map((inst) => ({
    ticker: inst.Nemo,
    name: inst.Nombre || inst.Nemo,
    price: inst.UltimoPrecio || 0,
    change: inst.Variacion || 0,
    changePercent: inst.VariacionPorcentual || 0,
    currency: inst.Moneda || "CLP",
    volume: inst.Volumen,
    open: inst.PrecioApertura,
    high: inst.PrecioMaximo,
    low: inst.PrecioMinimo,
    lastUpdate: inst.FechaHora,
  }));
}

// Cache de instrumentos para evitar llamadas repetidas
let instrumentosCache: BolsaSantiagoInstrumento[] | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

export async function getInstrumentosRVCached(): Promise<BolsaSantiagoInstrumento[]> {
  const now = Date.now();

  if (instrumentosCache && (now - cacheTimestamp) < CACHE_DURATION) {
    return instrumentosCache;
  }

  const data = await getInstrumentosRV();
  if (data.length > 0) {
    instrumentosCache = data;
    cacheTimestamp = now;
  }

  return data;
}
