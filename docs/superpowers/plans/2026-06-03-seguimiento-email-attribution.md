# Seguimiento Email Report + Attribution by Period — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a month selector to PerformanceAttribution (contribution by position for any past month) and build a comprehensive seguimiento email report with composition, returns, attribution, benchmark, and narrative.

**Architecture:** Two independent subsystems. Part A modifies `PerformanceAttribution.tsx` to add a month selector + `prices-at-date` API calls for past months. Part B creates a new email pipeline (`lib/seguimiento-email.ts` + API route + modal + SeguimientoPage integration) following the existing `radiografia-email.ts` pattern.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Resend (email), Supabase, inline CSS/SVG for email HTML.

**Spec:** `docs/superpowers/specs/2026-06-03-seguimiento-email-attribution-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `components/seguimiento/PerformanceAttribution.tsx` | Modify | Add month selector, fetch logic for past months |
| `lib/seguimiento-email.ts` | Create | Pure function `buildSeguimientoHTML()` — all email HTML generation |
| `lib/seguimiento-email.test.ts` | Create | Unit tests for email HTML builder |
| `app/api/seguimiento/send-email/route.ts` | Create | POST endpoint: auth + Resend |
| `components/seguimiento/SendSeguimientoModal.tsx` | Create | Modal with preview + email input |
| `components/seguimiento/SeguimientoPage.tsx` | Modify | Add "Enviar Reporte" button, data assembly, modal state |

---

### Task 1: PerformanceAttribution — Month Selector

**Files:**
- Modify: `components/seguimiento/PerformanceAttribution.tsx`

- [ ] **Step 1: Add month selector types and state**

At the top of the file (after the existing interfaces ~line 78), add:

```typescript
interface MonthOption {
  key: string;
  label: string;
  isAccumulated: boolean;
}
```

Inside the component function (after `const [expandedSection, ...` around line 100), add:

```typescript
  // Build month options from first cartola to current month
  const cartolas = useMemo(
    () => snapshots
      .filter((s) => s.source === "statement" || s.source === "manual" || s.source === "excel")
      .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date)),
    [snapshots]
  );

  const monthOptions = useMemo((): MonthOption[] => {
    if (cartolas.length === 0) return [{ key: "_acumulado", label: "Acumulado", isAccumulated: true }];
    const firstDate = new Date(cartolas[0].snapshot_date);
    const firstYM = `${firstDate.getFullYear()}-${String(firstDate.getMonth() + 1).padStart(2, "0")}`;
    const now = new Date();
    const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const options: MonthOption[] = [];
    let [y, m] = firstYM.split("-").map(Number);
    const [endY, endM] = currentYM.split("-").map(Number);
    while (y < endY || (y === endY && m <= endM)) {
      const ym = `${y}-${String(m).padStart(2, "0")}`;
      const d = new Date(y, m - 1, 1);
      const label = d.toLocaleDateString("es-CL", { month: "long", year: "numeric" });
      options.push({ key: ym, label: label.charAt(0).toUpperCase() + label.slice(1), isAccumulated: false });
      m++;
      if (m > 12) { m = 1; y++; }
    }
    const firstLabel = firstDate.toLocaleDateString("es-CL", { month: "short", year: "2-digit" });
    options.push({ key: "_acumulado", label: `Acumulado (desde ${firstLabel})`, isAccumulated: true });
    return options;
  }, [cartolas]);

  const [selectedMonthIdx, setSelectedMonthIdx] = useState(() => Math.max(0, monthOptions.length - 1));
  const selectedMonth = monthOptions[Math.min(selectedMonthIdx, monthOptions.length - 1)];
```

- [ ] **Step 2: Add fetch logic for past month attribution**

After the monthOptions code, add state and effect for fetching past month data:

```typescript
  const [pastMonthAttribution, setPastMonthAttribution] = useState<Array<{
    name: string; initialValue: number; finalValue: number; return: number;
    contribution: number; weight: number; assetClass?: string;
  }> | null>(null);
  const [loadingMonth, setLoadingMonth] = useState(false);

  const findCartolaNearest = (dateStr: string): typeof snapshots[0] | null => {
    let bestBefore: typeof snapshots[0] | null = null;
    let bestAfter: typeof snapshots[0] | null = null;
    for (const s of cartolas) {
      if (s.snapshot_date <= dateStr) bestBefore = s;
      else if (!bestAfter) bestAfter = s;
    }
    return bestBefore ?? bestAfter;
  };

  useEffect(() => {
    if (selectedMonth.isAccumulated) {
      setPastMonthAttribution(null);
      return;
    }

    const [y, m] = selectedMonth.key.split("-").map(Number);
    const monthEnd = `${y}-${String(m).padStart(2, "0")}-${new Date(y, m, 0).getDate()}`;
    const snap = findCartolaNearest(monthEnd);
    if (!snap?.holdings) {
      setPastMonthAttribution([]);
      return;
    }

    const holdings = snap.holdings as Array<{
      fundName: string; securityId?: string; serie?: string;
      assetClass?: string; currency?: string; market?: string;
      quantity?: number; marketValue?: number; marketValueCLP?: number;
    }>;
    const startDate = `${y}-${String(m).padStart(2, "0")}-01`;
    const now = new Date();
    const isCurrentMonth = y === now.getFullYear() && m === now.getMonth() + 1;
    const endDate = isCurrentMonth ? now.toISOString().split("T")[0] : monthEnd;

    setLoadingMonth(true);
    setPastMonthAttribution(null);

    fetch("/api/portfolio/prices-at-date", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        holdings: holdings.map(h => ({
          fundName: h.fundName,
          securityId: h.securityId || null,
          serie: h.serie || null,
          assetClass: h.assetClass,
          currency: h.currency || null,
          market: h.market || null,
        })),
        startDate,
        endDate,
      }),
    })
      .then(res => res.json())
      .then(data => {
        if (!data.success || !data.results) {
          setPastMonthAttribution([]);
          return;
        }

        let totalStartCLP = 0;
        const positions: typeof pastMonthAttribution = [];

        // First pass: calculate totals
        for (const r of data.results as Array<{
          fundName: string; assetClass?: string;
          startPrice: number | null; endPrice: number | null; returnPct: number | null;
        }>) {
          const h = holdings.find(hh => hh.fundName === r.fundName);
          const qty = h?.quantity || 1;
          if (r.startPrice) totalStartCLP += r.startPrice * qty;
        }

        // Second pass: build attribution
        for (const r of data.results as Array<{
          fundName: string; assetClass?: string;
          startPrice: number | null; endPrice: number | null; returnPct: number | null;
        }>) {
          if (r.startPrice === null || r.endPrice === null) continue;
          const h = holdings.find(hh => hh.fundName === r.fundName);
          const qty = h?.quantity || 1;
          const initCLP = r.startPrice * qty;
          const finalCLP = r.endPrice * qty;
          const valueDelta = finalCLP - initCLP;
          const contribution = totalStartCLP > 0 ? (valueDelta / totalStartCLP) * 100 : 0;
          const posReturn = initCLP > 0 ? (valueDelta / initCLP) * 100 : 0;
          positions.push({
            name: r.fundName,
            initialValue: initCLP,
            finalValue: finalCLP,
            return: posReturn,
            contribution,
            weight: totalStartCLP > 0 ? (initCLP / totalStartCLP) * 100 : 0,
            assetClass: r.assetClass || h?.assetClass,
          });
        }

        positions.sort((a, b) => b.contribution - a.contribution);
        setPastMonthAttribution(positions);
      })
      .catch(() => setPastMonthAttribution([]))
      .finally(() => setLoadingMonth(false));
  }, [selectedMonth, cartolas]);
