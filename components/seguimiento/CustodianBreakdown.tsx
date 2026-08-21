// components/seguimiento/CustodianBreakdown.tsx
"use client";
import { useMemo } from "react";
import Card from "@/components/shared/Card";
import { groupByCustodian } from "@/lib/portfolio/group-by-custodian";

interface RawHolding { source?: string | null; marketValue?: number; marketValueCLP?: number; }
interface Snap { snapshot_date: string; source?: string; holdings?: unknown[] | null; }

function fmtCLP(n: number): string {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);
}

export default function CustodianBreakdown({ snapshots }: { snapshots: Snap[] }) {
  const groups = useMemo(() => {
    const withHoldings = snapshots
      .filter((s) => s.source !== "api-prices" && Array.isArray(s.holdings) && s.holdings.length > 0)
      .sort((a, b) => (a.snapshot_date < b.snapshot_date ? 1 : -1));
    const latest = withHoldings[0];
    const holdings = (Array.isArray(latest?.holdings) ? latest!.holdings : []) as RawHolding[];
    return groupByCustodian<RawHolding>(
      holdings,
      (h) => h.source,
      (h) => (h.marketValueCLP && h.marketValueCLP > 0 ? h.marketValueCLP : h.marketValue || 0)
    );
  }, [snapshots]);

  if (groups.length === 0) {
    return <p className="text-sm text-gb-gray py-4">No hay holdings para desglosar por custodio.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {groups.map((g) => (
        <div key={g.custodio} className="flex items-center justify-between gap-3 rounded-md border border-gb-border px-3 py-2 text-sm">
          <span className="text-gb-black font-medium">{g.custodio}</span>
          <span className="flex items-center gap-3">
            <span className="text-gb-gray tabular-nums">{g.pct.toFixed(1)}%</span>
            <span className="text-gb-black font-semibold tabular-nums">{fmtCLP(g.valorCLP)}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
