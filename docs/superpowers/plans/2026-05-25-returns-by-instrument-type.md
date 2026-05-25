# Returns by Instrument Type — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "Por Clase de Activo" Recharts bar chart in PerformanceAttribution with custom stacked horizontal bars showing instrument-type breakdown (ETF, Acciones, Fondos, Bonos, Cash) within each asset class, with bar length proportional to return contribution.

**Architecture:** Single-file change to `PerformanceAttribution.tsx`. Add a new `useMemo` that groups holdings by asset class + instrument type, computes per-group contribution, then renders stacked bars with pure Tailwind (no Recharts for this section). Instrument type comes from `inferInstrumentType()` in `lib/instrument-type.ts` which returns `"bond" | "stock" | "etf" | "fund" | "cash"`.

**Tech Stack:** React 19, Tailwind v4, existing `inferInstrumentType` from `lib/instrument-type.ts`, existing `formatNumber`/`formatPercent` from `lib/format.ts`.

---

### Task 1: Add instrument-type breakdown computation

**Files:**
- Modify: `components/seguimiento/PerformanceAttribution.tsx`

- [ ] **Step 1: Add import for inferInstrumentType**

At the top of the file, after the existing imports, add:

```typescript
import { inferInstrumentType } from "@/lib/instrument-type";
```

- [ ] **Step 2: Add instrument type color/label constants**

After the `Holding` interface (around line 36), add:

```typescript
const INSTRUMENT_COLORS: Record<string, { label: string; color: string; negColor: string }> = {
  etf:   { label: "ETFs",     color: "#3b82f6", negColor: "#93c5fd" },
  stock: { label: "Acciones", color: "#10b981", negColor: "#6ee7b7" },
  fund:  { label: "Fondos",   color: "#f59e0b", negColor: "#fcd34d" },
  bond:  { label: "Bonos",    color: "#8b5cf6", negColor: "#c4b5fd" },
  cash:  { label: "Cash",     color: "#94a3b8", negColor: "#cbd5e1" },
};

interface InstrumentBreakdown {
  type: string;
  label: string;
  color: string;
  negColor: string;
  contribution: number; // percentage points contributed to portfolio return
}

interface AssetClassWithBreakdown {
  name: string;
  key: string;
  color: string;
  totalContribution: number;
  classReturn: number;
  breakdown: InstrumentBreakdown[];
}
```

- [ ] **Step 3: Add the instrumentBreakdown useMemo**

Inside the component function, after the `assetClassAttribution` useMemo (around line 180), add this new memo:

