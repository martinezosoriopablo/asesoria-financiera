"use client";

import React from "react";
import { formatNumber, formatPercent } from "@/lib/format";
import { RATING_SCALE } from "@/lib/bonds/types";

export interface BondHoldingRow {
  fundName: string;        // Issuer name (truncated)
  cusip: string;
  creditRating: string;    // "BBB+", "BB-", etc.
  couponRate: number;      // annual % (e.g., 5.294)
  maturityDate: string;    // ISO date
  weight: number;          // % of total portfolio
  purchasePrice: number;   // % of par
  marketPrice: number;     // % of par (FINRA)
  ytm: number;             // annual % (e.g., 5.7)
  accruedInterest: number; // USD in period
  priceDiff: number;       // USD in period
  couponsPaid: number;     // USD in period
  totalReturn: number;     // %
  contribution: number;    // totalReturn * weight / 100
  marketValue: number;     // USD
}

interface Props {
  holdings: BondHoldingRow[];
  totalPortfolioValue: number;
}

function ratingColor(rating: string): string {
  const n = RATING_SCALE[rating.toUpperCase()] ?? 99;
  if (n <= 4) return "bg-green-100 text-green-700";      // AA and above
  if (n <= 7) return "bg-blue-100 text-blue-700";        // A range
  if (n <= 10) return "bg-yellow-100 text-yellow-700";   // BBB range
  if (n <= 13) return "bg-orange-100 text-orange-700";   // BB range
  return "bg-red-100 text-red-700";                       // B and below
}

export default function FixedIncomeSection({ holdings, totalPortfolioValue }: Props) {
  if (holdings.length === 0) return null;

  const subtotalValue = holdings.reduce((s, h) => s + h.marketValue, 0);
  const subtotalWeight = totalPortfolioValue > 0
    ? (subtotalValue / totalPortfolioValue) * 100
    : 0;
  const subtotalContrib = holdings.reduce((s, h) => s + h.contribution, 0);
  const subtotalAccrued = holdings.reduce((s, h) => s + h.accruedInterest, 0);
  const subtotalPriceDiff = holdings.reduce((s, h) => s + h.priceDiff, 0);
  const subtotalCoupons = holdings.reduce((s, h) => s + h.couponsPaid, 0);

  const fmtMaturity = (iso: string) => {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("es-CL", { month: "short", year: "numeric" });
  };

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3 px-4">
        <div className="w-1 h-5 bg-orange-500 rounded" />
        <h3 className="text-sm font-semibold text-gb-black">Renta Fija</h3>
        <span className="text-xs text-gb-gray bg-orange-50 px-2 py-0.5 rounded">
          {formatNumber(subtotalWeight, 1)}% del portafolio
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gb-border bg-slate-50">
              <th className="px-3 py-2 text-left text-xs font-semibold text-gb-gray uppercase">Emisor</th>
              <th className="px-3 py-2 text-center text-xs font-semibold text-gb-gray uppercase">Rating</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gb-gray uppercase">Cupon</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gb-gray uppercase">Venc.</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gb-gray uppercase">Peso</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gb-gray uppercase">P. Compra</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gb-gray uppercase">P. Mercado</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gb-gray uppercase">YTM</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gb-gray uppercase">Devengo</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gb-gray uppercase">Dif. Precio</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gb-gray uppercase">Cupones</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gb-gray uppercase">Ret. Total</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gb-gray uppercase">Contrib.</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => (
              <tr key={h.cusip} className="border-b border-gb-border hover:bg-orange-50/30 transition-colors">
                <td className="px-3 py-2">
                  <span className="text-[11px] leading-tight font-medium text-gb-black block max-w-[200px] truncate">
                    {h.fundName}
                  </span>
                </td>
                <td className="px-3 py-2 text-center">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${ratingColor(h.creditRating)}`}>
                    {h.creditRating}
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-xs text-gb-black">
                  {formatNumber(h.couponRate, 2)}%
                </td>
                <td className="px-3 py-2 text-right text-xs text-gb-gray">
                  {fmtMaturity(h.maturityDate)}
                </td>
                <td className="px-3 py-2 text-right text-xs font-medium text-gb-black">
                  {formatNumber(h.weight, 1)}%
                </td>
                <td className="px-3 py-2 text-right text-xs text-gb-gray">
                  {formatNumber(h.purchasePrice, 2)}
                </td>
                <td className="px-3 py-2 text-right text-xs font-medium text-gb-black">
                  {formatNumber(h.marketPrice, 2)}
                </td>
                <td className="px-3 py-2 text-right text-xs font-medium text-gb-black">
                  {formatNumber(h.ytm, 2)}%
                </td>
                <td className="px-3 py-2 text-right">
                  <UsdCell value={h.accruedInterest} />
                </td>
                <td className="px-3 py-2 text-right">
                  <UsdCell value={h.priceDiff} />
                </td>
                <td className="px-3 py-2 text-right">
                  {h.couponsPaid > 0 ? (
                    <span className="text-xs font-medium text-green-600">+${formatNumber(h.couponsPaid, 0)}</span>
                  ) : (
                    <span className="text-xs text-gb-gray">-</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <span className={`text-xs font-semibold ${h.totalReturn >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {formatPercent(h.totalReturn)}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  <span className={`text-xs font-medium ${h.contribution >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {formatPercent(h.contribution)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-orange-50/50 font-semibold">
              <td colSpan={5} className="px-3 py-2 text-xs text-gb-black">Subtotal Renta Fija</td>
              <td className="px-3 py-2" />
              <td className="px-3 py-2" />
              <td className="px-3 py-2" />
              <td className="px-3 py-2 text-right">
                <UsdCell value={subtotalAccrued} />
              </td>
              <td className="px-3 py-2 text-right">
                <UsdCell value={subtotalPriceDiff} />
              </td>
              <td className="px-3 py-2 text-right">
                {subtotalCoupons > 0 ? (
                  <span className="text-xs font-medium text-green-600">+${formatNumber(subtotalCoupons, 0)}</span>
                ) : (
                  <span className="text-xs text-gb-gray">-</span>
                )}
              </td>
              <td className="px-3 py-2" />
              <td className="px-3 py-2 text-right">
                <span className={`text-xs font-medium ${subtotalContrib >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {formatPercent(subtotalContrib)}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function UsdCell({ value }: { value: number }) {
  if (Math.abs(value) < 0.5) return <span className="text-xs text-gb-gray">-</span>;
  const color = value >= 0 ? "text-green-600" : "text-red-600";
  const sign = value >= 0 ? "+" : "";
  return (
    <span className={`text-xs font-medium ${color}`}>
      {sign}${formatNumber(value, 0)}
    </span>
  );
}
