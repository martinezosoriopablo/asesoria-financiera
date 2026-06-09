"use client";

import React from "react";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";

interface XraySummaryCardsProps {
  totalValue: number;
  holdingsCount: number;
  holdingsSinIdentificar: number;
  ufValue: number | null;
  usdValue: number | null;
  tacPromedio: number;
  holdingsConTac: number;
  costoAnual: number;
  costoProyectado10Y: number;
  ahorroAnualPotencial: number;
  holdingsConAlternativa: number;
  portfolioRent12m: { value: number; coverage: number } | null;
}

export default function XraySummaryCards({
  totalValue,
  holdingsCount,
  holdingsSinIdentificar,
  ufValue,
  usdValue,
  tacPromedio,
  holdingsConTac,
  costoAnual,
  costoProyectado10Y,
  ahorroAnualPotencial,
  holdingsConAlternativa,
  portfolioRent12m,
}: XraySummaryCardsProps) {
  return (
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        {/* Valor Total */}
        <div className="bg-white rounded-lg border border-gb-border p-4 shadow-sm">
          <p className="text-xs text-gb-gray font-medium uppercase mb-1">
            Valor Total
          </p>
          <p className="text-xl font-bold text-gb-black">
            {formatCurrency(totalValue)}
          </p>
          <p className="text-xs text-gb-gray mt-1">
            {ufValue ? `UF ${(totalValue / ufValue).toLocaleString("es-CL", { maximumFractionDigits: 1 })}` : ""}{ufValue && usdValue ? " · " : ""}{usdValue ? `USD ${(totalValue / usdValue).toLocaleString("es-CL", { maximumFractionDigits: 0 })}` : ""}
            {!ufValue && !usdValue ? `${holdingsCount} holdings` : ` · ${holdingsCount} holdings`}
          </p>
        </div>

        {/* TAC Promedio */}
        <div className="bg-white rounded-lg border border-gb-border p-4 shadow-sm">
          <p className="text-xs text-gb-gray font-medium uppercase mb-1">
            TAC Promedio
          </p>
          <p className="text-xl font-bold text-amber-600">
            {formatNumber(tacPromedio, 2)}%
          </p>
          <p className="text-xs text-gb-gray mt-1">
            {holdingsConTac}/{holdingsCount} con datos TAC
          </p>
          {holdingsSinIdentificar > 0 && (
            <p className="text-xs text-red-600 mt-0.5">
              {holdingsSinIdentificar} sin identificar
            </p>
          )}
        </div>

        {/* Costo Anual */}
        <div className="bg-white rounded-lg border border-gb-border p-4 shadow-sm">
          <p className="text-xs text-gb-gray font-medium uppercase mb-1">
            Costo Anual
          </p>
          <p className="text-xl font-bold text-red-600">
            {formatCurrency(costoAnual)}
          </p>
          <p className="text-xs text-gb-gray mt-1">
            {ufValue ? `UF ${(costoAnual / ufValue).toLocaleString("es-CL", { maximumFractionDigits: 1 })}/año · ` : ""}
            10 años: {formatCurrency(costoProyectado10Y)}
          </p>
        </div>

        {/* Ahorro Potencial */}
        <div className="bg-white rounded-lg border border-gb-border p-4 shadow-sm">
          <p className="text-xs text-gb-gray font-medium uppercase mb-1">
            Ahorro Potencial
          </p>
          <p className="text-xl font-bold text-green-600">
            {formatCurrency(ahorroAnualPotencial)}
            <span className="text-sm font-normal text-gb-gray">/año</span>
          </p>
          <p className="text-xs text-gb-gray mt-1">
            {holdingsConAlternativa} holdings con alternativa más barata
          </p>
        </div>

        {/* Rentabilidad 12M */}
        <div className="bg-white rounded-lg border border-gb-border p-4 shadow-sm">
          <p className="text-xs text-gb-gray font-medium uppercase mb-1">
            Rentabilidad 12M
          </p>
          {portfolioRent12m ? (
            <>
              <p className={`text-xl font-bold ${portfolioRent12m.value >= 0 ? "text-green-600" : "text-red-600"}`}>
                {formatPercent(portfolioRent12m.value)}
              </p>
              <p className="text-xs text-gb-gray mt-1">
                Ponderada · {portfolioRent12m.coverage}% cobertura
              </p>
            </>
          ) : (
            <p className="text-xl font-bold text-gb-gray">N/D</p>
          )}
        </div>
      </div>
  );
}