```typescript
  // ============================================
  // 1b. INSTRUMENT TYPE BREAKDOWN within each asset class
  // ============================================
  const instrumentBreakdown = useMemo((): AssetClassWithBreakdown[] | null => {
    if (!firstSnapshot || !lastSnapshot || snapshotsWithAssetData.length < 2) return null;

    const initialHoldings = (firstSnapshot.holdings as Holding[]) || [];
    const finalHoldings = (lastSnapshot.holdings as Holding[]) || [];
    if (initialHoldings.length === 0 && finalHoldings.length === 0) return null;

    const portfolioInitialValue = firstSnapshot.total_value;
    if (portfolioInitialValue <= 0) return null;

    // Use marketValueCLP when available (handles USD funds correctly)
    const clpValue = (h: Holding) => h.marketValueCLP ?? h.marketValue ?? 0;

    // Map: assetClass -> instrumentType -> { startValue, endValue }
    const groups = new Map<string, Map<string, { startValue: number; endValue: number }>>();

    const classKeyMap: Record<string, string> = {
      equity: "Renta Variable",
      fixedIncome: "Renta Fija",
      alternatives: "Alternativos",
      cash: "Cash",
    };
    const classColorMap: Record<string, string> = {
      equity: "#3b82f6",
      fixedIncome: "#22c55e",
      alternatives: "#a855f7",
      cash: "#6b7280",
    };

    // Helper to get or create group
    const getGroup = (ac: string, it: string) => {
      if (!groups.has(ac)) groups.set(ac, new Map());
      const acMap = groups.get(ac)!;
      if (!acMap.has(it)) acMap.set(it, { startValue: 0, endValue: 0 });
      return acMap.get(it)!;
    };

    // Accumulate initial holdings
    for (const h of initialHoldings) {
      const ac = h.assetClass || "equity";
      const it = inferInstrumentType(h as Parameters<typeof inferInstrumentType>[0]);
      getGroup(ac, it).startValue += clpValue(h);
    }

    // Accumulate final holdings
    for (const h of finalHoldings) {
      const ac = h.assetClass || "equity";
      const it = inferInstrumentType(h as Parameters<typeof inferInstrumentType>[0]);
      getGroup(ac, it).endValue += clpValue(h);
    }

    // Build result ordered by class
    const classOrder = ["equity", "fixedIncome", "alternatives", "cash"];
    const result: AssetClassWithBreakdown[] = [];

    for (const classKey of classOrder) {
      const acMap = groups.get(classKey);
      if (!acMap) continue;

      const breakdown: InstrumentBreakdown[] = [];
      let classTotalStart = 0;
      let classTotalEnd = 0;

      for (const [instType, vals] of acMap) {
        const contribution = ((vals.endValue - vals.startValue) / portfolioInitialValue) * 100;
        const meta = INSTRUMENT_COLORS[instType] || INSTRUMENT_COLORS.fund;
        breakdown.push({
          type: instType,
          label: meta.label,
          color: meta.color,
          negColor: meta.negColor,
          contribution,
        });
        classTotalStart += vals.startValue;
        classTotalEnd += vals.endValue;
      }

      // Sort by absolute contribution descending
      breakdown.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

      const totalContribution = breakdown.reduce((s, b) => s + b.contribution, 0);
      const classReturn = classTotalStart > 0
        ? ((classTotalEnd - classTotalStart) / classTotalStart) * 100
        : 0;

      if (Math.abs(totalContribution) > 0.01 || classTotalStart > 0) {
        result.push({
          name: classKeyMap[classKey] || classKey,
          key: classKey,
          color: classColorMap[classKey] || "#6b7280",
          totalContribution,
          classReturn,
          breakdown,
        });
      }
    }

    return result.length > 0 ? result : null;
  }, [firstSnapshot, lastSnapshot, snapshotsWithAssetData]);
```

- [ ] **Step 4: Verify build compiles**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds (or only pre-existing errors). The new memo is computed but not yet rendered.

- [ ] **Step 5: Commit**

```bash
git add components/seguimiento/PerformanceAttribution.tsx
git commit -m "feat: add instrument-type breakdown computation to PerformanceAttribution"
```

---

### Task 2: Replace Recharts chart with stacked bars UI

**Files:**
- Modify: `components/seguimiento/PerformanceAttribution.tsx`

- [ ] **Step 1: Replace the chart and summary cards in the assetClass section**

Find the block inside `{expandedSection === "assetClass" && (` (lines ~412-457). Replace the entire content (`<div className="px-6 pb-6">...</div>`) with the stacked bars implementation:

