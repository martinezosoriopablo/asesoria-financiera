"use client";

import React from "react";
import { ArrowRight } from "lucide-react";
import type { HoldingAnalysis } from "./hooks/useXrayProposal";

interface Holding {
  fundName: string;
  securityId?: string | null;
  serie?: string | null;
  quantity?: number;
  unitCost?: number;
  costBasis?: number;
  marketPrice?: number;
  marketValue: number;
  marketValueCLP?: number;
  assetClass?: string;
  currency?: string;
}

interface Props {
  holdings: HoldingAnalysis[];
  rawHoldings: Holding[];
  mergedProposal: {
    holdings: { originalFund: string; changed: boolean; proposedTac: number }[];
  } | null;
  ufValue: number | null;
  usdValue: number | null;
  clientName?: string;
  clientId?: string;
  readOnly?: boolean;
}

export default function XrayTaxSummary({ holdings, rawHoldings, mergedProposal, ufValue, usdValue, clientName, clientId, readOnly }: Props) {
  if (!holdings || holdings.length === 0) return null;

  return (
    <div className="bg-white rounded-lg border border-gb-border shadow-sm">
      <div className="px-4 py-3 border-b border-gb-border">
        <h3 className="text-sm font-semibold text-gb-black">Analisis Tributario del Cambio</h3>
        <p className="text-[11px] text-gb-gray mt-0.5">Regimen tributario de cada posicion para el cambio de custodia.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gb-border bg-gray-50">
              <th className="px-3 py-2 text-left font-medium text-gb-gray">Fondo</th>
              <th className="px-3 py-2 text-left font-medium text-gb-gray">Regimen</th>
              <th className="px-3 py-2 text-center font-medium text-gb-gray">MLT</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h: HoldingAnalysis, i: number) => (
              <tr key={i} className="border-b border-gb-border/50 last:border-0">
                <td className="px-3 py-2 text-gb-black">{h.fundName}</td>
                <td className="px-3 py-2">
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                    h.beneficio107lir ? "bg-blue-100 text-blue-700" :
                    h.beneficio108lir ? "bg-purple-100 text-purple-700" :
                    h.isApvEligible ? "bg-green-100 text-green-700" :
                    "bg-gray-100 text-gray-700"
                  }`}>
                    {h.beneficio107lir ? "Art. 107 (10%)" :
                     h.beneficio108lir ? "Art. 108/MLT" :
                     h.isApvEligible ? "APV" : "General"}
                  </span>
                </td>
                <td className="px-3 py-2 text-center">{h.beneficio108lir ? "Si" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <div className="px-4 py-3 border-t border-gb-border">
          <button
            onClick={() => {
              // Save enriched xray data to sessionStorage for faster load
              try {
                sessionStorage.setItem("tax-simulator-holdings", JSON.stringify({
                  rawHoldings: rawHoldings,
                  xrayHoldings: holdings || [],
                  ufValue: ufValue || 38000,
                  usdRate: usdValue || 0,
                  clientName,
                  clientId,
                  proposal: mergedProposal ? Object.fromEntries(
                    mergedProposal.holdings.filter(h => h.changed).map(h => [h.originalFund, { proposedTac: h.proposedTac }])
                  ) : undefined,
                }));
              } catch { /* sessionStorage may be full */ }
              // Navigate with clientId as fallback
              window.location.href = `/tax-optimizer${clientId ? `?clientId=${clientId}` : ""}`;
            }}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-gb-primary hover:text-gb-primary/80"
          >
            Ver simulador completo
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
