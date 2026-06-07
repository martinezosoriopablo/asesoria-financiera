"use client";

import { useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface Holding {
  fundName: string;
  marketValue: number;
  assetClass?: string;
  currency?: string;
}

interface Props {
  holdings: Holding[];
}

const ASSET_LABELS: Record<string, string> = {
  equity: "Acciones",
  fixedincome: "Renta Fija",
  fixedIncome: "Renta Fija",
  alternatives: "Alternativos",
  cash: "Caja",
  balanced: "Balanceado",
  fund: "Fondos",
};

const ASSET_COLORS: Record<string, string> = {
  equity: "#22c55e",
  fixedincome: "#3b82f6",
  fixedIncome: "#3b82f6",
  alternatives: "#a855f7",
  cash: "#94a3b8",
  balanced: "#f59e0b",
  fund: "#06b6d4",
};

const CURRENCY_COLORS: Record<string, string> = {
  CLP: "#22c55e",
  USD: "#3b82f6",
  UF: "#f59e0b",
  EUR: "#a855f7",
};

const fmt = (n: number) =>
  Math.round(n).toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

function aggregate(holdings: Holding[], key: "assetClass" | "currency") {
  const map = new Map<string, number>();
  for (const h of holdings) {
    const raw = (h[key] || "Otro").trim();
    const label = key === "assetClass" ? (ASSET_LABELS[raw] || raw) : raw;
    map.set(label, (map.get(label) || 0) + Math.abs(h.marketValue || 0));
  }
  const total = Array.from(map.values()).reduce((a, b) => a + b, 0);
  return Array.from(map.entries())
    .map(([name, value]) => ({ name, value, pct: total > 0 ? (value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
}

function getColor(name: string, key: "assetClass" | "currency") {
  if (key === "currency") return CURRENCY_COLORS[name] || "#6b7280";
  // Try to reverse-lookup from label
  for (const [k, v] of Object.entries(ASSET_LABELS)) {
    if (v === name) return ASSET_COLORS[k] || "#6b7280";
  }
  return ASSET_COLORS[name] || "#6b7280";
}

const RADIAN = Math.PI / 180;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderLabel(props: any) {
  const { cx, cy, midAngle, innerRadius, outerRadius, payload } = props;
  const pct = payload?.pct as number;
  if (!pct || pct < 3) return null;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={600}>
      {pct.toFixed(1)}%
    </text>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border border-gb-border rounded-lg shadow-lg px-3 py-2 text-sm">
      <p className="font-medium text-gb-black">{d.name}</p>
      <p className="text-gb-gray">{fmt(d.value)} ({d.pct.toFixed(1)}%)</p>
    </div>
  );
}

export default function PortfolioBreakdownPies({ holdings }: Props) {
  const assetData = useMemo(() => aggregate(holdings, "assetClass"), [holdings]);
  const currencyData = useMemo(() => aggregate(holdings, "currency"), [holdings]);

  if (!holdings.length) return null;

  return (
    <div className="mb-6">
      <h3 className="text-lg font-semibold text-gb-black mb-4">Composición del Portafolio</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Asset Class Pie */}
        <div className="bg-white border border-gb-border rounded-xl p-4">
          <h4 className="text-sm font-medium text-gb-gray mb-2 text-center">Por Tipo de Activo</h4>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={assetData}
                dataKey="value"
                cx="50%"
                cy="50%"
                outerRadius={100}
                innerRadius={40}
                paddingAngle={2}
                label={renderLabel}
                labelLine={false}
              >
                {assetData.map((d) => (
                  <Cell key={d.name} fill={getColor(d.name, "assetClass")} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend
                verticalAlign="bottom"
                iconType="circle"
                iconSize={10}
                formatter={(value: string) => <span className="text-xs text-gb-gray">{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Currency Pie */}
        <div className="bg-white border border-gb-border rounded-xl p-4">
          <h4 className="text-sm font-medium text-gb-gray mb-2 text-center">Por Moneda</h4>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={currencyData}
                dataKey="value"
                cx="50%"
                cy="50%"
                outerRadius={100}
                innerRadius={40}
                paddingAngle={2}
                label={renderLabel}
                labelLine={false}
              >
                {currencyData.map((d) => (
                  <Cell key={d.name} fill={getColor(d.name, "currency")} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend
                verticalAlign="bottom"
                iconType="circle"
                iconSize={10}
                formatter={(value: string) => <span className="text-xs text-gb-gray">{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
