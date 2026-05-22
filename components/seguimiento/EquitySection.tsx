"use client";

import React from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { formatNumber, formatPercent } from "@/lib/format";

export interface EquityHolding {
  fundName: string;
  assetType: string;        // "fund" | "etf" | "stock"
  weight: number;           // % of total portfolio
  purchasePrice: number;
  currentPrice: number;
  marketValue: number;
  currency: string;
  returnPrice: number;      // (current/purchase - 1) * 100
  dividendAmount: number;   // USD in period
  dividendYield: number;    // % in period
  totalReturn: number;      // returnPrice + dividendYield
  contribution: number;     // totalReturn * weight / 100
  tac: number | null;
}

interface Props {
  holdings: EquityHolding[];
  totalPortfolioValue: number;
  showDividends: boolean;
}

const TYPE_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  fund:  { bg: "bg-purple-100", text: "text-purple-700", label: "Fondo" },
  etf:   { bg: "bg-blue-100",   text: "text-blue-700",   label: "ETF" },
  stock: { bg: "bg-green-100",  text: "text-green-700",  label: "Stock" },
};

export default function EquitySection({ holdings, totalPortfolioValue, showDividends }: Props) {
  if (holdings.length === 0) return null;

  const subtotalValue = holdings.reduce((s, h) => s + h.marketValue, 0);
  const subtotalWeight = totalPortfolioValue > 0
    ? (subtotalValue / totalPortfolioValue) * 100
    : 0;
  const subtotalReturn = holdings.reduce((s, h) => s + h.contribution, 0);
  const weightedReturn = subtotalValue > 0
    ? holdings.reduce((s, h) => s + h.totalReturn * h.marketValue, 0) / subtotalValue
    : 0;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3 px-4">
        <div className="w-1 h-5 bg-blue-500 rounded" />
        <h3 className="text-sm font-semibold text-gb-black">Renta Variable</h3>
        <span className="text-xs text-gb-gray bg-blue-50 px-2 py-0.5 rounded">
          {formatNumber(subtotalWeight, 1)}% del portafolio
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gb-border bg-slate-50">
              <th className="px-3 py-2 text-left text-xs font-semibold text-gb-gray uppercase">Activo</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gb-gray uppercase">Tipo</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gb-gray uppercase">Peso</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gb-gray uppercase">P. Compra</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gb-gray uppercase">P. Actual</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gb-gray uppercase">Valor</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gb-gray uppercase">Retorno</th>
              {showDividends && (
                <th className="px-3 py-2 text-right text-xs font-semibold text-gb-gray uppercase">Dividendos</th>
              )}
              <th className="px-3 py-2 text-right text-xs font-semibold text-gb-gray uppercase">Ret. Total</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gb-gray uppercase">Contrib.</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => {
              const badge = TYPE_BADGE[h.assetType] || TYPE_BADGE.fund;
              const prefix = h.currency === "USD" ? "US$" : "$";
              const decimals = h.purchasePrice < 100 ? 2 : 0;

              return (
                <tr key={h.fundName} className="border-b border-gb-border hover:bg-blue-50/50 transition-colors">
                  <td className="px-3 py-2">
                    <span className="text-[11px] leading-tight font-medium text-gb-black block max-w-[260px] truncate">
                      {h.fundName}
                    </span>
                    {h.assetType === "fund" && h.tac != null && h.tac > 0 && (
                      <div className="text-[10px] text-gb-gray">TAC: {formatNumber(h.tac, 2)}%</div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${badge.bg} ${badge.text}`}>
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${Math.min(h.weight, 100) * 0.4}px` }} />
                      <span className="text-xs font-medium text-gb-black">{formatNumber(h.weight, 1)}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-gb-gray">
                    {prefix}{formatNumber(h.purchasePrice, decimals)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className={`text-xs font-medium ${
                      h.currentPrice > h.purchasePrice ? "text-green-700" :
                      h.currentPrice < h.purchasePrice ? "text-red-700" : "text-gb-black"
                    }`}>
                      {prefix}{formatNumber(h.currentPrice, decimals)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-sm font-medium text-gb-black">
                    ${formatNumber(h.marketValue, 0)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <ReturnCell value={h.returnPrice} />
                  </td>
                  {showDividends && (
                    <td className="px-3 py-2 text-right">
                      {h.dividendYield > 0 ? (
                        <span className="text-xs font-medium text-green-600">
                          {formatPercent(h.dividendYield)}
                        </span>
                      ) : (
                        <span className="text-xs text-gb-gray">-</span>
                      )}
                    </td>
                  )}
                  <td className="px-3 py-2 text-right">
                    <ReturnCell value={h.totalReturn} bold />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <ReturnCell value={h.contribution} small />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-blue-50/50 font-semibold">
              <td colSpan={showDividends ? 5 : 4} className="px-3 py-2 text-xs text-gb-black">
                Subtotal Renta Variable
              </td>
              <td className="px-3 py-2 text-right text-sm text-gb-black">
                ${formatNumber(subtotalValue, 0)}
              </td>
              <td className="px-3 py-2" />
              {showDividends && <td className="px-3 py-2" />}
              <td className="px-3 py-2 text-right">
                <ReturnCell value={weightedReturn} small />
              </td>
              <td className="px-3 py-2 text-right">
                <ReturnCell value={subtotalReturn} small />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function ReturnCell({ value, bold, small }: { value: number; bold?: boolean; small?: boolean }) {
  const color = value >= 0 ? "text-green-600" : "text-red-600";
  const size = small ? "text-xs" : "text-sm";
  const weight = bold ? "font-semibold" : "font-medium";

  return (
    <span className={`inline-flex items-center gap-0.5 ${size} ${weight} ${color}`}>
      {!small && (value >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />)}
      {formatPercent(value)}
    </span>
  );
}
