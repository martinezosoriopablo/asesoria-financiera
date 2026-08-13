// lib/patrimonio/summary.ts
import { toCLP, ExchangeRates } from "@/lib/portfolio/currency";
import type { PatrimonioData, Inmueble, ActivoFinanciero, Seguro } from "./types";

export interface PatrimonioSummary {
  activos: {
    portafolio: number;
    inmuebles_inversion: number;
    casa_habitacion: number;
    apv: number;
    afp: number;
    cuenta_ahorro: number;
    otro_financiero: number;
    ahorro_seguros: number;
    total: number;
  };
  pasivos: { credito_total: number; credito_casa_habitacion: number };
  patrimonioNeto: number;        // incluye casa habitación
  patrimonioInvertible: number;  // sin casa ni su hipoteca
  flujoPasivoMensual: number;
  portafolioDisponible: boolean;
}

/** Convierte un par (monto, moneda) a CLP; null/undefined → 0. */
function clp(monto: number | null | undefined, moneda: string | null | undefined, rates: ExchangeRates): number {
  if (monto === null || monto === undefined) return 0;
  return toCLP(monto, moneda ?? "CLP", rates);
}

function sum<T>(arr: T[], fn: (x: T) => number): number {
  return arr.reduce((acc, x) => acc + fn(x), 0);
}

export function computePatrimonioSummary(
  items: PatrimonioData,
  portfolioCLP: number | null,
  rates: ExchangeRates
): PatrimonioSummary {
  const seguros: Seguro[] = items.seguros ?? [];
  const inmuebles: Inmueble[] = items.inmuebles ?? [];
  const activos: ActivoFinanciero[] = items.activos ?? [];

  const inmuebles_inversion = sum(
    inmuebles.filter((i) => i.tipo === "inversion"),
    (i) => clp(i.valor_estimado_venta_monto, i.valor_estimado_venta_moneda, rates)
  );
  const casa_habitacion = sum(
    inmuebles.filter((i) => i.tipo === "habitacion"),
    (i) => clp(i.valor_estimado_venta_monto, i.valor_estimado_venta_moneda, rates)
  );
  const bySaldo = (tipos: string[]) =>
    sum(activos.filter((a) => tipos.includes(a.tipo)), (a) => clp(a.saldo_monto, a.saldo_moneda, rates));
  const apv = bySaldo(["apv"]);
  const afp = bySaldo(["afp"]);
  const cuenta_ahorro = bySaldo(["cuenta_ahorro"]);
  const otro_financiero = bySaldo(["ahorro_periodico", "otro"]);
  const ahorro_seguros = sum(seguros, (s) => clp(s.componente_ahorro_monto, s.componente_ahorro_moneda, rates));
  const portafolio = portfolioCLP ?? 0;

  const total =
    portafolio + inmuebles_inversion + casa_habitacion + apv + afp + cuenta_ahorro + otro_financiero + ahorro_seguros;

  const credito_total = sum(
    inmuebles.filter((i) => i.tiene_credito),
    (i) => clp(i.credito_saldo_monto, i.credito_saldo_moneda, rates)
  );
  const credito_casa_habitacion = sum(
    inmuebles.filter((i) => i.tipo === "habitacion" && i.tiene_credito),
    (i) => clp(i.credito_saldo_monto, i.credito_saldo_moneda, rates)
  );

  const patrimonioNeto = total - credito_total;
  const patrimonioInvertible = patrimonioNeto - (casa_habitacion - credito_casa_habitacion);

  const flujoPasivoMensual = sum(
    inmuebles.filter((i) => i.se_arrienda),
    (i) => clp(i.arriendo_monto, i.arriendo_moneda, rates) - (i.tiene_credito ? clp(i.credito_cuota_monto, i.credito_cuota_moneda, rates) : 0)
  );

  return {
    activos: { portafolio, inmuebles_inversion, casa_habitacion, apv, afp, cuenta_ahorro, otro_financiero, ahorro_seguros, total },
    pasivos: { credito_total, credito_casa_habitacion },
    patrimonioNeto,
    patrimonioInvertible,
    flujoPasivoMensual,
    portafolioDisponible: portfolioCLP !== null && portfolioCLP !== undefined,
  };
}