```

- [ ] **Step 3: Add month selector UI and conditional rendering**

In the JSX, find the component's header section (the `<div>` with "Atribucion de Rendimiento" title, around line 740). Replace the header with:

```tsx
      <div className="px-6 py-4 border-b border-gb-border flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gb-black">Atribucion de Rendimiento</h2>
          <p className="text-xs text-gb-gray mt-0.5">Contribucion de cada posicion al retorno total</p>
        </div>
        {monthOptions.length > 1 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedMonthIdx(i => Math.max(0, i - 1))}
              disabled={selectedMonthIdx === 0}
              className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="w-4 h-4 text-gb-gray" />
            </button>
            <span className="text-sm font-medium text-gb-black min-w-[160px] text-center">
              {selectedMonth.label}
            </span>
            <button
              onClick={() => setSelectedMonthIdx(i => Math.min(monthOptions.length - 1, i + 1))}
              disabled={selectedMonthIdx >= monthOptions.length - 1}
              className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 transition-colors"
            >
              <ChevronRight className="w-4 h-4 text-gb-gray" />
            </button>
          </div>
        )}
      </div>
```

Add `ChevronLeft` to the existing lucide-react imports if not already there.

For the position attribution section body: when `selectedMonth.isAccumulated`, use the existing `positionAttribution` data (holdingReturnsData). When a specific month is selected, use `pastMonthAttribution`. Show a loading spinner when `loadingMonth` is true. Hide the benchmark section when a specific month is selected.

```tsx
      {loadingMonth && (
        <div className="px-6 py-8 text-center">
          <Loader className="w-5 h-5 animate-spin text-gb-primary mx-auto" />
          <p className="text-xs text-gb-gray mt-2">Cargando datos del mes...</p>
        </div>
      )}
```

Use `const activePositions = selectedMonth.isAccumulated ? positionAttribution : (pastMonthAttribution || []);` to switch data source in the existing position-rendering code.

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit 2>&1 | grep PerformanceAttribution`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add components/seguimiento/PerformanceAttribution.tsx
git commit -m "feat: add month selector to PerformanceAttribution for per-month contribution"
```

---

### Task 2: Seguimiento Email HTML Builder

**Files:**
- Create: `lib/seguimiento-email.ts`
- Create: `lib/seguimiento-email.test.ts`

- [ ] **Step 1: Write the tests**

Create `lib/seguimiento-email.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildSeguimientoHTML, type SeguimientoEmailData } from "./seguimiento-email";

function makeData(overrides: Partial<SeguimientoEmailData> = {}): SeguimientoEmailData {
  return {
    clientName: "Maria Lopez",
    reportDate: "2026-06-03",
    perfilCliente: "moderado_agresivo",
    totalValueCLP: 185000000,
    displayCurrency: "CLP",
    exchangeRates: { usd: 920, uf: 39500 },
    composition: {
      equity: { initial: 80000000, final: 95000000, returnPct: 18.75 },
      fixedIncome: { initial: 50000000, final: 52000000, returnPct: 4.0 },
      alternatives: { initial: 20000000, final: 21000000, returnPct: 5.0 },
      cash: { initial: 15000000, final: 17000000, returnPct: 0 },
    },
    periodReturns: {
      "1M": { nominal: 2.1, real: 1.8, usd: 3.2 },
      "3M": { nominal: 5.4, real: 4.9, usd: 6.1 },
      "6M": { nominal: null, real: null, usd: null },
      "1Y": { nominal: null, real: null, usd: null },
      "YTD": { nominal: 8.3, real: 7.5, usd: 9.0 },
    },
    distribution: {
      byAssetType: [
        { label: "Fondos", pct: 45 },
        { label: "Acciones", pct: 30 },
        { label: "ETFs", pct: 15 },
        { label: "Caja", pct: 10 },
      ],
      byCurrency: [
        { label: "CLP", pct: 40 },
        { label: "USD", pct: 55 },
        { label: "UF", pct: 5 },
      ],
    },
    benchmarkComparison: {
      label: "UF +2%",
      periods: {
        "1M": { portfolio: 2.1, benchmark: 0.5, diff: 1.6 },
        "3M": { portfolio: 5.4, benchmark: 1.5, diff: 3.9 },
        "YTD": { portfolio: 8.3, benchmark: 3.2, diff: 5.1 },
      },
    },
    holdingReturns: [
      { name: "Apple Inc", assetType: "Accion", returnPct: 22.5 },
      { name: "Fondo Security", assetType: "Fondo", returnPct: -3.1 },
    ],
    attribution: [
      { name: "Apple Inc", instrumentType: "Accion", contributionPp: 4.8 },
      { name: "Fondo Security", instrumentType: "Fondo", contributionPp: -0.6 },
    ],
    narrative: "El portafolio tuvo un buen desempeno este mes gracias a la exposicion a tecnologia.",
    platformUrl: "https://app.greybark.cl/seguimiento/abc123",
    ...overrides,
  };
}

