// components/portal/patrimonio/PortalPatrimonioResumen.tsx
"use client";
import React, { useState } from "react";
import { fromCLP, ExchangeRates } from "@/lib/portfolio/currency";

type Moneda = "UF" | "CLP" | "USD";
const MONEDAS: Moneda[] = ["UF", "CLP", "USD"];

interface Resumen {
  activos: { portafolio: number; inmuebles_inversion: number; casa_habitacion: number; apv: number; afp: number; cuenta_ahorro: number; otro_financiero: number; ahorro_seguros: number; total: number };
  pasivos: { credito_total: number; credito_casa_habitacion: number };
  patrimonioNeto: number;
  flujoPasivoMensual: number;
  portafolioDisponible: boolean;
}
const CAT_LABELS: Record<string, string> = {
  portafolio: "Portafolio", inmuebles_inversion: "Inmuebles de inversión", casa_habitacion: "Mi casa",
  apv: "APV", afp: "AFP", cuenta_ahorro: "Cuentas de ahorro", otro_financiero: "Otros", ahorro_seguros: "Ahorro en seguros",
};

function fmt(clp: number, m: Moneda, rates: ExchangeRates): string {
  const v = fromCLP(clp, m, rates);
  const dec = m === "CLP" ? 0 : m === "UF" ? 1 : 0;
  return `${v.toLocaleString("es-CL", { minimumFractionDigits: dec, maximumFractionDigits: dec })} ${m}`;
}

export default function PortalPatrimonioResumen({ resumen, rates }: { resumen: Resumen; rates: ExchangeRates }) {
  const [moneda, setMoneda] = useState<Moneda>("UF");
  const flujo = resumen.flujoPasivoMensual;
  const activos = Object.entries(resumen.activos).filter(([k, v]) => k !== "total" && v !== 0) as [string, number][];

  return (
    <div className="rounded-lg border border-gb-border bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center">
        <h2 className="text-sm font-semibold text-gb-black">Resumen de patrimonio</h2>
        <div className="ml-auto flex gap-1">
          {MONEDAS.map((m) => (
            <button key={m} onClick={() => setMoneda(m)}
              className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${moneda === m ? "border-gb-black bg-gb-black text-white" : "border-gb-border bg-white text-gb-gray"}`}>{m}</button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-gb-border p-4">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gb-gray">Patrimonio neto</span>
          <div className="font-mono text-2xl font-semibold text-gb-black">{fmt(resumen.patrimonioNeto, moneda, rates)}</div>
          <div className="mt-1 text-[11px] text-gb-gray">Activos {fmt(resumen.activos.total, moneda, rates)} · Deudas −{fmt(resumen.pasivos.credito_total, moneda, rates)}</div>
        </div>
        <div className="rounded-lg border border-gb-border p-4">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gb-gray">Flujo mensual estimado</span>
          <div className={`font-mono text-2xl font-semibold ${flujo >= 0 ? "text-gb-success" : "text-gb-danger"}`}>{flujo >= 0 ? "+" : "−"}{fmt(Math.abs(flujo), moneda, rates)}</div>
          <div className="mt-1 text-[11px] text-gb-gray">Arriendos netos de dividendos</div>
        </div>
      </div>
      {!resumen.portafolioDisponible && (
        <p className="mt-3 text-[11px] text-gb-gray">Tu portafolio de inversiones aún no está incluido (sin cartola cargada).</p>
      )}
      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-semibold text-gb-info">Ver desglose</summary>
        <div className="mt-2 space-y-1">
          {activos.map(([k, v]) => (
            <div key={k} className="flex justify-between text-xs">
              <span className="text-gb-gray">{CAT_LABELS[k] ?? k}</span>
              <span className="font-mono text-gb-black">{fmt(v, moneda, rates)}</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
