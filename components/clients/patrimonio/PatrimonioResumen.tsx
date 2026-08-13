// components/clients/patrimonio/PatrimonioResumen.tsx
"use client";
import React, { useEffect, useState } from "react";
import { Loader, Wallet } from "lucide-react";
import { fromCLP, ExchangeRates } from "@/lib/portfolio/currency";

type Moneda = "UF" | "CLP" | "USD";
const MONEDAS: Moneda[] = ["UF", "CLP", "USD"];

interface Resumen {
  activos: { portafolio: number; inmuebles_inversion: number; casa_habitacion: number; apv: number; afp: number; cuenta_ahorro: number; otro_financiero: number; ahorro_seguros: number; total: number };
  pasivos: { credito_total: number; credito_casa_habitacion: number };
  patrimonioNeto: number;
  patrimonioInvertible: number;
  flujoPasivoMensual: number;
  portafolioDisponible: boolean;
  rates: ExchangeRates;
}

const CAT_LABELS: Record<string, string> = {
  portafolio: "Portafolio (Seguimiento)", inmuebles_inversion: "Inmuebles de inversión",
  casa_habitacion: "Casa habitación", apv: "APV", afp: "AFP",
  cuenta_ahorro: "Cuentas de ahorro", otro_financiero: "Otros financieros", ahorro_seguros: "Ahorro en seguros",
};

function fmt(clpValue: number, moneda: Moneda, rates: ExchangeRates): string {
  const v = fromCLP(clpValue, moneda, rates);
  const decimals = moneda === "CLP" ? 0 : moneda === "UF" ? 1 : 0;
  const n = v.toLocaleString("es-CL", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${n} ${moneda}`;
}

export default function PatrimonioResumen({ clientId, refreshKey = 0 }: { clientId: string; refreshKey?: number }) {
  const [data, setData] = useState<Resumen | null>(null);
  const [loading, setLoading] = useState(true);
  const [moneda, setMoneda] = useState<Moneda>("UF");
  const [incluirCasa, setIncluirCasa] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/clients/${clientId}/patrimonio/resumen`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setData(d as Resumen); })
      .finally(() => setLoading(false));
  }, [clientId, refreshKey]);

  if (loading) {
    return <div className="mb-4 flex justify-center rounded-lg border border-gb-border bg-white py-6"><Loader className="h-5 w-5 animate-spin text-gb-gray" /></div>;
  }
  if (!data) return null;

  const rates = data.rates;
  const neto = incluirCasa ? data.patrimonioNeto : data.patrimonioInvertible;
  const flujo = data.flujoPasivoMensual;
  const activosVisibles = Object.entries(data.activos).filter(([k]) => k !== "total") as [string, number][];

  return (
    <div className="mb-5 rounded-lg border border-gb-border border-l-4 border-l-gb-primary bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Wallet className="h-4 w-4 text-gb-primary" />
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
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gb-gray">Patrimonio neto</span>
            <button onClick={() => setIncluirCasa((v) => !v)}
              className={`text-[10px] font-semibold ${incluirCasa ? "text-gb-primary" : "text-gb-gray"}`}>
              {incluirCasa ? "incluye casa ✓" : "sin casa"}
            </button>
          </div>
          <div className="font-mono text-2xl font-semibold text-gb-black">{fmt(neto, moneda, rates)}</div>
          <div className="mt-1 text-[11px] text-gb-gray">Activos {fmt(data.activos.total, moneda, rates)} · Pasivos −{fmt(data.pasivos.credito_total, moneda, rates)}</div>
        </div>
        <div className="rounded-lg border border-gb-border p-4">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gb-gray">Flujo pasivo mensual</span>
          <div className={`font-mono text-2xl font-semibold ${flujo >= 0 ? "text-gb-success" : "text-gb-danger"}`}>{flujo >= 0 ? "+" : "−"}{fmt(Math.abs(flujo), moneda, rates)}</div>
          <div className="mt-1 text-[11px] text-gb-gray">Arriendos − dividendos (foto de hoy)</div>
        </div>
      </div>

      {!data.portafolioDisponible && (
        <p className="mt-3 text-[11px] text-gb-gray">Nota: el portafolio de inversiones no está incluido (aún sin cartola cargada en Seguimiento).</p>
      )}

      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-semibold text-gb-info">Ver desglose</summary>
        <div className="mt-2 space-y-1">
          {activosVisibles.filter(([, v]) => v !== 0).map(([k, v]) => (
            <div key={k} className="flex justify-between text-xs">
              <span className="text-gb-gray">{CAT_LABELS[k] ?? k}</span>
              <span className="font-mono text-gb-black">{fmt(v, moneda, rates)}</span>
            </div>
          ))}
          {data.pasivos.credito_total !== 0 && (
            <div className="flex justify-between border-t border-gb-border pt-1 text-xs">
              <span className="text-gb-gray">Créditos hipotecarios</span>
              <span className="font-mono text-gb-danger">−{fmt(data.pasivos.credito_total, moneda, rates)}</span>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
