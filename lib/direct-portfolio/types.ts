// lib/direct-portfolio/types.ts
// Tipos para el módulo de portafolios directos

export type HoldingType = "stock_us" | "stock_cl" | "bond" | "etf";
export type AssetClass = "renta_variable" | "renta_fija";
export type RiskProfile = "defensivo" | "moderado" | "crecimiento" | "agresivo";

export interface DirectPortfolioHolding {
  id: string;
  portfolio_id: string;
  tipo: HoldingType;
  ticker: string | null;
  nombre: string;
  cantidad: number;
  precio_compra: number | null;
  fecha_compra: string | null;
  // Campos específicos para bonos
  cupon: number | null;
  vencimiento: string | null;
  valor_nominal: number | null;
  cusip: string | null;
  isin: string | null;
  created_at: string;
  updated_at?: string;
  // Campos calculados (del frontend)
  precio_actual?: number;
  valor_mercado?: number;
  ganancia_perdida?: number;
  peso_portafolio?: number;
}

export interface DirectPortfolio {
  id: string;
  advisor_id: string;
  client_id: string | null;
  nombre: string;
  perfil_riesgo: RiskProfile | null;
  descripcion: string | null;
  moneda: string;
  status: "activo" | "inactivo";
  created_at: string;
  updated_at: string;
  // Relaciones
  clients?: {
    id: string;
    nombre: string;
    apellido: string;
    email: string;
    perfil_riesgo?: string;
    puntaje_riesgo?: number;
  } | null;
  direct_portfolio_holdings?: DirectPortfolioHolding[];
}

export interface SecurityQuote {
  ticker: string;
  name: string;
  price: number;
  previousClose?: number;
  change?: number;
  changePercent?: number;
  currency: string;
  exchange: string;
  type: HoldingType;
  lastUpdate?: string;
  fromCache?: boolean;
}

export interface SecuritySearchResult {
  ticker: string;
  name: string;
  type: HoldingType;
  exchange: string;
  exchangeName: string;
}

// Bandas de riesgo para portafolios directos
export interface RiskBands {
  rentaFija: { min: number; max: number };
  rentaVariable: { min: number; max: number };
}

export const RISK_BANDS: Record<RiskProfile, RiskBands> = {
  defensivo: {
    rentaFija: { min: 70, max: 90 },
    rentaVariable: { min: 10, max: 30 },
  },
  moderado: {
    rentaFija: { min: 40, max: 60 },
    rentaVariable: { min: 40, max: 60 },
  },
  crecimiento: {
    rentaFija: { min: 20, max: 40 },
    rentaVariable: { min: 60, max: 80 },
  },
  agresivo: {
    rentaFija: { min: 0, max: 20 },
    rentaVariable: { min: 80, max: 100 },
  },
};

// Clasificar holding en clase de activo
export function getAssetClass(tipo: HoldingType): AssetClass {
  if (tipo === "bond") {
    return "renta_fija";
  }
  return "renta_variable"; // stock_us, stock_cl, etf
}

// Calcular YTM (Yield to Maturity) simplificado para bonos
export function calculateYTM(
  precioCompra: number,
  valorNominal: number,
  cuponAnual: number,
  añosHastaVencimiento: number
): number {
  if (añosHastaVencimiento <= 0) return 0;

  // Fórmula simplificada de YTM aproximado
  // YTM ≈ (C + (F - P) / n) / ((F + P) / 2)
  // C = cupón anual, F = valor nominal, P = precio, n = años
  const C = valorNominal * (cuponAnual / 100);
  const F = valorNominal;
  const P = precioCompra;
  const n = añosHastaVencimiento;

  const ytm = (C + (F - P) / n) / ((F + P) / 2) * 100;
  return ytm;
}

// Calcular duración modificada (Macaulay simplificada)
export function calculateDuration(
  cuponAnual: number,
  añosHastaVencimiento: number,
  ytm: number
): number {
  if (añosHastaVencimiento <= 0 || ytm <= 0) return añosHastaVencimiento;

  // Duración Macaulay simplificada para bono con cupón
  const y = ytm / 100;
  const c = cuponAnual / 100;
  const n = añosHastaVencimiento;

  // Para cupón > 0
  if (c > 0) {
    const duration = (1 + y) / y - (1 + y + n * (c - y)) / (c * (Math.pow(1 + y, n) - 1) + y);
    return Math.max(0, Math.min(duration, n));
  }

  // Para cupón cero
  return n;
}

// Formatear moneda
export function formatCurrency(amount: number, currency: string = "USD"): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

// Formatear porcentaje
export function formatPercent(value: number, decimals: number = 2): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(decimals)}%`;
}