```tsx
          {expandedSection === "assetClass" && (
            <div className="px-6 pb-6">
              {instrumentBreakdown ? (
                <>
                  {/* Legend */}
                  <div className="flex flex-wrap gap-3 mb-4">
                    {Object.entries(INSTRUMENT_COLORS).map(([key, meta]) => (
                      <div key={key} className="flex items-center gap-1.5 text-xs text-gb-gray">
                        <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: meta.color }} />
                        {meta.label}
                      </div>
                    ))}
                  </div>

                  {/* Scale */}
                  {(() => {
                    const maxAbs = Math.max(
                      ...instrumentBreakdown.map(c => Math.abs(c.totalContribution)),
                      1
                    );
                    const hasNegative = instrumentBreakdown.some(c => c.totalContribution < 0);
                    // Scale: bar width as percentage of container
                    const scale = (val: number) => (Math.abs(val) / maxAbs) * (hasNegative ? 50 : 90);
                    const zeroOffset = hasNegative ? 50 : 0; // % from left where zero lives

                    return (
                      <div className="space-y-3">
                        {instrumentBreakdown.map((cls) => {
                          const barWidth = scale(cls.totalContribution);
                          const isNeg = cls.totalContribution < 0;

                          return (
                            <div key={cls.key}>
                              {/* Label row */}
                              <div className="flex items-baseline justify-between mb-1">
                                <span className="text-sm font-semibold text-gb-black">{cls.name}</span>
                                <span className={`text-sm font-bold ${cls.totalContribution >= 0 ? "text-green-600" : "text-red-600"}`}>
                                  {cls.totalContribution >= 0 ? "+" : ""}{formatNumber(cls.totalContribution, 2)}%
                                </span>
                              </div>
                              {/* Stacked bar */}
                              <div className="relative h-7" style={{ marginLeft: hasNegative ? "0" : undefined }}>
                                {/* Zero line (only when there are negatives) */}
                                {hasNegative && (
                                  <div
                                    className="absolute top-0 bottom-0 w-px bg-slate-400"
                                    style={{ left: `${zeroOffset}%` }}
                                  />
                                )}
                                {/* Bar container */}
                                <div
                                  className="absolute top-0 h-full flex overflow-hidden rounded"
                                  style={
                                    isNeg
                                      ? { right: `${100 - zeroOffset}%`, width: `${barWidth}%`, flexDirection: "row-reverse" }
                                      : { left: `${zeroOffset}%`, width: `${barWidth}%` }
                                  }
                                >
                                  {cls.breakdown
                                    .filter(b => (isNeg ? b.contribution < 0 : b.contribution > 0))
                                    .map((seg) => {
                                      const segPct = cls.totalContribution !== 0
                                        ? (Math.abs(seg.contribution) / Math.abs(cls.totalContribution)) * 100
                                        : 0;
                                      return (
                                        <div
                                          key={seg.type}
                                          className="h-full flex items-center justify-center overflow-hidden"
                                          style={{
                                            width: `${segPct}%`,
                                            backgroundColor: isNeg ? seg.negColor : seg.color,
                                            minWidth: segPct > 0 ? "2px" : "0",
                                          }}
                                          title={`${seg.label}: ${seg.contribution >= 0 ? "+" : ""}${formatNumber(seg.contribution, 2)}%`}
                                        >
                                          {segPct > 15 && (
                                            <span className="text-[10px] font-medium text-white truncate px-1">
                                              {seg.label} {formatNumber(Math.abs(seg.contribution), 1)}
                                            </span>
                                          )}
                                        </div>
                                      );
                                    })}
                                </div>
                                {/* Show segments from the other side if mixed signs */}
                                {cls.breakdown.some(b => (isNeg ? b.contribution > 0 : b.contribution < 0)) && (() => {
                                  const otherSegs = cls.breakdown.filter(b => (isNeg ? b.contribution > 0 : b.contribution < 0));
                                  const otherTotal = otherSegs.reduce((s, b) => s + Math.abs(b.contribution), 0);
                                  const otherWidth = (otherTotal / maxAbs) * (hasNegative ? 50 : 90);
                                  return (
                                    <div
                                      className="absolute top-0 h-full flex overflow-hidden rounded"
                                      style={
                                        isNeg
                                          ? { left: `${zeroOffset}%`, width: `${otherWidth}%` }
                                          : { right: `${100 - zeroOffset}%`, width: `${otherWidth}%`, flexDirection: "row-reverse" }
                                      }
                                    >
                                      {otherSegs.map((seg) => {
                                        const segPct = otherTotal > 0
                                          ? (Math.abs(seg.contribution) / otherTotal) * 100
                                          : 0;
                                        return (
                                          <div
                                            key={seg.type}
                                            className="h-full flex items-center justify-center overflow-hidden"
                                            style={{
                                              width: `${segPct}%`,
                                              backgroundColor: !isNeg ? seg.negColor : seg.color,
                                              minWidth: segPct > 0 ? "2px" : "0",
                                            }}
                                            title={`${seg.label}: ${seg.contribution >= 0 ? "+" : ""}${formatNumber(seg.contribution, 2)}%`}
                                          >
                                            {segPct > 20 && (
                                              <span className="text-[10px] font-medium text-white truncate px-1">
                                                {seg.label}
                                              </span>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  );
                                })()}
                              </div>
                              {/* Sub-detail: instrument contributions */}
                              <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                                {cls.breakdown
                                  .filter(b => Math.abs(b.contribution) > 0.005)
                                  .map((seg) => (
                                    <span key={seg.type} className="text-[11px] text-gb-gray">
                                      <span className="inline-block w-2 h-2 rounded-sm mr-1" style={{ backgroundColor: seg.color }} />
                                      {seg.label}: <span className={seg.contribution >= 0 ? "text-green-600" : "text-red-600"}>
                                        {seg.contribution >= 0 ? "+" : ""}{formatNumber(seg.contribution, 2)}%
                                      </span>
                                    </span>
                                  ))}
                              </div>
                            </div>
                          );
                        })}

                        {/* Total line */}
                        <div className="border-t-2 border-gb-black pt-2 mt-2 flex justify-between">
                          <span className="text-sm font-bold text-gb-black">Retorno Total Cartera</span>
                          <span className={`text-sm font-bold ${(assetClassAttribution?.totalReturn ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                            {formatPercent(assetClassAttribution?.totalReturn ?? 0)}
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </>
              ) : (
                /* Fallback: original simple bars when no holdings data */
                <div className="h-64 mb-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={assetClassAttribution?.contributions || []}
                      layout="vertical"
                      margin={{ left: 80, right: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" tickFormatter={(v) => `${formatNumber(v, 1)}%`} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(value: number | undefined) => [`${formatNumber(value ?? 0, 2)}%`, "Contribución"]} />
                      <ReferenceLine x={0} stroke="#000" />
                      <Bar dataKey="contribution" name="Contribución">
                        {(assetClassAttribution?.contributions || []).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.contribution >= 0 ? "#22c55e" : "#ef4444"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}
```

- [ ] **Step 2: Remove the old summary cards grid**

The old `<div className="grid grid-cols-4 gap-3">` block (which was inside the replaced section) is already gone since Step 1 replaced the entire content. Verify it's not duplicated.

- [ ] **Step 3: Verify build compiles**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add components/seguimiento/PerformanceAttribution.tsx
git commit -m "feat: replace asset class chart with stacked instrument-type bars"
```

---

### Task 3: Clean up unused Recharts imports

**Files:**
- Modify: `components/seguimiento/PerformanceAttribution.tsx`

- [ ] **Step 1: Check which Recharts components are still used**

The sections 2, 3, 4 do NOT use Recharts charts — they use plain divs. Check if any Recharts import is still referenced in the file. If the fallback bar chart in the `else` branch (Task 2 Step 1) is the only user of Recharts, keep the imports. If no section uses Recharts at all, remove the import block.

Based on the code read: sections 2-4 use no Recharts. The fallback in the `else` branch uses `ResponsiveContainer`, `BarChart`, `Bar`, `XAxis`, `YAxis`, `CartesianGrid`, `Tooltip`, `ReferenceLine`, `Cell`. These must stay since the fallback renders when `instrumentBreakdown` is null (no holdings data).

Keep all Recharts imports for the fallback path. No changes needed.

- [ ] **Step 2: Verify build**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds with no unused import warnings.

- [ ] **Step 3: Final commit**

```bash
git add components/seguimiento/PerformanceAttribution.tsx
git commit -m "feat: instrument-type stacked bars in PerformanceAttribution

Replaces the Recharts bar chart in 'Por Clase de Activo' section with
custom Tailwind stacked horizontal bars. Bar length proportional to
class return, segments show ETF/Acciones/Fondos/Bonos/Cash contribution.
Negative returns extend left from zero axis. Falls back to original
chart when holdings lack instrument type data."
```

---

## Verification

After all tasks:

1. `npx next build` passes
2. Manual test: open a client's seguimiento page with at least 2 snapshots that have holdings data. The "Por Clase de Activo" section should show stacked bars instead of the old single-color Recharts bars.
3. Hover over segments to see tooltips with exact contribution values.
4. If a class has negative return, its bar should extend to the left.
