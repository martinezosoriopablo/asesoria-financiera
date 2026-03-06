// app/direct-portfolio/components/HoldingsTable.tsx
// Tabla de holdings del portafolio directo

"use client";

import React, { useState } from "react";
import {
  Trash2,
  Edit2,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  MoreVertical,
} from "lucide-react";
import type { DirectPortfolioHolding, HoldingType } from "@/lib/direct-portfolio/types";
import { formatCurrency, formatPercent, getAssetClass } from "@/lib/direct-portfolio/types";

interface HoldingsTableProps {
  holdings: DirectPortfolioHolding[];
  onDelete: (holdingId: string) => void;
  onEdit: (holding: DirectPortfolioHolding) => void;
  onRefreshPrice: (holding: DirectPortfolioHolding) => void;
  loading?: boolean;
  currency?: string;
}

export default function HoldingsTable({
  holdings,
  onDelete,
  onEdit,
  onRefreshPrice,
  loading = false,
  currency = "USD",
}: HoldingsTableProps) {
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  const getTypeLabel = (tipo: HoldingType) => {
    switch (tipo) {
      case "stock_us":
        return { label: "Acción USA", color: "bg-blue-100 text-blue-800" };
      case "stock_cl":
        return { label: "Acción Chile", color: "bg-green-100 text-green-800" };
      case "etf":
        return { label: "ETF", color: "bg-purple-100 text-purple-800" };
      case "bond":
        return { label: "Bono", color: "bg-amber-100 text-amber-800" };
      default:
        return { label: tipo, color: "bg-gray-100 text-gray-800" };
    }
  };

  const getAssetClassLabel = (tipo: HoldingType) => {
    const assetClass = getAssetClass(tipo);
    return assetClass === "renta_variable" ? "Renta Variable" : "Renta Fija";
  };

  // Ordenar: primero renta variable, luego renta fija
  const sortedHoldings = [...holdings].sort((a, b) => {
    const aClass = getAssetClass(a.tipo);
    const bClass = getAssetClass(b.tipo);
    if (aClass !== bClass) {
      return aClass === "renta_variable" ? -1 : 1;
    }
    return a.nombre.localeCompare(b.nombre);
  });

  // Calcular totales
  const totalValue = holdings.reduce((sum, h) => sum + (h.valor_mercado || 0), 0);
  const totalCost = holdings.reduce((sum, h) => {
    if (h.tipo === "bond") {
      return sum + (h.cantidad * (h.valor_nominal || 0));
    }
    return sum + (h.cantidad * (h.precio_compra || 0));
  }, 0);
  const totalGainLoss = totalValue - totalCost;

  if (holdings.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
        <p className="text-gray-500">
          No hay posiciones en el portafolio. Agregue acciones o bonos para comenzar.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left py-3 px-4 font-semibold text-gray-700">
                Instrumento
              </th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700">
                Tipo
              </th>
              <th className="text-right py-3 px-4 font-semibold text-gray-700">
                Cantidad
              </th>
              <th className="text-right py-3 px-4 font-semibold text-gray-700">
                Precio Compra
              </th>
              <th className="text-right py-3 px-4 font-semibold text-gray-700">
                Precio Actual
              </th>
              <th className="text-right py-3 px-4 font-semibold text-gray-700">
                Valor Mercado
              </th>
              <th className="text-right py-3 px-4 font-semibold text-gray-700">
                G/P
              </th>
              <th className="text-right py-3 px-4 font-semibold text-gray-700">
                Peso
              </th>
              <th className="text-center py-3 px-4 font-semibold text-gray-700 w-12">

              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sortedHoldings.map((holding) => {
              const typeInfo = getTypeLabel(holding.tipo);
              const gainLoss = holding.ganancia_perdida || 0;
              const isPositive = gainLoss >= 0;

              return (
                <tr
                  key={holding.id}
                  className={`hover:bg-gray-50 ${loading ? "opacity-50" : ""}`}
                >
                  {/* Instrumento */}
                  <td className="py-3 px-4">
                    <div>
                      <div className="font-semibold text-gray-900">
                        {holding.ticker || holding.nombre}
                      </div>
                      <div className="text-xs text-gray-500 truncate max-w-[200px]">
                        {holding.ticker ? holding.nombre : ""}
                        {holding.tipo === "bond" && holding.cupon && (
                          <span className="ml-1">
                            | Cupón: {holding.cupon}%
                            {holding.vencimiento && ` | Venc: ${new Date(holding.vencimiento).getFullYear()}`}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Tipo */}
                  <td className="py-3 px-4">
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${typeInfo.color}`}
                    >
                      {typeInfo.label}
                    </span>
                  </td>

                  {/* Cantidad */}
                  <td className="py-3 px-4 text-right font-mono">
                    {holding.cantidad.toLocaleString("es-CL", {
                      maximumFractionDigits: 4,
                    })}
                  </td>

                  {/* Precio Compra */}
                  <td className="py-3 px-4 text-right font-mono">
                    {holding.precio_compra
                      ? formatCurrency(holding.precio_compra, currency)
                      : "-"}
                  </td>

                  {/* Precio Actual */}
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <span className="font-mono">
                        {holding.precio_actual
                          ? formatCurrency(holding.precio_actual, currency)
                          : "-"}
                      </span>
                      {holding.tipo !== "bond" && (
                        <button
                          onClick={() => onRefreshPrice(holding)}
                          className="text-gray-400 hover:text-blue-600 p-1"
                          title="Actualizar precio"
                        >
                          <RefreshCw size={14} />
                        </button>
                      )}
                    </div>
                  </td>

                  {/* Valor Mercado */}
                  <td className="py-3 px-4 text-right font-mono font-semibold">
                    {holding.valor_mercado
                      ? formatCurrency(holding.valor_mercado, currency)
                      : "-"}
                  </td>

                  {/* Ganancia/Pérdida */}
                  <td className="py-3 px-4 text-right">
                    {holding.precio_actual && holding.precio_compra ? (
                      <div
                        className={`flex items-center justify-end gap-1 ${
                          isPositive ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {isPositive ? (
                          <TrendingUp size={14} />
                        ) : (
                          <TrendingDown size={14} />
                        )}
                        <span className="font-mono">
                          {formatPercent(
                            ((holding.precio_actual - holding.precio_compra) /
                              holding.precio_compra) *
                              100
                          )}
                        </span>
                      </div>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>

                  {/* Peso */}
                  <td className="py-3 px-4 text-right font-mono">
                    {holding.peso_portafolio
                      ? `${holding.peso_portafolio.toFixed(1)}%`
                      : "-"}
                  </td>

                  {/* Acciones */}
                  <td className="py-3 px-4 text-center relative">
                    <button
                      onClick={() =>
                        setMenuOpen(menuOpen === holding.id ? null : holding.id)
                      }
                      className="p-1 text-gray-400 hover:text-gray-600 rounded"
                    >
                      <MoreVertical size={16} />
                    </button>

                    {/* Dropdown menu */}
                    {menuOpen === holding.id && (
                      <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1 min-w-[120px]">
                        <button
                          onClick={() => {
                            onEdit(holding);
                            setMenuOpen(null);
                          }}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                        >
                          <Edit2 size={14} />
                          Editar
                        </button>
                        <button
                          onClick={() => {
                            if (
                              confirm(
                                `¿Eliminar ${holding.ticker || holding.nombre}?`
                              )
                            ) {
                              onDelete(holding.id);
                            }
                            setMenuOpen(null);
                          }}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 text-red-600 flex items-center gap-2"
                        >
                          <Trash2 size={14} />
                          Eliminar
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>

          {/* Footer con totales */}
          <tfoot className="bg-gray-50 border-t-2 border-gray-200">
            <tr className="font-semibold">
              <td className="py-3 px-4" colSpan={5}>
                Total del Portafolio
              </td>
              <td className="py-3 px-4 text-right font-mono">
                {formatCurrency(totalValue, currency)}
              </td>
              <td className="py-3 px-4 text-right">
                {totalCost > 0 && (
                  <span
                    className={`font-mono ${
                      totalGainLoss >= 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {formatPercent((totalGainLoss / totalCost) * 100)}
                  </span>
                )}
              </td>
              <td className="py-3 px-4 text-right font-mono">100%</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