describe("buildSeguimientoHTML", () => {
  it("returns valid HTML document", () => {
    const html = buildSeguimientoHTML(makeData());
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("</html>");
  });

  it("includes client name in header", () => {
    const html = buildSeguimientoHTML(makeData({ clientName: "Carlos Gonzalez" }));
    expect(html).toContain("Carlos Gonzalez");
  });

  it("includes composition section with all 4 classes", () => {
    const html = buildSeguimientoHTML(makeData());
    expect(html).toContain("Renta Variable");
    expect(html).toContain("Renta Fija");
    expect(html).toContain("Alternativos");
    expect(html).toContain("Caja");
    expect(html).toContain("18.8%"); // equity return rounded to 1 decimal
  });

  it("includes period returns table", () => {
    const html = buildSeguimientoHTML(makeData());
    expect(html).toContain("1M");
    expect(html).toContain("3M");
    expect(html).toContain("YTD");
    expect(html).toContain("+2.1%");
  });

  it("shows dash for null period returns", () => {
    const html = buildSeguimientoHTML(makeData());
    // 6M and 1Y are null
    expect(html).toContain("—");
  });

  it("includes distribution tables", () => {
    const html = buildSeguimientoHTML(makeData());
    expect(html).toContain("Fondos");
    expect(html).toContain("45.0%");
    expect(html).toContain("USD");
    expect(html).toContain("55.0%");
  });

  it("includes benchmark comparison", () => {
    const html = buildSeguimientoHTML(makeData());
    expect(html).toContain("UF +2%");
    expect(html).toContain("+1.6");
  });

  it("omits benchmark section when null", () => {
    const html = buildSeguimientoHTML(makeData({ benchmarkComparison: null }));
    expect(html).not.toContain("Benchmark");
  });

  it("includes holding returns sorted by return", () => {
    const html = buildSeguimientoHTML(makeData());
    expect(html).toContain("Apple Inc");
    expect(html).toContain("22.5%");
    expect(html).toContain("Fondo Security");
  });

  it("includes attribution with contribution bars", () => {
    const html = buildSeguimientoHTML(makeData());
    expect(html).toContain("Atribucion");
    expect(html).toContain("+4.8");
    expect(html).toContain("-0.6");
  });

  it("includes narrative when provided", () => {
    const html = buildSeguimientoHTML(makeData());
    expect(html).toContain("buen desempeno");
  });

  it("omits narrative section when null", () => {
    const html = buildSeguimientoHTML(makeData({ narrative: null }));
    expect(html).not.toContain("Explicacion");
  });

  it("uses only inline styles (no style tags)", () => {
    const html = buildSeguimientoHTML(makeData());
    expect(html).not.toMatch(/<style[\s>]/i);
  });

  it("includes footer with disclaimer and exchange rates", () => {
    const html = buildSeguimientoHTML(makeData());
    expect(html).toContain("no constituye recomendacion");
    expect(html).toContain("920");
  });

  it("converts values to display currency when USD", () => {
    const html = buildSeguimientoHTML(makeData({ displayCurrency: "USD" }));
    expect(html).toContain("USD");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/seguimiento-email.test.ts`
Expected: FAIL — module `./seguimiento-email` not found

- [ ] **Step 3: Implement the email HTML builder**

Create `lib/seguimiento-email.ts`:

```typescript
export interface SeguimientoEmailData {
  clientName: string;
  reportDate: string;
  perfilCliente: string;
  totalValueCLP: number;
  displayCurrency: string;
  exchangeRates: { usd: number; uf: number };
  composition: {
    equity: { initial: number; final: number; returnPct: number };
    fixedIncome: { initial: number; final: number; returnPct: number };
    alternatives: { initial: number; final: number; returnPct: number };
    cash: { initial: number; final: number; returnPct: number };
  };
  periodReturns: Record<string, { nominal: number | null; real: number | null; usd: number | null }>;
  distribution: {
    byAssetType: Array<{ label: string; pct: number }>;
    byCurrency: Array<{ label: string; pct: number }>;
  };
  benchmarkComparison: {
    label: string;
    periods: Record<string, { portfolio: number | null; benchmark: number | null; diff: number | null }>;
  } | null;
  holdingReturns: Array<{ name: string; assetType: string; returnPct: number }>;
  attribution: Array<{ name: string; instrumentType: string; contributionPp: number }>;
  narrative: string | null;
  platformUrl: string;
}

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

const PROFILE_LABELS: Record<string, string> = {
  conservador: "Conservador",
  moderado_conservador: "Moderado Conservador",
  moderado: "Moderado",
  moderado_agresivo: "Moderado Agresivo",
  agresivo: "Agresivo",
};

const CLASS_COLORS: Record<string, string> = {
  equity: "#3b82f6",
  fixedIncome: "#10b981",
  alternatives: "#8b5cf6",
  cash: "#94a3b8",
};

const CLASS_LABELS: Record<string, string> = {
  equity: "Renta Variable",
  fixedIncome: "Renta Fija",
  alternatives: "Alternativos",
  cash: "Caja",
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatCLP(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function formatValue(clp: number, currency: string, rates: { usd: number; uf: number }): string {
  if (currency === "USD") return `USD ${Math.round(clp / rates.usd).toLocaleString("es-CL")}`;
  if (currency === "UF") return `UF ${(clp / rates.uf).toLocaleString("es-CL", { maximumFractionDigits: 1 })}`;
  return formatCLP(clp);
}

function returnCell(val: number | null): string {
  if (val === null) return `<td style="padding:6px 8px; text-align:right; font-family:monospace; font-size:12px; color:#94a3b8;">—</td>`;
  const color = val >= 0 ? "#166534" : "#991b1b";
  const sign = val >= 0 ? "+" : "";
  return `<td style="padding:6px 8px; text-align:right; font-family:monospace; font-size:12px; color:${color}; font-weight:600;">${sign}${val.toFixed(1)}%</td>`;
}

function buildCompositionSection(comp: SeguimientoEmailData["composition"], currency: string, rates: { usd: number; uf: number }): string {
  const classes = ["equity", "fixedIncome", "alternatives", "cash"] as const;
  const rows = classes.map((cls) => {
    const c = comp[cls];
    const color = CLASS_COLORS[cls];
    const retColor = c.returnPct >= 0 ? "#166534" : "#991b1b";
    const retSign = c.returnPct >= 0 ? "+" : "";
    return `
      <tr style="border-bottom:1px solid #f1f5f9;">
        <td style="padding:10px 8px; font-family:${FONT}; font-size:13px; font-weight:500; color:#1e293b; border-left:4px solid ${color}; padding-left:12px;">${CLASS_LABELS[cls]}</td>
        <td style="padding:10px 8px; text-align:right; font-family:monospace; font-size:12px; color:#475569;">${formatValue(c.initial, currency, rates)}</td>
        <td style="padding:10px 8px; text-align:right; font-family:monospace; font-size:12px; color:#1e293b; font-weight:600;">${formatValue(c.final, currency, rates)}</td>
        <td style="padding:10px 8px; text-align:right; font-family:monospace; font-size:12px; color:${retColor}; font-weight:600;">${retSign}${c.returnPct.toFixed(1)}%</td>
      </tr>`;
  }).join("");

  return `
    <div style="padding:24px 32px; border-bottom:1px solid #e2e8f0;">
      <div style="font-size:14px; font-weight:600; color:#1e293b; margin-bottom:12px; font-family:${FONT};">Composicion del Portafolio</div>
      <table style="width:100%; border-collapse:collapse;">
        <tr style="border-bottom:1px solid #e2e8f0;">
          <th style="text-align:left; padding:6px 8px; color:#94a3b8; font-weight:500; font-size:11px; font-family:${FONT};">Clase</th>
          <th style="text-align:right; padding:6px 8px; color:#94a3b8; font-weight:500; font-size:11px; font-family:${FONT};">Inicial</th>
          <th style="text-align:right; padding:6px 8px; color:#94a3b8; font-weight:500; font-size:11px; font-family:${FONT};">Actual</th>
          <th style="text-align:right; padding:6px 8px; color:#94a3b8; font-weight:500; font-size:11px; font-family:${FONT};">Retorno</th>
        </tr>
        ${rows}
      </table>
    </div>`;
}

function buildPeriodReturnsSection(returns: SeguimientoEmailData["periodReturns"]): string {
  const periods = ["1M", "3M", "6M", "1Y", "YTD"];
  const rows = periods.map((p) => {
    const r = returns[p];
    return `
      <tr style="border-bottom:1px solid #f1f5f9;">
        <td style="padding:6px 8px; font-family:${FONT}; font-size:12px; font-weight:600; color:#1e293b;">${p}</td>
        ${returnCell(r?.nominal ?? null)}
        ${returnCell(r?.real ?? null)}
        ${returnCell(r?.usd ?? null)}
      </tr>`;
  }).join("");

  return `
    <div style="padding:24px 32px; border-bottom:1px solid #e2e8f0;">
      <div style="font-size:14px; font-weight:600; color:#1e293b; margin-bottom:12px; font-family:${FONT};">Rentabilidad por Periodo</div>
      <table style="width:100%; border-collapse:collapse;">
        <tr style="border-bottom:1px solid #e2e8f0;">
          <th style="text-align:left; padding:6px 8px; color:#94a3b8; font-weight:500; font-size:11px; font-family:${FONT};">Periodo</th>
          <th style="text-align:right; padding:6px 8px; color:#94a3b8; font-weight:500; font-size:11px; font-family:${FONT};">Nominal</th>
          <th style="text-align:right; padding:6px 8px; color:#94a3b8; font-weight:500; font-size:11px; font-family:${FONT};">Real (UF)</th>
          <th style="text-align:right; padding:6px 8px; color:#94a3b8; font-weight:500; font-size:11px; font-family:${FONT};">USD</th>
        </tr>
        ${rows}
      </table>
    </div>`;
}

function buildDistributionSection(dist: SeguimientoEmailData["distribution"]): string {
  const buildMiniTable = (title: string, items: Array<{ label: string; pct: number }>) => {
    const rows = items.map((i) => `
      <tr style="border-bottom:1px solid #f8fafc;">
        <td style="padding:4px 8px; font-family:${FONT}; font-size:12px; color:#1e293b;">${escapeHtml(i.label)}</td>
        <td style="padding:4px 8px; text-align:right; font-family:monospace; font-size:12px; font-weight:600; color:#1e293b;">${i.pct.toFixed(1)}%</td>
        <td style="padding:4px 8px; width:80px;">
          <div style="height:8px; background:#f1f5f9; border-radius:4px; overflow:hidden;">
            <div style="width:${Math.min(i.pct, 100).toFixed(0)}%; height:100%; background:#3b82f6; border-radius:4px;"></div>
          </div>
        </td>
      </tr>`).join("");

    return `
      <div style="flex:1; min-width:200px;">
        <div style="font-size:12px; font-weight:600; color:#64748b; margin-bottom:8px; font-family:${FONT};">${title}</div>
        <table style="width:100%; border-collapse:collapse;">${rows}</table>
      </div>`;
  };

  return `
    <div style="padding:24px 32px; border-bottom:1px solid #e2e8f0;">
      <div style="font-size:14px; font-weight:600; color:#1e293b; margin-bottom:16px; font-family:${FONT};">Distribucion</div>
      <div style="display:flex; gap:32px; flex-wrap:wrap;">
        ${buildMiniTable("Por Tipo de Activo", dist.byAssetType)}
        ${buildMiniTable("Por Moneda", dist.byCurrency)}
      </div>
    </div>`;
}

function buildBenchmarkSection(bm: NonNullable<SeguimientoEmailData["benchmarkComparison"]>): string {
  const periods = ["1M", "3M", "6M", "1Y", "YTD"];
  const rows = periods
    .filter((p) => bm.periods[p])
    .map((p) => {
      const d = bm.periods[p];
      const diffColor = (d.diff ?? 0) >= 0 ? "#166534" : "#991b1b";
      const diffBg = (d.diff ?? 0) >= 0 ? "#f0fdf4" : "#fef2f2";
      const diffSign = (d.diff ?? 0) >= 0 ? "+" : "";
      return `
        <tr style="border-bottom:1px solid #f1f5f9;">
          <td style="padding:6px 8px; font-family:${FONT}; font-size:12px; font-weight:600; color:#1e293b;">${p}</td>
          ${returnCell(d.portfolio)}
          ${returnCell(d.benchmark)}
          <td style="padding:6px 8px; text-align:right;">
            <span style="font-family:monospace; font-size:11px; font-weight:600; color:${diffColor}; background:${diffBg}; padding:2px 8px; border-radius:10px;">${diffSign}${(d.diff ?? 0).toFixed(1)}pp</span>
          </td>
        </tr>`;
    }).join("");

  if (!rows) return "";

  return `
    <div style="padding:24px 32px; border-bottom:1px solid #e2e8f0;">
      <div style="font-size:14px; font-weight:600; color:#1e293b; margin-bottom:12px; font-family:${FONT};">Benchmark: ${escapeHtml(bm.label)}</div>
      <table style="width:100%; border-collapse:collapse;">
        <tr style="border-bottom:1px solid #e2e8f0;">
          <th style="text-align:left; padding:6px 8px; color:#94a3b8; font-weight:500; font-size:11px; font-family:${FONT};">Periodo</th>
          <th style="text-align:right; padding:6px 8px; color:#94a3b8; font-weight:500; font-size:11px; font-family:${FONT};">Portafolio</th>
          <th style="text-align:right; padding:6px 8px; color:#94a3b8; font-weight:500; font-size:11px; font-family:${FONT};">${escapeHtml(bm.label)}</th>
          <th style="text-align:right; padding:6px 8px; color:#94a3b8; font-weight:500; font-size:11px; font-family:${FONT};">Diferencia</th>
        </tr>
        ${rows}
      </table>
    </div>`;
}

function buildHoldingReturnsSection(holdings: SeguimientoEmailData["holdingReturns"]): string {
  if (holdings.length === 0) return "";
  const top = holdings.slice(0, 20);
  const maxAbs = Math.max(...top.map((h) => Math.abs(h.returnPct)), 1);

  const rows = top.map((h) => {
    const color = h.returnPct >= 0 ? "#22c55e" : "#ef4444";
    const barWidth = Math.min((Math.abs(h.returnPct) / maxAbs) * 100, 100).toFixed(0);
    const sign = h.returnPct >= 0 ? "+" : "";
    return `
      <tr style="border-bottom:1px solid #f8fafc;">
        <td style="padding:6px 8px; font-family:${FONT}; font-size:12px; color:#1e293b; max-width:200px; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(h.name.length > 35 ? h.name.slice(0, 33) + "…" : h.name)}</td>
        <td style="padding:6px 8px; font-family:${FONT}; font-size:11px; color:#64748b;">${escapeHtml(h.assetType)}</td>
        <td style="padding:6px 8px; width:100px;">
          <div style="height:10px; background:#f1f5f9; border-radius:5px; overflow:hidden;">
            <div style="width:${barWidth}%; height:100%; background:${color}; border-radius:5px;"></div>
          </div>
        </td>
        <td style="padding:6px 8px; text-align:right; font-family:monospace; font-size:12px; color:${color}; font-weight:600;">${sign}${h.returnPct.toFixed(1)}%</td>
      </tr>`;
  }).join("");

  return `
    <div style="padding:24px 32px; border-bottom:1px solid #e2e8f0;">
      <div style="font-size:14px; font-weight:600; color:#1e293b; margin-bottom:12px; font-family:${FONT};">Rentabilidad por Posicion</div>
      <table style="width:100%; border-collapse:collapse;">
        <tr style="border-bottom:1px solid #e2e8f0;">
          <th style="text-align:left; padding:6px 8px; color:#94a3b8; font-weight:500; font-size:11px; font-family:${FONT};">Instrumento</th>
          <th style="text-align:left; padding:6px 8px; color:#94a3b8; font-weight:500; font-size:11px; font-family:${FONT};">Tipo</th>
          <th style="padding:6px 8px; color:#94a3b8; font-weight:500; font-size:11px; font-family:${FONT};"></th>
          <th style="text-align:right; padding:6px 8px; color:#94a3b8; font-weight:500; font-size:11px; font-family:${FONT};">Retorno</th>
        </tr>
        ${rows}
      </table>
    </div>`;
}

function buildAttributionSection(items: SeguimientoEmailData["attribution"]): string {
  if (items.length === 0) return "";
  const top = items.slice(0, 15);
  const total = top.reduce((s, a) => s + a.contributionPp, 0);
  const maxAbs = Math.max(...top.map((a) => Math.abs(a.contributionPp)), 0.1);

  const rows = top.map((a) => {
    const color = a.contributionPp >= 0 ? "#22c55e" : "#ef4444";
    const barWidth = Math.min((Math.abs(a.contributionPp) / maxAbs) * 100, 100).toFixed(0);
    const sign = a.contributionPp >= 0 ? "+" : "";
    return `
      <tr style="border-bottom:1px solid #f8fafc;">
        <td style="padding:6px 8px; font-family:${FONT}; font-size:12px; color:#1e293b; max-width:200px; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(a.name.length > 35 ? a.name.slice(0, 33) + "…" : a.name)}</td>
        <td style="padding:6px 8px; font-family:${FONT}; font-size:11px; color:#64748b;">${escapeHtml(a.instrumentType)}</td>
        <td style="padding:6px 8px; width:80px;">
          <div style="height:10px; background:#f1f5f9; border-radius:5px; overflow:hidden;">
            <div style="width:${barWidth}%; height:100%; background:${color}; border-radius:5px;"></div>
          </div>
        </td>
        <td style="padding:6px 8px; text-align:right; font-family:monospace; font-size:12px; color:${color}; font-weight:600;">${sign}${a.contributionPp.toFixed(1)}pp</td>
      </tr>`;
  }).join("");

  const totalColor = total >= 0 ? "#166534" : "#991b1b";
  const totalSign = total >= 0 ? "+" : "";

  return `
    <div style="padding:24px 32px; border-bottom:1px solid #e2e8f0;">
      <div style="font-size:14px; font-weight:600; color:#1e293b; margin-bottom:12px; font-family:${FONT};">Atribucion de Rendimiento</div>
      <table style="width:100%; border-collapse:collapse;">
        <tr style="border-bottom:1px solid #e2e8f0;">
          <th style="text-align:left; padding:6px 8px; color:#94a3b8; font-weight:500; font-size:11px; font-family:${FONT};">Posicion</th>
          <th style="text-align:left; padding:6px 8px; color:#94a3b8; font-weight:500; font-size:11px; font-family:${FONT};">Tipo</th>
          <th style="padding:6px 8px;"></th>
          <th style="text-align:right; padding:6px 8px; color:#94a3b8; font-weight:500; font-size:11px; font-family:${FONT};">Contribucion</th>
        </tr>
        ${rows}
        <tr style="border-top:2px solid #e2e8f0;">
          <td colspan="3" style="padding:8px 8px; font-family:${FONT}; font-size:12px; font-weight:700; color:#1e293b;">TOTAL PORTAFOLIO</td>
          <td style="padding:8px 8px; text-align:right; font-family:monospace; font-size:13px; color:${totalColor}; font-weight:700;">${totalSign}${total.toFixed(1)}pp</td>
        </tr>
      </table>
    </div>`;
}

function buildNarrativeSection(narrative: string): string {
  const paragraphs = narrative
    .split("\n\n")
    .filter((p) => p.trim())
    .map((p) => `<div style="font-size:13px; color:#475569; line-height:1.7; margin-bottom:12px; font-family:${FONT};">${escapeHtml(p)}</div>`)
    .join("");

  return `
    <div style="padding:24px 32px; border-bottom:1px solid #e2e8f0;">
      <div style="font-size:14px; font-weight:600; color:#1e293b; margin-bottom:12px; font-family:${FONT};">Explicacion de Resultados</div>
      ${paragraphs}
    </div>`;
}

export function buildSeguimientoHTML(data: SeguimientoEmailData): string {
  const profileLabel = PROFILE_LABELS[data.perfilCliente] || data.perfilCliente;
  const totalFormatted = formatValue(data.totalValueCLP, data.displayCurrency, data.exchangeRates);

  const header = `
    <div style="background:#1e293b; color:white; padding:24px 32px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div style="font-size:11px; text-transform:uppercase; letter-spacing:1.5px; color:#94a3b8; margin-bottom:4px; font-family:${FONT};">Greybark Advisors</div>
          <div style="font-size:20px; font-weight:600; font-family:${FONT};">Reporte de Seguimiento</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:14px; font-weight:500; font-family:${FONT};">${escapeHtml(data.clientName)}</div>
          <div style="font-size:12px; color:#94a3b8; font-family:${FONT};">${escapeHtml(data.reportDate)}</div>
        </div>
      </div>
      <div style="margin-top:12px; display:flex; gap:12px;">
        <div style="background:#334155; padding:6px 12px; border-radius:6px; font-size:12px; font-family:${FONT};">
          <span style="color:#94a3b8;">Perfil:</span> ${escapeHtml(profileLabel)}
        </div>
        <div style="background:#334155; padding:6px 12px; border-radius:6px; font-size:12px; font-family:${FONT};">
          <span style="color:#94a3b8;">Valor:</span> ${totalFormatted}
        </div>
      </div>
    </div>`;

  const composition = buildCompositionSection(data.composition, data.displayCurrency, data.exchangeRates);
  const periodReturns = buildPeriodReturnsSection(data.periodReturns);
  const distribution = buildDistributionSection(data.distribution);
  const benchmark = data.benchmarkComparison ? buildBenchmarkSection(data.benchmarkComparison) : "";
  const holdingReturns = buildHoldingReturnsSection(data.holdingReturns);
  const attribution = buildAttributionSection(data.attribution);
  const narrative = data.narrative ? buildNarrativeSection(data.narrative) : "";

  const footer = `
    <div style="padding:20px 32px; background:#f8fafc;">
      <div style="font-size:11px; color:#94a3b8; text-align:center; font-family:${FONT};">
        TC: USD $${data.exchangeRates.usd.toLocaleString("es-CL", { maximumFractionDigits: 0 })} · UF $${data.exchangeRates.uf.toLocaleString("es-CL", { maximumFractionDigits: 0 })}
        <br/><br/>
        Greybark Advisors &mdash; Este reporte es informativo y no constituye recomendacion de inversion.
        <br/>Para ver el seguimiento completo, <a href="${escapeHtml(data.platformUrl)}" style="color:#3b82f6; text-decoration:underline;">ingresa a la plataforma</a>.
      </div>
    </div>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Seguimiento — ${escapeHtml(data.clientName)}</title>
</head>
<body style="margin:0; padding:0; background:#f1f5f9; font-family:${FONT};">
  <div style="max-width:600px; margin:0 auto; background:#ffffff;">
    ${header}
    ${composition}
    ${periodReturns}
    ${distribution}
    ${benchmark}
    ${holdingReturns}
    ${attribution}
    ${narrative}
    ${footer}
  </div>
</body>
</html>`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/seguimiento-email.test.ts`
Expected: 15 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/seguimiento-email.ts lib/seguimiento-email.test.ts
git commit -m "feat: seguimiento email HTML builder with 15 tests"
```

---

### Task 3: Send Email API Endpoint

**Files:**
- Create: `app/api/seguimiento/send-email/route.ts`

- [ ] **Step 1: Create the API route**

```typescript
import { NextRequest } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";
import { buildSeguimientoHTML, type SeguimientoEmailData } from "@/lib/seguimiento-email";
import { Resend } from "resend";

export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "seguimiento-send-email", { limit: 5 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  return handleApiError("seguimiento-send-email", async () => {
    const body = await request.json();
    const { clientId, recipientEmail, seguimientoData } = body as {
      clientId: string;
      recipientEmail: string;
      seguimientoData: SeguimientoEmailData;
    };

    if (!clientId || !recipientEmail || !seguimientoData) {
      return errorResponse("Datos requeridos: clientId, recipientEmail, seguimientoData", 400);
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
      return errorResponse("Email invalido", 400);
    }

    const supabase = createAdminClient();
    const { data: client } = await supabase
      .from("clients")
      .select("id, nombre")
      .eq("id", clientId)
      .eq("asesor_id", advisor!.id)
      .single();

    if (!client) {
      return errorResponse("Cliente no encontrado", 404);
    }

    const html = buildSeguimientoHTML(seguimientoData);

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      return errorResponse("Email service no configurado", 500);
    }

    const resend = new Resend(resendKey);
    const senderEmail = process.env.SENDER_EMAIL || "noreply@greybark.cl";

    const { data: emailResult, error: emailError } = await resend.emails.send({
      from: `Greybark Advisors <${senderEmail}>`,
      to: recipientEmail,
      subject: `Reporte de Seguimiento — ${seguimientoData.clientName} — ${seguimientoData.reportDate}`,
      html,
    });

    if (emailError) {
      console.error("Resend error:", emailError);
      return errorResponse("Error al enviar email", 500);
    }

    return successResponse({ messageId: emailResult?.id || "sent" });
  });
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit 2>&1 | grep seguimiento`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add app/api/seguimiento/send-email/route.ts
git commit -m "feat: send seguimiento email API endpoint via Resend"
```

---

### Task 4: SendSeguimientoModal Component

**Files:**
- Create: `components/seguimiento/SendSeguimientoModal.tsx`

- [ ] **Step 1: Create the modal component**

```tsx
"use client";

import React, { useState, useMemo } from "react";
import { X, Mail, Loader, CheckCircle } from "lucide-react";
import { buildSeguimientoHTML, type SeguimientoEmailData } from "@/lib/seguimiento-email";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  clientEmail: string;
  seguimientoData: SeguimientoEmailData;
}

export default function SendSeguimientoModal({ isOpen, onClose, clientId, clientEmail, seguimientoData }: Props) {
  const [email, setEmail] = useState(clientEmail);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewHtml = useMemo(() => buildSeguimientoHTML(seguimientoData), [seguimientoData]);

  const handleSend = async () => {
    if (!email.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/seguimiento/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          recipientEmail: email.trim(),
          seguimientoData,
        }),
      });
      const result = await res.json();
      if (result.success) {
        setSent(true);
        setTimeout(() => onClose(), 2000);
      } else {
        setError(result.error || "Error al enviar");
      }
    } catch {
      setError("Error de conexion");
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50 }}>
      <div
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }}
        onClick={onClose}
      />
      <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 16 }}>
        <div className="bg-white rounded-xl shadow-2xl" style={{ width: "100%", maxWidth: 720, maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
          <div className="px-6 py-4 border-b border-gb-border flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gb-black">Enviar Reporte de Seguimiento</h2>
              <p className="text-xs text-gb-gray mt-0.5">Vista previa del reporte que recibira el cliente</p>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-md transition-colors">
              <X className="w-5 h-5 text-gb-gray" />
            </button>
          </div>

          <div className="px-6 py-3 border-b border-gb-border">
            <label className="text-xs font-medium text-gb-gray block mb-1">Destinatario</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@cliente.com"
              className="w-full px-3 py-2 text-sm border border-gb-border rounded-md focus:outline-none focus:ring-2 focus:ring-gb-primary/20 focus:border-gb-primary"
              disabled={sending || sent}
            />
          </div>

          <div className="flex-1 overflow-hidden px-6 py-3" style={{ minHeight: 300, maxHeight: 500 }}>
            <div className="border border-gb-border rounded-lg overflow-hidden h-full">
              <iframe
                srcDoc={previewHtml}
                title="Vista previa del reporte"
                style={{ width: "100%", height: "100%", border: "none", minHeight: 280 }}
                sandbox="allow-same-origin"
              />
            </div>
          </div>

          {error && (
            <div className="px-6 py-2">
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</p>
            </div>
          )}

          <div className="px-6 py-4 border-t border-gb-border flex items-center justify-end gap-3">
            {sent ? (
              <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
                <CheckCircle className="w-4 h-4" />
                Enviado correctamente
              </div>
            ) : (
              <>
                <button
                  onClick={onClose}
                  disabled={sending}
                  className="px-4 py-2 text-sm font-medium border border-gb-border rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSend}
                  disabled={sending || !email.trim()}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gb-primary rounded-lg hover:bg-gb-primary/90 disabled:opacity-50 transition-colors"
                >
                  {sending ? (
                    <><Loader className="w-4 h-4 animate-spin" />Enviando...</>
                  ) : (
                    <><Mail className="w-4 h-4" />Enviar Reporte</>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit 2>&1 | grep SendSeguimiento`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add components/seguimiento/SendSeguimientoModal.tsx
git commit -m "feat: SendSeguimientoModal with preview and email input"
```

---

### Task 5: SeguimientoPage Integration

**Files:**
- Modify: `components/seguimiento/SeguimientoPage.tsx`

This task integrates the modal into SeguimientoPage and assembles the `SeguimientoEmailData` from existing component state.

- [ ] **Step 1: Add imports and state**

Add to the imports at the top of SeguimientoPage:

```typescript
import SendSeguimientoModal from "./SendSeguimientoModal";
import type { SeguimientoEmailData } from "@/lib/seguimiento-email";
import { Mail } from "lucide-react";
```

Add `Mail` to the existing lucide-react import if it's there. Add state variables after the existing state block (~around line 156):

```typescript
  const [showSendModal, setShowSendModal] = useState(false);
  const [clientEmail, setClientEmail] = useState("");
  const [narrativeText, setNarrativeText] = useState<string | null>(null);
  const [loadingNarrative, setLoadingNarrative] = useState(false);
```

- [ ] **Step 2: Add data assembly function and modal opener**

Add after the state variables:

```typescript
  const assembleSeguimientoData = useCallback((): SeguimientoEmailData | null => {
    if (!data || !metrics) return null;
    const rates = (currentExchangeRates || exchangeRates);
    if (!rates) return null;

    // Composition from boxes (the computed boxes array already has initial/final/returnPct)
    // We need to compute it here from metrics + holdingReturnsData
    const latestValue = livePortfolioValue ?? metrics.currentValue;
    const initialValue = metrics.initialValue;

    // Build composition from holdingReturnsData if available
    let comp: SeguimientoEmailData["composition"];
    if (holdingReturnsData) {
      const hr = holdingReturnsData;
      const eqFinal = hr.equityHoldings?.reduce((s: number, h: { marketValue: number }) => s + h.marketValue, 0) || 0;
      const fiFinal = (hr.fixedIncomeFundHoldings?.reduce((s: number, h: { marketValue: number }) => s + h.marketValue, 0) || 0) +
                      (hr.bondHoldings?.reduce((s: number, h: { marketValue: number }) => s + h.marketValue, 0) || 0);
      const altFinal = hr.alternativesHoldings?.reduce((s: number, h: { marketValue: number }) => s + h.marketValue, 0) || 0;
      const cashFinal = hr.cashValue || 0;

      const eqInitial = initialValue * (metrics.composition.equity / 100);
      const fiInitial = initialValue * (metrics.composition.fixedIncome / 100);
      const altInitial = initialValue * (metrics.composition.alternatives / 100);
      const cashInitial = initialValue * (metrics.composition.cash / 100);

      comp = {
        equity: { initial: eqInitial, final: eqFinal, returnPct: eqInitial > 0 ? ((eqFinal / eqInitial) - 1) * 100 : 0 },
        fixedIncome: { initial: fiInitial, final: fiFinal, returnPct: fiInitial > 0 ? ((fiFinal / fiInitial) - 1) * 100 : 0 },
        alternatives: { initial: altInitial, final: altFinal, returnPct: altInitial > 0 ? ((altFinal / altInitial) - 1) * 100 : 0 },
        cash: { initial: cashInitial, final: cashFinal, returnPct: 0 },
      };
    } else {
      comp = {
        equity: { initial: initialValue * metrics.composition.equity / 100, final: latestValue * metrics.composition.equity / 100, returnPct: 0 },
        fixedIncome: { initial: initialValue * metrics.composition.fixedIncome / 100, final: latestValue * metrics.composition.fixedIncome / 100, returnPct: 0 },
        alternatives: { initial: initialValue * metrics.composition.alternatives / 100, final: latestValue * metrics.composition.alternatives / 100, returnPct: 0 },
        cash: { initial: initialValue * metrics.composition.cash / 100, final: latestValue * metrics.composition.cash / 100, returnPct: 0 },
      };
    }

    // Period returns
    const pr: SeguimientoEmailData["periodReturns"] = {};
    for (const p of ["1M", "3M", "6M", "1Y", "YTD"]) {
      const ret = periodReturns?.[p as keyof typeof periodReturns] as { nominal: number; real: number | null; usd: number | null } | null;
      pr[p] = ret ? { nominal: ret.nominal, real: ret.real ?? null, usd: ret.usd ?? null } : { nominal: null, real: null, usd: null };
    }

    // Distribution
    const distByType: Array<{ label: string; pct: number }> = [];
    const distByCurrency: Array<{ label: string; pct: number }> = [];
    if (holdingReturnsData) {
      const typeMap = new Map<string, number>();
      const currMap = new Map<string, number>();
      const allH = [
        ...(holdingReturnsData.equityHoldings || []),
        ...(holdingReturnsData.fixedIncomeFundHoldings || []),
        ...(holdingReturnsData.bondHoldings || []),
        ...(holdingReturnsData.alternativesHoldings || []),
      ];
      for (const h of allH) {
        const type = (h as { assetType?: string }).assetType || "Otro";
        typeMap.set(type, (typeMap.get(type) || 0) + (h.weight || 0));
        const curr = (h as { currency?: string }).currency || "CLP";
        currMap.set(curr, (currMap.get(curr) || 0) + (h.weight || 0));
      }
      if (holdingReturnsData.cashValue && holdingReturnsData.totalValue) {
        const cashPct = (holdingReturnsData.cashValue / holdingReturnsData.totalValue) * 100;
        typeMap.set("Caja", (typeMap.get("Caja") || 0) + cashPct);
        currMap.set("CLP", (currMap.get("CLP") || 0) + cashPct);
      }
      for (const [label, pct] of [...typeMap.entries()].sort((a, b) => b[1] - a[1])) distByType.push({ label, pct });
      for (const [label, pct] of [...currMap.entries()].sort((a, b) => b[1] - a[1])) distByCurrency.push({ label, pct });
    }

    // Benchmark
    let bmComp: SeguimientoEmailData["benchmarkComparison"] = null;
    if (benchmarkReturns && periodReturns) {
      const periods: Record<string, { portfolio: number | null; benchmark: number | null; diff: number | null }> = {};
      for (const p of ["1M", "3M", "6M", "1Y", "YTD"]) {
        const pRet = (periodReturns as Record<string, { nominal: number } | null>)?.[p]?.nominal ?? null;
        const bRet = (benchmarkReturns as Record<string, number>)?.[p] ?? null;
        if (pRet !== null || bRet !== null) {
          periods[p] = {
            portfolio: pRet,
            benchmark: bRet,
            diff: pRet !== null && bRet !== null ? pRet - bRet : null,
          };
        }
      }
      if (Object.keys(periods).length > 0) {
        bmComp = { label: benchmarkLabel, periods };
      }
    }

    // Holding returns
    const holdingRetList: SeguimientoEmailData["holdingReturns"] = [];
    if (holdingReturnsData) {
      const allHoldings = [
        ...(holdingReturnsData.equityHoldings || []).map((h: { fundName: string; totalReturn?: number; assetType?: string }) => ({ name: h.fundName, assetType: h.assetType || "Accion", returnPct: h.totalReturn ?? 0 })),
        ...(holdingReturnsData.fixedIncomeFundHoldings || []).map((h: { fundName: string; totalReturn?: number; assetType?: string }) => ({ name: h.fundName, assetType: h.assetType || "Fondo", returnPct: h.totalReturn ?? 0 })),
        ...(holdingReturnsData.bondHoldings || []).map((h: { fundName: string; totalReturn?: number }) => ({ name: h.fundName, assetType: "Bono", returnPct: h.totalReturn ?? 0 })),
        ...(holdingReturnsData.alternativesHoldings || []).map((h: { fundName: string; totalReturn?: number; assetType?: string }) => ({ name: h.fundName, assetType: h.assetType || "Alternativo", returnPct: h.totalReturn ?? 0 })),
      ];
      allHoldings.sort((a, b) => b.returnPct - a.returnPct);
      holdingRetList.push(...allHoldings.slice(0, 20));
    }

    // Attribution — same calculation as PerformanceAttribution positionAttribution
    const attrList: SeguimientoEmailData["attribution"] = [];
    if (holdingReturnsData) {
      const allH = [
        ...(holdingReturnsData.equityHoldings || []),
        ...(holdingReturnsData.fixedIncomeFundHoldings || []),
        ...(holdingReturnsData.bondHoldings || []),
        ...(holdingReturnsData.alternativesHoldings || []),
      ];
      for (const h of allH) {
        attrList.push({
          name: h.fundName,
          instrumentType: (h as { assetType?: string }).assetType || "Otro",
          contributionPp: h.contribution ?? 0,
        });
      }
      attrList.sort((a, b) => b.contributionPp - a.contributionPp);
    }

    return {
      clientName: `${data.client.nombre} ${data.client.apellido}`,
      reportDate: new Date().toLocaleDateString("es-CL"),
      perfilCliente: data.client.perfil_riesgo || "moderado",
      totalValueCLP: latestValue,
      displayCurrency: displayCurrency,
      exchangeRates: rates,
      composition: comp,
      periodReturns: pr,
      distribution: { byAssetType: distByType, byCurrency: distByCurrency },
      benchmarkComparison: bmComp,
      holdingReturns: holdingRetList,
      attribution: attrList.slice(0, 15),
      narrative: narrativeText,
      platformUrl: typeof window !== "undefined" ? `${window.location.origin}/clients/${clientId}/seguimiento` : "",
    };
  }, [data, metrics, holdingReturnsData, periodReturns, benchmarkReturns, benchmarkLabel, currentExchangeRates, exchangeRates, livePortfolioValue, displayCurrency, narrativeText, clientId]);

  const openSendModal = useCallback(async () => {
    // Fetch client email if not cached
    if (!clientEmail) {
      try {
        const res = await fetch(`/api/clients/${clientId}`);
        const d = await res.json();
        if (d.success && d.data?.client?.email) {
          setClientEmail(d.data.client.email);
        }
      } catch { /* ignore */ }
    }

    // Fetch narrative from monthly closing if not cached
    if (!narrativeText && !loadingNarrative) {
      setLoadingNarrative(true);
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      try {
        const res = await fetch(`/api/client-closings?clientId=${clientId}&month=${month}`);
        const d = await res.json();
        if (d.success && d.closing?.content) {
          setNarrativeText(d.closing.content);
        }
      } catch { /* ignore */ }
      setLoadingNarrative(false);
    }

    setShowSendModal(true);
  }, [clientId, clientEmail, narrativeText, loadingNarrative]);
```

- [ ] **Step 3: Add the button and modal to JSX**

Find the header area of SeguimientoPage where the "Actualizar" button is (search for `<RefreshCw`). Add the "Enviar Reporte" button next to it:

```tsx
          <button
            onClick={openSendModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-gb-primary rounded-md hover:bg-gb-primary/90 transition-colors"
          >
            <Mail className="w-3.5 h-3.5" />
            Enviar Reporte
          </button>
```

At the end of the component JSX (before the closing `</div>` and before the return's closing), add:

```tsx
      {showSendModal && (() => {
        const emailData = assembleSeguimientoData();
        if (!emailData) return null;
        return (
          <SendSeguimientoModal
            isOpen={showSendModal}
            onClose={() => setShowSendModal(false)}
            clientId={clientId}
            clientEmail={clientEmail}
            seguimientoData={emailData}
          />
        );
      })()}
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit 2>&1 | grep SeguimientoPage`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add components/seguimiento/SeguimientoPage.tsx components/seguimiento/SendSeguimientoModal.tsx
git commit -m "feat: integrate seguimiento email report with data assembly and send modal"
```

---

### Task 6: Final Verification

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: all tests pass (existing + new seguimiento-email tests)

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: no new errors (only pre-existing rate-limit.test.ts errors)

- [ ] **Step 3: Commit any fixes**

If any issues found, fix and commit.

---

## Self-Review Checklist

1. **Spec coverage:**
   - Part A (month selector in PerformanceAttribution): Task 1 ✓
   - Part B (email HTML builder): Task 2 ✓
   - Part B (send API endpoint): Task 3 ✓
   - Part B (modal component): Task 4 ✓
   - Part B (SeguimientoPage integration + data assembly): Task 5 ✓
   - Composition, period returns, distribution, benchmark, holding returns, attribution, narrative: all sections in Task 2 ✓
   - Narrative from monthly closing: Task 5 `openSendModal` ✓

2. **Placeholder scan:** No TBD/TODO. All code blocks complete.

3. **Type consistency:** `SeguimientoEmailData` used consistently in Tasks 2-5. `MonthOption` defined and used in Task 1. `buildSeguimientoHTML` signature matches across test and implementation.
