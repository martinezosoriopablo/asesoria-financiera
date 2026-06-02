# Radiografia v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Radiografia page into a visual diagnostic tool with treemaps, instrument-type-aware grouping, auto-generated observations, and on-demand Claude narrative.

**Architecture:** Top-down flow: macro allocation (bars + donuts) → instrument breakdown (stocks by sector, funds by category, bonds by type) with treemap + detail table per group → auto-generated observation bullets → on-demand Claude narrative. Backend enhanced to return `instrumentBreakdown` and `observations` alongside existing data.

**Tech Stack:** Next.js 16, React 19, Recharts (Treemap, PieChart), Tailwind v4, Supabase, Claude API via `lib/ai-usage.ts`

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `lib/instrument-type.ts` | `detectInstrumentType()` function + `buildInstrumentBreakdown()` |
| `lib/observations.ts` | `generateObservations()` rules engine |
| `app/api/portfolio/radiografia/narrative/route.ts` | On-demand Claude narrative endpoint |
| `components/recomendacion/MacroAllocationV2.tsx` | Bars + 2 donut charts |
| `components/recomendacion/StocksTreemap.tsx` | Treemap + sector-grouped detail table |
| `components/recomendacion/FundsBreakdown.tsx` | Treemap + category-grouped table for funds |
| `components/recomendacion/BondsBreakdown.tsx` | Table grouped by bond type |
| `components/recomendacion/ObservacionesPanel.tsx` | Auto-generated observation cards |
| `components/recomendacion/NarrativeAnalysis.tsx` | On-demand Claude narrative button + display |

### Modified files
| File | Changes |
|------|---------|
| `app/api/portfolio/radiografia/route.ts` | Fix ticker regex, add `instrumentBreakdown` + `observations` to response |
| `components/recomendacion/RecomendacionPage.tsx` | Rewrite to use new components + new data shape |

### Deleted files
| File | Reason |
|------|--------|
| `components/recomendacion/MacroAllocation.tsx` | Replaced by MacroAllocationV2 |
| `components/recomendacion/SectorBreakdown.tsx` | Replaced by StocksTreemap |
| `components/recomendacion/HoldingsTable.tsx` | Replaced by InstrumentBreakdown components |

---

### Task 1: Instrument Type Detection

**Files:**
- Create: `lib/instrument-type.ts`
- Create: `lib/instrument-type.test.ts`

- [ ] **Step 1: Write tests for detectInstrumentType**

```typescript
// lib/instrument-type.test.ts
import { describe, it, expect } from "vitest";
import { detectInstrumentType } from "./instrument-type";

describe("detectInstrumentType", () => {
  it("detects cash by assetClass", () => {
    expect(detectInstrumentType({ fundName: "Saldo", assetClass: "cash" })).toBe("cash");
  });

  it("detects cash by name keyword", () => {
    expect(detectInstrumentType({ fundName: "Caja USD" })).toBe("cash");
    expect(detectInstrumentType({ fundName: "LIQUIDEZ CLP" })).toBe("cash");
  });

  it("detects bond by coupon+maturity", () => {
    expect(detectInstrumentType({
      fundName: "US Treasury 4.5%",
      couponRate: 4.5,
      maturityDate: "2030-01-15",
    })).toBe("bond");
  });

  it("detects bond by CUSIP pattern", () => {
    expect(detectInstrumentType({
      fundName: "Ecopetrol 5.875%",
      securityId: "279158AQ8",
    })).toBe("bond");
  });

  it("detects fund by numeric RUN", () => {
    expect(detectInstrumentType({ fundName: "Banchile RV", securityId: "8052" })).toBe("fund");
  });

  it("detects etf by CFIETF prefix", () => {
    expect(detectInstrumentType({ fundName: "ETF IPSA", securityId: "CFIETFIPSA" })).toBe("etf");
  });

  it("detects etf by known ETF ticker", () => {
    expect(detectInstrumentType({ fundName: "Vanguard S&P 500", securityId: "VOO" })).toBe("etf");
    expect(detectInstrumentType({ fundName: "iShares MSCI EM", securityId: "VWO" })).toBe("etf");
  });

  it("detects stock by alpha ticker", () => {
    expect(detectInstrumentType({ fundName: "Apple Inc", securityId: "AAPL" })).toBe("stock");
    expect(detectInstrumentType({ fundName: "Alphabet", securityId: "GOOGL" })).toBe("stock");
    expect(detectInstrumentType({ fundName: "Meta", securityId: "META" })).toBe("stock");
  });

  it("detects fund as default when no securityId", () => {
    expect(detectInstrumentType({ fundName: "Fondo Mutuo Banchile" })).toBe("fund");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/instrument-type.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement detectInstrumentType**

```typescript
// lib/instrument-type.ts

export type InstrumentType = "stock" | "fund" | "bond" | "etf" | "cash";

// Known ETF tickers (from comite categories + secondary)
const ETF_TICKERS = new Set([
  // Primary
  "VOO", "VEA", "VWO", "ECH", "IEF", "SHY", "LQD", "TIP", "HYG", "EMB",
  "GLD", "VNQ", "SGOV",
  // UCITS
  "CSPX", "IWDA", "EIMI", "IDTM", "IBTS", "LQDE", "ITPS", "IHYG", "EMHC",
  "SGLN", "IPRP", "ERNS",
  // Secondary
  "SPY", "IVV", "QQQ", "SPLG", "SCHX", "VTI", "EFA", "IEFA", "SPDW",
  "IEMG", "SCHE", "AGG", "BND", "GOVT", "VGIT", "VGSH", "SCHO", "BIL",
  "VCIT", "IGIB", "SCHP", "VTIP", "JNK", "USHY", "VWOB", "PCY",
  "IAU", "GLDM", "SCHH", "IYR", "SHV", "GBIL",
]);

interface HoldingInput {
  fundName: string;
  securityId?: string | null;
  assetClass?: string;
  assetType?: string;
  couponRate?: number | null;
  maturityDate?: string | null;
}

export function detectInstrumentType(h: HoldingInput): InstrumentType {
  const sid = h.securityId?.trim().toUpperCase() || "";
  const nameLower = h.fundName.toLowerCase();
  const assetLower = h.assetClass?.toLowerCase() || "";

  // 1. Cash
  if (assetLower === "cash" || /\bcash\b|\bcaja\b|\bliquidez\b/i.test(nameLower)) {
    return "cash";
  }

  // 2. Bond (coupon+maturity or CUSIP)
  if (h.couponRate != null && h.maturityDate) return "bond";
  if (sid && /^[A-Z0-9]{9}$/.test(sid) && /\d/.test(sid) && /[A-Z]/.test(sid)) {
    return "bond";
  }

  // 3. Chilean fund (numeric RUN)
  if (sid && /^\d+$/.test(sid)) return "fund";

  // 4. Chilean ETF
  if (sid.startsWith("CFIETF")) return "etf";

  // 5. Known ETF ticker
  if (sid && ETF_TICKERS.has(sid)) return "etf";

  // 6. Stock (remaining alpha ticker, 1-6 chars)
  if (sid && /^[A-Z]{1,6}$/.test(sid)) return "stock";

  // 7. Chilean FI
  if (sid.startsWith("CFI")) return "fund";

  // 8. Default
  return "fund";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/instrument-type.test.ts`
Expected: 9 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/instrument-type.ts lib/instrument-type.test.ts
git commit -m "feat: add detectInstrumentType for radiografia v2"
```

---

### Task 2: Observations Rules Engine

**Files:**
- Create: `lib/observations.ts`
- Create: `lib/observations.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// lib/observations.test.ts
import { describe, it, expect } from "vitest";
import { generateObservations, type ObservationInput } from "./observations";

function makeInput(overrides: Partial<ObservationInput> = {}): ObservationInput {
  return {
    allocation: {
      rv: { actual: 60, target: 60, delta: 0 },
      rf: { actual: 25, target: 25, delta: 0 },
      alt: { actual: 10, target: 10, delta: 0 },
      cash: { actual: 5, target: 5, delta: 0 },
    },
    holdings: [
      { name: "AAPL", weightPct: 10, confidence: "high" },
      { name: "MSFT", weightPct: 8, confidence: "high" },
      { name: "GOOGL", weightPct: 7, confidence: "high" },
    ],
    sectorBreakdown: [],
    ...overrides,
  };
}

describe("generateObservations", () => {
  it("returns empty for balanced portfolio", () => {
    const obs = generateObservations(makeInput());
    expect(obs.length).toBe(0);
  });

  it("detects zero allocation gap", () => {
    const obs = generateObservations(makeInput({
      allocation: {
        rv: { actual: 95, target: 60, delta: 35 },
        rf: { actual: 0, target: 25, delta: -25 },
        alt: { actual: 0, target: 10, delta: -10 },
        cash: { actual: 5, target: 5, delta: 0 },
      },
    }));
    const rfObs = obs.find((o) => o.text.includes("Renta Fija"));
    expect(rfObs).toBeDefined();
    expect(rfObs!.severity).toBe("alta");
  });

  it("detects concentration in top 3", () => {
    const obs = generateObservations(makeInput({
      holdings: [
        { name: "AAPL", weightPct: 25, confidence: "high" },
        { name: "MSFT", weightPct: 20, confidence: "high" },
        { name: "GOOGL", weightPct: 15, confidence: "high" },
      ],
    }));
    expect(obs.some((o) => o.text.includes("3 mayores posiciones"))).toBe(true);
  });

  it("detects single position > 15%", () => {
    const obs = generateObservations(makeInput({
      holdings: [
        { name: "AAPL", weightPct: 20, confidence: "high" },
        { name: "MSFT", weightPct: 5, confidence: "high" },
      ],
    }));
    expect(obs.some((o) => o.text.includes("AAPL"))).toBe(true);
  });

  it("detects low confidence holdings", () => {
    const obs = generateObservations(makeInput({
      holdings: [
        { name: "XYZ", weightPct: 5, confidence: "low" },
        { name: "ABC", weightPct: 3, confidence: "low" },
      ],
    }));
    expect(obs.some((o) => o.text.includes("confianza baja"))).toBe(true);
  });

  it("detects sector vs comite mismatch", () => {
    const obs = generateObservations(makeInput({
      sectorBreakdown: [
        { sector: "Technology", sleeveVista: "UW", deltaPp: 8 },
      ],
    }));
    expect(obs.some((o) => o.text.includes("Technology") && o.text.includes("Underweight"))).toBe(true);
  });

  it("sorts by severity (alta first)", () => {
    const obs = generateObservations(makeInput({
      allocation: {
        rv: { actual: 95, target: 60, delta: 35 },
        rf: { actual: 0, target: 25, delta: -25 },
        alt: { actual: 0, target: 10, delta: -10 },
        cash: { actual: 5, target: 5, delta: 0 },
      },
      holdings: [
        { name: "XYZ", weightPct: 5, confidence: "low" },
      ],
    }));
    expect(obs[0].severity).toBe("alta");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/observations.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement generateObservations**

```typescript
// lib/observations.ts

export interface Observation {
  severity: "alta" | "media" | "info";
  text: string;
}

export interface ObservationInput {
  allocation: Record<string, { actual: number; target: number; delta: number }>;
  holdings: Array<{ name: string; weightPct: number; confidence: string }>;
  sectorBreakdown: Array<{
    sector: string;
    sleeveVista: string | null;
    deltaPp: number;
  }>;
}

const ROLE_LABELS: Record<string, string> = {
  rv: "Renta Variable",
  rf: "Renta Fija",
  alt: "Alternativos",
  cash: "Caja",
};

const SEVERITY_ORDER: Record<string, number> = { alta: 0, media: 1, info: 2 };

export function generateObservations(input: ObservationInput): Observation[] {
  const obs: Observation[] = [];

  // 1. Macro allocation gaps
  for (const [role, alloc] of Object.entries(input.allocation)) {
    if (alloc.target > 5 && alloc.actual === 0) {
      obs.push({
        severity: "alta",
        text: `Sin exposicion a ${ROLE_LABELS[role] || role} — modelo sugiere ${alloc.target.toFixed(0)}%`,
      });
    } else if (Math.abs(alloc.delta) > 10) {
      obs.push({
        severity: "alta",
        text: `${ROLE_LABELS[role] || role} desviado ${alloc.delta > 0 ? "+" : ""}${alloc.delta.toFixed(1)}pp vs modelo`,
      });
    }
  }

  // 2. Concentration risk (top 3 > 50%)
  const sorted = [...input.holdings].sort((a, b) => b.weightPct - a.weightPct);
  const top3Weight = sorted.slice(0, 3).reduce((s, h) => s + h.weightPct, 0);
  if (top3Weight > 50) {
    obs.push({
      severity: "media",
      text: `Las 3 mayores posiciones representan ${top3Weight.toFixed(0)}% del portafolio`,
    });
  }

  // 3. Single position > 15%
  for (const h of sorted) {
    if (h.weightPct > 15) {
      obs.push({
        severity: "media",
        text: `${h.name} representa ${h.weightPct.toFixed(1)}% — considerar diversificar`,
      });
    }
  }

  // 4. Sector vs comite view mismatches
  for (const sector of input.sectorBreakdown) {
    if (sector.sleeveVista === "UW" && sector.deltaPp > 5) {
      obs.push({
        severity: "media",
        text: `${sector.sector} sobreponderado +${sector.deltaPp.toFixed(1)}pp, comite recomienda Underweight`,
      });
    }
    if (sector.sleeveVista === "OW" && sector.deltaPp < -5) {
      obs.push({
        severity: "info",
        text: `${sector.sector} subponderado, comite recomienda Overweight (oportunidad)`,
      });
    }
  }

  // 5. Low confidence classifications
  const lowConf = input.holdings.filter((h) => h.confidence === "low");
  if (lowConf.length > 0) {
    obs.push({
      severity: "info",
      text: `${lowConf.length} posicion(es) clasificadas con confianza baja — revisar manualmente`,
    });
  }

  return obs.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/observations.test.ts`
Expected: 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/observations.ts lib/observations.test.ts
git commit -m "feat: add observations rules engine for radiografia v2"
```

---

### Task 3: Enhance Radiografia API — instrumentBreakdown + observations + fix ticker regex

**Files:**
- Modify: `app/api/portfolio/radiografia/route.ts`

This task modifies the existing radiografia API to:
1. Fix the ticker regex from `^[A-Z]{1,5}$` to `^[A-Z]{1,6}$`
2. Add instrument type detection to classify holdings
3. Build `instrumentBreakdown` grouped by type
4. Generate `observations` from rules engine
5. Return new fields in response

- [ ] **Step 1: Fix ticker regex (line 272)**

In `app/api/portfolio/radiografia/route.ts`, find line 272:
```typescript
        return sid && !/^\d+$/.test(sid) && /^[A-Z]{1,5}$/.test(sid);
```
Replace with:
```typescript
        return sid && !/^\d+$/.test(sid) && /^[A-Z]{1,6}$/.test(sid);
```

- [ ] **Step 2: Add imports at top of file**

After the existing imports (line 17), add:
```typescript
import { detectInstrumentType, type InstrumentType } from "@/lib/instrument-type";
import { generateObservations, type Observation } from "@/lib/observations";
```

- [ ] **Step 3: Add instrumentBreakdown building after section 12b (sectorBreakdown)**

After line 588 (end of sectorBreakdown sort), add a new section:

```typescript
    // ── 12d. Build instrument breakdown ─────────────────────────────
    const instrumentBreakdown: {
      stocks: Array<{
        ticker: string;
        name: string;
        sector: string;
        industry: string;
        country: string;
        marketValueUSD: number;
        marketValueCLP: number;
        weightPct: number;
        categoryId: string;
        confidence: string;
      }>;
      funds: Array<{
        fundName: string;
        securityId: string;
        categoryId: string;
        categoryLabel: string;
        marketValueCLP: number;
        weightPct: number;
        confidence: string;
      }>;
      bonds: Array<{
        name: string;
        securityId: string;
        couponRate: number;
        maturityDate: string;
        creditRating: string | null;
        bondType: "government" | "corporate" | "em_sovereign";
        marketValueUSD: number;
        marketValueCLP: number;
        weightPct: number;
      }>;
      etfs: Array<{
        ticker: string;
        name: string;
        categoryId: string;
        categoryLabel: string;
        marketValueCLP: number;
        weightPct: number;
      }>;
      cash: Array<{
        name: string;
        marketValueCLP: number;
        weightPct: number;
        currency: string;
      }>;
    } = { stocks: [], funds: [], bonds: [], etfs: [], cash: [] };

    for (const h of classifiedHoldings) {
      const instrType = detectInstrumentType(h);
      const weightPct = totalValueCLP > 0
        ? Math.round((h.valueCLP / totalValueCLP) * 10000) / 100
        : 0;

      switch (instrType) {
        case "stock": {
          const sid = h.securityId?.trim().toUpperCase() || "";
          const profile = stockProfiles.get(sid);
          instrumentBreakdown.stocks.push({
            ticker: sid,
            name: profile?.name || h.fundName,
            sector: profile?.sector || "Sin clasificar",
            industry: profile?.industry || "",
            country: profile?.country || "",
            marketValueUSD: h.marketValue || 0,
            marketValueCLP: h.valueCLP,
            weightPct,
            categoryId: h.categoryId,
            confidence: h.confidence,
          });
          break;
        }
        case "fund": {
          const cat = getCategoryById(h.categoryId);
          instrumentBreakdown.funds.push({
            fundName: h.fundName,
            securityId: h.securityId?.trim() || "",
            categoryId: h.categoryId,
            categoryLabel: cat?.label || h.categoryId,
            marketValueCLP: h.valueCLP,
            weightPct,
            confidence: h.confidence,
          });
          break;
        }
        case "bond": {
          const bondType: "government" | "corporate" | "em_sovereign" =
            h.categoryId === "rf_em_sovereign" ? "em_sovereign" :
            h.categoryId === "rf_ust_belly" || h.categoryId === "rf_ust_short" || h.categoryId === "rf_tips" ? "government" :
            "corporate";
          instrumentBreakdown.bonds.push({
            name: h.fundName,
            securityId: h.securityId?.trim() || "",
            couponRate: h.couponRate || 0,
            maturityDate: h.maturityDate || "",
            creditRating: (h as any).creditRating || null,
            bondType,
            marketValueUSD: h.marketValue || 0,
            marketValueCLP: h.valueCLP,
            weightPct,
          });
          break;
        }
        case "etf": {
          const cat = getCategoryById(h.categoryId);
          instrumentBreakdown.etfs.push({
            ticker: h.securityId?.trim().toUpperCase() || "",
            name: h.fundName,
            categoryId: h.categoryId,
            categoryLabel: cat?.label || h.categoryId,
            marketValueCLP: h.valueCLP,
            weightPct,
          });
          break;
        }
        case "cash": {
          instrumentBreakdown.cash.push({
            name: h.fundName,
            marketValueCLP: h.valueCLP,
            weightPct,
            currency: h.currency || "USD",
          });
          break;
        }
      }
    }
```

- [ ] **Step 4: Generate observations after instrumentBreakdown**

After the instrumentBreakdown code, add:

```typescript
    // ── 12e. Generate observations ──────────────────────────────────
    const allHoldingsForObs = classifiedHoldings.map((h) => ({
      name: h.securityId?.trim() || h.fundName,
      weightPct: totalValueCLP > 0
        ? Math.round((h.valueCLP / totalValueCLP) * 10000) / 100
        : 0,
      confidence: h.confidence,
    }));

    const observations = generateObservations({
      allocation,
      holdings: allHoldingsForObs,
      sectorBreakdown: sectorBreakdown.map((s) => ({
        sector: s.sector,
        sleeveVista: s.sleeveVista,
        deltaPp: s.deltaPp,
      })),
    });
```

- [ ] **Step 5: Add new fields to the response object**

In the `successResponse` call (around line 658), add `instrumentBreakdown` and `observations` to the `data` object:

Find:
```typescript
        stockProfiles: Object.fromEntries(stockProfiles),
        taxAnalysisEnabled: !isAllInternacional,
```
Replace with:
```typescript
        stockProfiles: Object.fromEntries(stockProfiles),
        instrumentBreakdown,
        observations,
        taxAnalysisEnabled: !isAllInternacional,
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 7: Commit**

```bash
git add app/api/portfolio/radiografia/route.ts
git commit -m "feat: add instrumentBreakdown + observations to radiografia API"
```

---

### Task 4: Narrative API Endpoint

**Files:**
- Create: `app/api/portfolio/radiografia/narrative/route.ts`

- [ ] **Step 1: Create the narrative endpoint**

```typescript
// app/api/portfolio/radiografia/narrative/route.ts
import { NextRequest } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";
import { trackAIUsage } from "@/lib/ai-usage";

export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "radiografia-narrative", { limit: 5 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  return handleApiError("radiografia-narrative", async () => {
    const body = await request.json();
    const {
      allocation,
      observations,
      sectorBreakdown,
      totalValueCLP,
      perfilCliente,
      perfilModelo,
      notaComite,
      clientName,
    } = body as {
      allocation: Record<string, { actual: number; target: number; delta: number }>;
      observations: Array<{ severity: string; text: string }>;
      sectorBreakdown: Array<{ sector: string; actualPct: number; sleevePct: number | null; deltaPp: number }>;
      totalValueCLP: number;
      perfilCliente: string;
      perfilModelo: string;
      notaComite: string | null;
      clientName: string;
    };

    if (!allocation || !observations) {
      return errorResponse("Datos de portafolio requeridos", 400);
    }

    // Load advisor's preferred model
    const supabase = createAdminClient();
    const { data: advisorRow } = await supabase
      .from("advisors")
      .select("preferred_ai_model")
      .eq("id", advisor!.id)
      .single();

    const model = advisorRow?.preferred_ai_model || "claude-sonnet-4-20250514";

    const ROLE_LABELS: Record<string, string> = {
      rv: "Renta Variable",
      rf: "Renta Fija",
      alt: "Alternativos",
      cash: "Caja",
    };

    const allocSummary = Object.entries(allocation)
      .map(([role, a]) => `- ${ROLE_LABELS[role] || role}: ${a.actual.toFixed(1)}% actual vs ${a.target.toFixed(1)}% modelo (${a.delta > 0 ? "+" : ""}${a.delta.toFixed(1)}pp)`)
      .join("\n");

    const obsSummary = observations.map((o) => `- [${o.severity.toUpperCase()}] ${o.text}`).join("\n");

    const sectorSummary = sectorBreakdown
      .filter((s) => Math.abs(s.deltaPp) > 2)
      .map((s) => `- ${s.sector}: ${s.actualPct.toFixed(1)}% actual${s.sleevePct != null ? ` vs ${s.sleevePct.toFixed(1)}% sleeve` : ""} (${s.deltaPp > 0 ? "+" : ""}${s.deltaPp.toFixed(1)}pp)`)
      .join("\n");

    const totalUSD = Math.round(totalValueCLP / 950);
    const prompt = `Eres un asesor financiero senior chileno redactando un diagnostico de cartera para tu cliente ${clientName}.

Datos del portafolio:
- Valor total: ~USD ${totalUSD.toLocaleString()} (CLP ${Math.round(totalValueCLP / 1e6).toLocaleString()}M)
- Perfil de riesgo del cliente: ${perfilCliente}
- Modelo asignado: ${perfilModelo}

Asignacion de activos:
${allocSummary}

Observaciones clave:
${obsSummary}

${sectorSummary ? `Desglose sectorial (desviaciones relevantes):\n${sectorSummary}` : ""}

${notaComite ? `Contexto del ultimo comite de inversiones:\n${notaComite}` : ""}

Redacta un diagnostico profesional de 2-3 parrafos cortos. Tono: directo, profesional, sin ser alarmista. Menciona riesgos concretos y oportunidades. No uses bullet points ni listas — escribe en prosa. No uses acentos. Tutea al cliente.`;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return errorResponse("API key no configurada", 500);
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Claude API error:", errText);
      return errorResponse("Error al generar analisis", 500);
    }

    const result = await response.json();
    const narrative = result.content?.[0]?.text || "";
    const inputTokens = result.usage?.input_tokens || 0;
    const outputTokens = result.usage?.output_tokens || 0;

    // Track usage (non-blocking)
    trackAIUsage({
      advisorId: advisor!.id,
      inputTokens,
      outputTokens,
      model,
    }).catch(() => {});

    return successResponse({
      narrative,
      model,
      tokensUsed: inputTokens + outputTokens,
    });
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add app/api/portfolio/radiografia/narrative/route.ts
git commit -m "feat: add on-demand Claude narrative endpoint for radiografia"
```

---

### Task 5: MacroAllocationV2 — Bars + Donuts

**Files:**
- Create: `components/recomendacion/MacroAllocationV2.tsx`
- Delete: `components/recomendacion/MacroAllocation.tsx`

- [ ] **Step 1: Create MacroAllocationV2**

```tsx
// components/recomendacion/MacroAllocationV2.tsx
"use client";

import React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

interface Props {
  allocation: Record<string, { actual: number; target: number; delta: number }>;
  totalValueCLP: number;
}

const ROLES = ["rv", "rf", "alt", "cash"] as const;

const ROLE_LABELS: Record<string, string> = {
  rv: "Renta Variable",
  rf: "Renta Fija",
  alt: "Alternativos",
  cash: "Caja",
};

const ROLE_COLORS: Record<string, string> = {
  rv: "#3b82f6",
  rf: "#10b981",
  alt: "#8b5cf6",
  cash: "#94a3b8",
};

function deltaColor(delta: number): string {
  const abs = Math.abs(delta);
  if (abs <= 3) return "text-green-600 bg-green-50";
  if (abs <= 10) return "text-amber-600 bg-amber-50";
  return "text-red-600 bg-red-50";
}

function formatCLP(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  return `$${(value / 1e3).toFixed(0)}K`;
}

export default function MacroAllocationV2({ allocation, totalValueCLP }: Props) {
  const actualData = ROLES.map((r) => ({
    name: ROLE_LABELS[r],
    value: Math.max(allocation[r]?.actual || 0, 0.1),
    color: ROLE_COLORS[r],
  }));

  const targetData = ROLES.map((r) => ({
    name: ROLE_LABELS[r],
    value: Math.max(allocation[r]?.target || 0, 0.1),
    color: ROLE_COLORS[r],
  }));

  return (
    <div className="bg-white rounded-lg border border-gb-border shadow-sm mb-6">
      <div className="px-6 py-4 border-b border-gb-border">
        <h2 className="text-base font-semibold text-gb-black">
          Asset Allocation vs Modelo
        </h2>
      </div>
      <div className="px-6 py-5 grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: Comparison bars */}
        <div className="space-y-4">
          {ROLES.map((role) => {
            const alloc = allocation[role];
            if (!alloc) return null;
            const maxPct = Math.max(alloc.actual, alloc.target, 1);
            return (
              <div key={role}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-sm"
                      style={{ backgroundColor: ROLE_COLORS[role] }}
                    />
                    <span className="text-sm font-medium text-gb-black">
                      {ROLE_LABELS[role]}
                    </span>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${deltaColor(alloc.delta)}`}>
                    {alloc.delta > 0 ? "+" : ""}{alloc.delta.toFixed(1)}pp
                  </span>
                </div>
                {/* Actual bar */}
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] text-gb-gray w-12">Actual</span>
                  <div className="flex-1 h-4 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min((alloc.actual / Math.max(maxPct, 1)) * 100, 100)}%`,
                        backgroundColor: ROLE_COLORS[role],
                      }}
                    />
                  </div>
                  <span className="text-xs font-mono font-semibold text-gb-black w-12 text-right">
                    {alloc.actual.toFixed(1)}%
                  </span>
                </div>
                {/* Target bar (ghost) */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gb-gray w-12">Modelo</span>
                  <div className="flex-1 h-4 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500 opacity-30"
                      style={{
                        width: `${Math.min((alloc.target / Math.max(maxPct, 1)) * 100, 100)}%`,
                        backgroundColor: ROLE_COLORS[role],
                      }}
                    />
                  </div>
                  <span className="text-xs font-mono text-gb-gray w-12 text-right">
                    {alloc.target.toFixed(1)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: Two donut charts */}
        <div className="flex items-center justify-center gap-6">
          {/* Actual donut */}
          <div className="text-center">
            <p className="text-xs font-semibold text-gb-gray mb-2 uppercase tracking-wide">Tu Cartera</p>
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie
                  data={actualData}
                  dataKey="value"
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {actualData.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number, name: string) => [`${value.toFixed(1)}%`, name]}
                />
              </PieChart>
            </ResponsiveContainer>
            <p className="text-xs text-gb-gray mt-1">{formatCLP(totalValueCLP)}</p>
          </div>

          {/* Target donut */}
          <div className="text-center">
            <p className="text-xs font-semibold text-gb-gray mb-2 uppercase tracking-wide">Modelo</p>
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie
                  data={targetData}
                  dataKey="value"
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {targetData.map((d, i) => (
                    <Cell key={i} fill={d.color} opacity={0.5} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number, name: string) => [`${value.toFixed(1)}%`, name]}
                />
              </PieChart>
            </ResponsiveContainer>
            <p className="text-xs text-gb-gray mt-1">Objetivo</p>
          </div>
        </div>
      </div>

      {/* Warning banner for extreme deviations */}
      {(() => {
        const rvDelta = allocation.rv?.delta || 0;
        if (Math.abs(rvDelta) > 20) {
          return (
            <div className="px-6 py-3 bg-amber-50 border-t border-amber-200 rounded-b-lg">
              <p className="text-xs text-amber-800">
                La cartera esta fuertemente {rvDelta > 0 ? "concentrada" : "subponderada"} en Renta Variable
                ({allocation.rv?.actual.toFixed(0)}% vs {allocation.rv?.target.toFixed(0)}% modelo).
              </p>
            </div>
          );
        }
        return null;
      })()}

      {/* Legend */}
      <div className="px-6 py-3 border-t border-gb-border flex flex-wrap gap-4">
        {ROLES.map((role) => (
          <div key={role} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: ROLE_COLORS[role] }} />
            <span className="text-[11px] text-gb-gray">{ROLE_LABELS[role]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Delete old MacroAllocation**

```bash
rm components/recomendacion/MacroAllocation.tsx
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Errors only from RecomendacionPage (not yet updated) — that's OK

- [ ] **Step 4: Commit**

```bash
git add components/recomendacion/MacroAllocationV2.tsx
git rm components/recomendacion/MacroAllocation.tsx
git commit -m "feat: MacroAllocationV2 with comparison bars + donut charts"
```

---

### Task 6: StocksTreemap — Treemap + Sector-Grouped Table

**Files:**
- Create: `components/recomendacion/StocksTreemap.tsx`

- [ ] **Step 1: Create StocksTreemap**

```tsx
// components/recomendacion/StocksTreemap.tsx
"use client";

import React, { useState } from "react";
import { Treemap, ResponsiveContainer, Tooltip } from "recharts";
import { ChevronDown, ChevronRight } from "lucide-react";

interface StockItem {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  country: string;
  marketValueUSD: number;
  marketValueCLP: number;
  weightPct: number;
  categoryId: string;
  confidence: string;
}

interface SectorBreakdownItem {
  sector: string;
  sleeveVista: string | null;
  deltaPp: number;
  sleevePct: number | null;
  actualPct: number;
}

interface Props {
  stocks: StockItem[];
  sectorBreakdown: SectorBreakdownItem[];
}

const SECTOR_COLORS: Record<string, string> = {
  Technology: "#3b82f6",
  Healthcare: "#10b981",
  "Financial Services": "#f59e0b",
  "Consumer Cyclical": "#ef4444",
  "Consumer Defensive": "#8b5cf6",
  Energy: "#f97316",
  Industrials: "#6366f1",
  "Communication Services": "#ec4899",
  Utilities: "#14b8a6",
  "Real Estate": "#a855f7",
  "Basic Materials": "#78716c",
  "Sin clasificar": "#d1d5db",
};

function deviationColor(deltaPp: number): string {
  if (Math.abs(deltaPp) <= 3) return "#22c55e";
  if (Math.abs(deltaPp) <= 10) return "#f59e0b";
  return "#ef4444";
}

function formatUSD(value: number): string {
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

// Custom treemap content renderer
function CustomTreemapContent(props: any) {
  const { x, y, width, height, name, ticker, weightPct, color } = props;
  if (width < 40 || height < 25) return null;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={color} rx={4} stroke="#fff" strokeWidth={2} />
      {width > 50 && height > 35 && (
        <>
          <text x={x + 6} y={y + 16} fontSize={12} fontWeight="bold" fill="#fff">
            {ticker || name}
          </text>
          {height > 50 && (
            <text x={x + 6} y={y + 32} fontSize={10} fill="rgba(255,255,255,0.8)">
              {weightPct?.toFixed(1)}%
            </text>
          )}
        </>
      )}
    </g>
  );
}

export default function StocksTreemap({ stocks, sectorBreakdown }: Props) {
  const [expandedSectors, setExpandedSectors] = useState<Set<string>>(new Set());

  if (stocks.length === 0) return null;

  const toggleSector = (sector: string) => {
    setExpandedSectors((prev) => {
      const next = new Set(prev);
      if (next.has(sector)) next.delete(sector);
      else next.add(sector);
      return next;
    });
  };

  // Build treemap data
  const sectorMap = new Map<string, typeof stocks>();
  for (const s of stocks) {
    const sector = s.sector || "Sin clasificar";
    if (!sectorMap.has(sector)) sectorMap.set(sector, []);
    sectorMap.get(sector)!.push(s);
  }

  const treemapData = Array.from(sectorMap.entries()).map(([sector, items]) => ({
    name: sector,
    children: items.map((s) => ({
      name: s.name,
      ticker: s.ticker,
      size: s.weightPct,
      weightPct: s.weightPct,
      color: SECTOR_COLORS[sector] || "#94a3b8",
    })),
  }));

  // Flat data for recharts Treemap (doesn't nest well — flatten with sector color)
  const flatData = stocks.map((s) => ({
    name: s.name,
    ticker: s.ticker,
    size: Math.max(s.weightPct, 0.1),
    weightPct: s.weightPct,
    color: SECTOR_COLORS[s.sector] || "#94a3b8",
  }));

  // Sector totals for table
  const sectorTotals = Array.from(sectorMap.entries())
    .map(([sector, items]) => ({
      sector,
      items: items.sort((a, b) => b.weightPct - a.weightPct),
      totalWeight: items.reduce((s, i) => s + i.weightPct, 0),
      totalValueUSD: items.reduce((s, i) => s + i.marketValueUSD, 0),
      sectorInfo: sectorBreakdown.find((sb) => sb.sector === sector),
    }))
    .sort((a, b) => b.totalWeight - a.totalWeight);

  return (
    <div className="bg-white rounded-lg border border-gb-border shadow-sm mb-6">
      <div className="px-6 py-4 border-b border-gb-border">
        <h2 className="text-base font-semibold text-gb-black">
          Acciones por Sector
        </h2>
        <p className="text-xs text-gb-gray mt-0.5">
          {stocks.length} acciones directas · Tamano proporcional al peso en cartera
        </p>
      </div>

      {/* Treemap */}
      <div className="px-6 py-4">
        <ResponsiveContainer width="100%" height={280}>
          <Treemap
            data={flatData}
            dataKey="size"
            aspectRatio={4 / 3}
            content={<CustomTreemapContent />}
          >
            <Tooltip
              content={({ payload }) => {
                if (!payload || !payload[0]) return null;
                const d = payload[0].payload;
                return (
                  <div className="bg-white border border-gb-border rounded-lg shadow-lg p-3 text-sm">
                    <p className="font-semibold text-gb-black">{d.ticker} — {d.name}</p>
                    <p className="text-gb-gray">{d.weightPct?.toFixed(1)}% del portafolio</p>
                  </div>
                );
              }}
            />
          </Treemap>
        </ResponsiveContainer>

        {/* Sector legend */}
        <div className="flex flex-wrap gap-3 mt-3">
          {sectorTotals.map(({ sector }) => (
            <div key={sector} className="flex items-center gap-1.5">
              <div
                className="w-2.5 h-2.5 rounded-sm"
                style={{ backgroundColor: SECTOR_COLORS[sector] || "#94a3b8" }}
              />
              <span className="text-[11px] text-gb-gray">{sector}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Detail table grouped by sector */}
      <div className="border-t border-gb-border divide-y divide-gb-border">
        {sectorTotals.map(({ sector, items, totalWeight, totalValueUSD, sectorInfo }) => {
          const isExpanded = expandedSectors.has(sector);
          return (
            <div key={sector}>
              <button
                onClick={() => toggleSector(sector)}
                className="w-full px-6 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {isExpanded
                    ? <ChevronDown className="w-4 h-4 text-gb-gray" />
                    : <ChevronRight className="w-4 h-4 text-gb-gray" />}
                  <div
                    className="w-3 h-3 rounded-sm"
                    style={{ backgroundColor: SECTOR_COLORS[sector] || "#94a3b8" }}
                  />
                  <span className="text-sm font-medium text-gb-black">{sector}</span>
                  <span className="text-xs text-gb-gray">
                    ({items.length} posicion{items.length !== 1 ? "es" : ""})
                  </span>
                  {sectorInfo && sectorInfo.sleevePct != null && (
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{ color: deviationColor(sectorInfo.deltaPp), backgroundColor: `${deviationColor(sectorInfo.deltaPp)}15` }}
                    >
                      {sectorInfo.deltaPp > 0 ? "+" : ""}{sectorInfo.deltaPp.toFixed(1)}pp
                    </span>
                  )}
                  {sectorInfo?.sleeveVista && sectorInfo.sleeveVista !== "N" && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      sectorInfo.sleeveVista === "OW" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    }`}>
                      {sectorInfo.sleeveVista === "OW" ? "Overweight" : "Underweight"}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs font-mono text-gb-gray">{totalWeight.toFixed(1)}%</span>
                  <span className="text-sm font-mono text-gb-black">{formatUSD(totalValueUSD)}</span>
                </div>
              </button>

              {isExpanded && (
                <div className="px-6 pb-3">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gb-gray border-b border-slate-100">
                        <th className="text-left py-1.5 font-medium">Ticker</th>
                        <th className="text-left py-1.5 font-medium">Nombre</th>
                        <th className="text-left py-1.5 font-medium">Industry</th>
                        <th className="text-right py-1.5 font-medium">Valor USD</th>
                        <th className="text-right py-1.5 font-medium">Peso</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((s) => (
                        <tr key={s.ticker} className="border-t border-slate-50 hover:bg-slate-50">
                          <td className="py-2 font-mono font-semibold text-gb-black">{s.ticker}</td>
                          <td className="py-2 text-gb-black truncate max-w-[200px]">{s.name}</td>
                          <td className="py-2 text-gb-gray text-xs">{s.industry || "—"}</td>
                          <td className="py-2 text-right font-mono">{formatUSD(s.marketValueUSD)}</td>
                          <td className="py-2 text-right font-mono font-semibold">{s.weightPct.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Delete old components**

```bash
rm components/recomendacion/SectorBreakdown.tsx
rm components/recomendacion/HoldingsTable.tsx
```

- [ ] **Step 3: Commit**

```bash
git add components/recomendacion/StocksTreemap.tsx
git rm components/recomendacion/SectorBreakdown.tsx components/recomendacion/HoldingsTable.tsx
git commit -m "feat: StocksTreemap with treemap + sector-grouped detail table"
```

---

### Task 7: FundsBreakdown + BondsBreakdown + EtfsBreakdown

**Files:**
- Create: `components/recomendacion/FundsBreakdown.tsx`
- Create: `components/recomendacion/BondsBreakdown.tsx`

ETFs use the same structure as funds, so they share FundsBreakdown with a prop.

- [ ] **Step 1: Create FundsBreakdown**

```tsx
// components/recomendacion/FundsBreakdown.tsx
"use client";

import React, { useState } from "react";
import { Treemap, ResponsiveContainer, Tooltip } from "recharts";
import { ChevronDown, ChevronRight } from "lucide-react";

interface FundItem {
  fundName?: string;
  ticker?: string;
  name?: string;
  securityId?: string;
  categoryId: string;
  categoryLabel: string;
  marketValueCLP: number;
  weightPct: number;
  confidence?: string;
}

interface Props {
  items: FundItem[];
  title: string;
  subtitle: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  rv_usa_large_cap: "#3b82f6",
  rv_desarrollados_ex_us: "#60a5fa",
  rv_emergentes: "#f59e0b",
  rv_chile: "#ef4444",
  rf_ust_belly: "#10b981",
  rf_ust_short: "#34d399",
  rf_ig_corp: "#14b8a6",
  rf_tips: "#06b6d4",
  rf_high_yield: "#f97316",
  rf_em_sovereign: "#eab308",
  rf_chile: "#a3e635",
  alt_gold: "#fbbf24",
  alt_reits: "#a855f7",
  cash_tbills: "#94a3b8",
};

function formatCLP(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function CustomContent(props: any) {
  const { x, y, width, height, displayName, weightPct, color } = props;
  if (width < 40 || height < 25) return null;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={color} rx={4} stroke="#fff" strokeWidth={2} />
      {width > 60 && height > 35 && (
        <>
          <text x={x + 6} y={y + 16} fontSize={11} fontWeight="bold" fill="#fff">
            {displayName?.length > 20 ? displayName.slice(0, 18) + "..." : displayName}
          </text>
          {height > 50 && (
            <text x={x + 6} y={y + 30} fontSize={10} fill="rgba(255,255,255,0.8)">
              {weightPct?.toFixed(1)}%
            </text>
          )}
        </>
      )}
    </g>
  );
}

export default function FundsBreakdown({ items, title, subtitle }: Props) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  if (items.length === 0) return null;

  const toggle = (cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  // Group by category
  const catMap = new Map<string, { label: string; items: FundItem[] }>();
  for (const item of items) {
    if (!catMap.has(item.categoryId)) {
      catMap.set(item.categoryId, { label: item.categoryLabel, items: [] });
    }
    catMap.get(item.categoryId)!.items.push(item);
  }

  const catTotals = Array.from(catMap.entries())
    .map(([catId, { label, items: catItems }]) => ({
      catId,
      label,
      items: catItems.sort((a, b) => b.weightPct - a.weightPct),
      totalWeight: catItems.reduce((s, i) => s + i.weightPct, 0),
      totalValueCLP: catItems.reduce((s, i) => s + i.marketValueCLP, 0),
    }))
    .sort((a, b) => b.totalWeight - a.totalWeight);

  const flatData = items.map((f) => ({
    name: f.fundName || f.name || f.ticker || "?",
    displayName: f.ticker || f.fundName || f.name || "?",
    size: Math.max(f.weightPct, 0.1),
    weightPct: f.weightPct,
    color: CATEGORY_COLORS[f.categoryId] || "#94a3b8",
  }));

  return (
    <div className="bg-white rounded-lg border border-gb-border shadow-sm mb-6">
      <div className="px-6 py-4 border-b border-gb-border">
        <h2 className="text-base font-semibold text-gb-black">{title}</h2>
        <p className="text-xs text-gb-gray mt-0.5">{subtitle}</p>
      </div>

      {/* Treemap */}
      <div className="px-6 py-4">
        <ResponsiveContainer width="100%" height={220}>
          <Treemap data={flatData} dataKey="size" content={<CustomContent />}>
            <Tooltip
              content={({ payload }) => {
                if (!payload || !payload[0]) return null;
                const d = payload[0].payload;
                return (
                  <div className="bg-white border border-gb-border rounded-lg shadow-lg p-3 text-sm">
                    <p className="font-semibold text-gb-black">{d.name}</p>
                    <p className="text-gb-gray">{d.weightPct?.toFixed(1)}% del portafolio</p>
                  </div>
                );
              }}
            />
          </Treemap>
        </ResponsiveContainer>
      </div>

      {/* Detail table grouped by category */}
      <div className="border-t border-gb-border divide-y divide-gb-border">
        {catTotals.map(({ catId, label, items: catItems, totalWeight, totalValueCLP }) => {
          const isExpanded = expandedCategories.has(catId);
          return (
            <div key={catId}>
              <button
                onClick={() => toggle(catId)}
                className="w-full px-6 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {isExpanded
                    ? <ChevronDown className="w-4 h-4 text-gb-gray" />
                    : <ChevronRight className="w-4 h-4 text-gb-gray" />}
                  <div
                    className="w-3 h-3 rounded-sm"
                    style={{ backgroundColor: CATEGORY_COLORS[catId] || "#94a3b8" }}
                  />
                  <span className="text-sm font-medium text-gb-black">{label}</span>
                  <span className="text-xs text-gb-gray">({catItems.length})</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs font-mono text-gb-gray">{totalWeight.toFixed(1)}%</span>
                  <span className="text-sm font-mono text-gb-black">{formatCLP(totalValueCLP)}</span>
                </div>
              </button>
              {isExpanded && (
                <div className="px-6 pb-3">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gb-gray border-b border-slate-100">
                        <th className="text-left py-1.5 font-medium">Nombre</th>
                        <th className="text-right py-1.5 font-medium">Valor CLP</th>
                        <th className="text-right py-1.5 font-medium">Peso</th>
                      </tr>
                    </thead>
                    <tbody>
                      {catItems.map((f, i) => (
                        <tr key={i} className="border-t border-slate-50 hover:bg-slate-50">
                          <td className="py-2 text-gb-black">
                            {f.ticker && <span className="font-mono font-semibold mr-2">{f.ticker}</span>}
                            {f.fundName || f.name}
                          </td>
                          <td className="py-2 text-right font-mono">{formatCLP(f.marketValueCLP)}</td>
                          <td className="py-2 text-right font-mono font-semibold">{f.weightPct.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create BondsBreakdown**

```tsx
// components/recomendacion/BondsBreakdown.tsx
"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface BondItem {
  name: string;
  securityId: string;
  couponRate: number;
  maturityDate: string;
  creditRating: string | null;
  bondType: "government" | "corporate" | "em_sovereign";
  marketValueUSD: number;
  marketValueCLP: number;
  weightPct: number;
}

interface Props {
  bonds: BondItem[];
}

const TYPE_LABELS: Record<string, string> = {
  government: "Gobierno / Treasuries",
  corporate: "Corporativos",
  em_sovereign: "Soberanos Emergentes",
};

const TYPE_COLORS: Record<string, string> = {
  government: "#3b82f6",
  corporate: "#14b8a6",
  em_sovereign: "#f59e0b",
};

function formatUSD(value: number): string {
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

export default function BondsBreakdown({ bonds }: Props) {
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());

  if (bonds.length === 0) return null;

  const toggle = (type: string) => {
    setExpandedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  // Group by bond type
  const typeMap = new Map<string, BondItem[]>();
  for (const b of bonds) {
    if (!typeMap.has(b.bondType)) typeMap.set(b.bondType, []);
    typeMap.get(b.bondType)!.push(b);
  }

  const typeGroups = (["government", "corporate", "em_sovereign"] as const)
    .filter((t) => typeMap.has(t))
    .map((type) => {
      const items = typeMap.get(type)!.sort((a, b) => b.marketValueUSD - a.marketValueUSD);
      return {
        type,
        items,
        totalWeight: items.reduce((s, i) => s + i.weightPct, 0),
        totalValueUSD: items.reduce((s, i) => s + i.marketValueUSD, 0),
      };
    });

  return (
    <div className="bg-white rounded-lg border border-gb-border shadow-sm mb-6">
      <div className="px-6 py-4 border-b border-gb-border">
        <h2 className="text-base font-semibold text-gb-black">Renta Fija Directa</h2>
        <p className="text-xs text-gb-gray mt-0.5">{bonds.length} bonos</p>
      </div>

      {/* Summary bar */}
      <div className="px-6 py-3 flex gap-1 h-6">
        {typeGroups.map(({ type, totalWeight }) => (
          <div
            key={type}
            className="h-full rounded-sm transition-all"
            style={{
              width: `${totalWeight}%`,
              backgroundColor: TYPE_COLORS[type],
              minWidth: totalWeight > 0 ? 8 : 0,
            }}
            title={`${TYPE_LABELS[type]}: ${totalWeight.toFixed(1)}%`}
          />
        ))}
      </div>

      <div className="divide-y divide-gb-border">
        {typeGroups.map(({ type, items, totalWeight, totalValueUSD }) => {
          const isExpanded = expandedTypes.has(type);
          return (
            <div key={type}>
              <button
                onClick={() => toggle(type)}
                className="w-full px-6 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {isExpanded
                    ? <ChevronDown className="w-4 h-4 text-gb-gray" />
                    : <ChevronRight className="w-4 h-4 text-gb-gray" />}
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: TYPE_COLORS[type] }} />
                  <span className="text-sm font-medium text-gb-black">{TYPE_LABELS[type]}</span>
                  <span className="text-xs text-gb-gray">({items.length})</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs font-mono text-gb-gray">{totalWeight.toFixed(1)}%</span>
                  <span className="text-sm font-mono text-gb-black">{formatUSD(totalValueUSD)}</span>
                </div>
              </button>
              {isExpanded && (
                <div className="px-6 pb-3">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gb-gray border-b border-slate-100">
                        <th className="text-left py-1.5 font-medium">Emisor</th>
                        <th className="text-right py-1.5 font-medium">Cupon</th>
                        <th className="text-right py-1.5 font-medium">Vencimiento</th>
                        <th className="text-center py-1.5 font-medium">Rating</th>
                        <th className="text-right py-1.5 font-medium">Valor USD</th>
                        <th className="text-right py-1.5 font-medium">Peso</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((b, i) => (
                        <tr key={i} className="border-t border-slate-50 hover:bg-slate-50">
                          <td className="py-2 text-gb-black">{b.name}</td>
                          <td className="py-2 text-right font-mono">{b.couponRate.toFixed(2)}%</td>
                          <td className="py-2 text-right font-mono text-xs">{b.maturityDate}</td>
                          <td className="py-2 text-center">
                            {b.creditRating ? (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-gb-black font-mono">
                                {b.creditRating}
                              </span>
                            ) : (
                              <span className="text-xs text-gb-gray">—</span>
                            )}
                          </td>
                          <td className="py-2 text-right font-mono">{formatUSD(b.marketValueUSD)}</td>
                          <td className="py-2 text-right font-mono font-semibold">{b.weightPct.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add components/recomendacion/FundsBreakdown.tsx components/recomendacion/BondsBreakdown.tsx
git commit -m "feat: FundsBreakdown + BondsBreakdown components for radiografia v2"
```

---

### Task 8: ObservacionesPanel + NarrativeAnalysis

**Files:**
- Create: `components/recomendacion/ObservacionesPanel.tsx`
- Create: `components/recomendacion/NarrativeAnalysis.tsx`

- [ ] **Step 1: Create ObservacionesPanel**

```tsx
// components/recomendacion/ObservacionesPanel.tsx
"use client";

import React from "react";
import { AlertTriangle, AlertCircle, Info } from "lucide-react";

interface Observation {
  severity: "alta" | "media" | "info";
  text: string;
}

interface Props {
  observations: Observation[];
}

const SEVERITY_CONFIG = {
  alta: {
    icon: AlertTriangle,
    border: "border-l-red-500",
    bg: "bg-red-50",
    iconColor: "text-red-500",
    label: "Alta",
    labelColor: "bg-red-100 text-red-700",
  },
  media: {
    icon: AlertCircle,
    border: "border-l-amber-500",
    bg: "bg-amber-50",
    iconColor: "text-amber-500",
    label: "Media",
    labelColor: "bg-amber-100 text-amber-700",
  },
  info: {
    icon: Info,
    border: "border-l-blue-500",
    bg: "bg-blue-50",
    iconColor: "text-blue-500",
    label: "Info",
    labelColor: "bg-blue-100 text-blue-700",
  },
};

export default function ObservacionesPanel({ observations }: Props) {
  if (observations.length === 0) return null;

  return (
    <div className="bg-white rounded-lg border border-gb-border shadow-sm mb-6">
      <div className="px-6 py-4 border-b border-gb-border">
        <h2 className="text-base font-semibold text-gb-black">Observaciones</h2>
        <p className="text-xs text-gb-gray mt-0.5">
          Diagnostico automatico basado en la composicion del portafolio
        </p>
      </div>
      <div className="p-4 space-y-2">
        {observations.map((obs, i) => {
          const config = SEVERITY_CONFIG[obs.severity];
          const Icon = config.icon;
          return (
            <div
              key={i}
              className={`flex items-start gap-3 p-3 rounded-r-lg border-l-4 ${config.border} ${config.bg}`}
            >
              <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${config.iconColor}`} />
              <p className="text-sm text-gb-black/80 flex-1">{obs.text}</p>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0 ${config.labelColor}`}>
                {config.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create NarrativeAnalysis**

```tsx
// components/recomendacion/NarrativeAnalysis.tsx
"use client";

import React, { useState } from "react";
import { Sparkles, Loader } from "lucide-react";

interface Props {
  clientId: string;
  clientName: string;
  allocation: Record<string, { actual: number; target: number; delta: number }>;
  observations: Array<{ severity: string; text: string }>;
  sectorBreakdown: Array<{
    sector: string;
    actualPct: number;
    sleevePct: number | null;
    deltaPp: number;
  }>;
  totalValueCLP: number;
  perfilCliente: string;
  perfilModelo: string;
  notaComite: string | null;
}

export default function NarrativeAnalysis({
  clientName,
  allocation,
  observations,
  sectorBreakdown,
  totalValueCLP,
  perfilCliente,
  perfilModelo,
  notaComite,
}: Props) {
  const [narrative, setNarrative] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);

  const generateNarrative = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/portfolio/radiografia/narrative", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName,
          allocation,
          observations,
          sectorBreakdown,
          totalValueCLP,
          perfilCliente,
          perfilModelo,
          notaComite,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setNarrative(data.narrative);
        setModel(data.model);
      } else {
        setError(data.error || "Error al generar analisis");
      }
    } catch {
      setError("Error de conexion");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gb-border shadow-sm mb-6">
      <div className="px-6 py-4 border-b border-gb-border flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gb-black">Analisis Narrativo</h2>
          <p className="text-xs text-gb-gray mt-0.5">Diagnostico profesional generado por IA</p>
        </div>
        {!narrative && (
          <button
            onClick={generateNarrative}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gb-primary rounded-lg hover:bg-gb-primary/90 disabled:opacity-50 transition-colors"
          >
            {loading ? (
              <>
                <Loader className="w-4 h-4 animate-spin" />
                Generando...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Generar Analisis
              </>
            )}
          </button>
        )}
      </div>

      {error && (
        <div className="px-6 py-3 bg-red-50 text-sm text-red-700">
          {error}
        </div>
      )}

      {narrative && (
        <div className="px-6 py-5">
          <div className="prose prose-sm max-w-none text-gb-black/85 leading-relaxed">
            {narrative.split("\n\n").map((paragraph, i) => (
              <p key={i} className="mb-3 last:mb-0">{paragraph}</p>
            ))}
          </div>
          {model && (
            <p className="text-[10px] text-gb-gray mt-4 pt-3 border-t border-gb-border">
              Generado con {model.includes("opus") ? "Claude Opus" : "Claude Sonnet"}
            </p>
          )}
          <button
            onClick={generateNarrative}
            disabled={loading}
            className="mt-3 text-xs text-gb-primary hover:underline disabled:opacity-50"
          >
            {loading ? "Regenerando..." : "Regenerar analisis"}
          </button>
        </div>
      )}

      {!narrative && !error && !loading && (
        <div className="px-6 py-8 text-center">
          <Sparkles className="w-8 h-8 text-gb-gray/30 mx-auto mb-2" />
          <p className="text-sm text-gb-gray">
            Presiona el boton para generar un diagnostico profesional
          </p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add components/recomendacion/ObservacionesPanel.tsx components/recomendacion/NarrativeAnalysis.tsx
git commit -m "feat: ObservacionesPanel + NarrativeAnalysis components"
```

---

### Task 9: Rewrite RecomendacionPage Orchestrator

**Files:**
- Modify: `components/recomendacion/RecomendacionPage.tsx`
- Delete: `components/recomendacion/TradeSuggestions.tsx` (trade suggestions now integrated into observations)

- [ ] **Step 1: Rewrite RecomendacionPage.tsx**

Replace the entire contents of `components/recomendacion/RecomendacionPage.tsx` with:

```tsx
// components/recomendacion/RecomendacionPage.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Loader, RefreshCw, AlertTriangle } from "lucide-react";
import MacroAllocationV2 from "./MacroAllocationV2";
import StocksTreemap from "./StocksTreemap";
import FundsBreakdown from "./FundsBreakdown";
import BondsBreakdown from "./BondsBreakdown";
import ObservacionesPanel from "./ObservacionesPanel";
import NarrativeAnalysis from "./NarrativeAnalysis";
import TradeSuggestions from "./TradeSuggestions";

// ── Types matching API response ──────────────────────────────────────

interface StockItem {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  country: string;
  marketValueUSD: number;
  marketValueCLP: number;
  weightPct: number;
  categoryId: string;
  confidence: string;
}

interface FundItem {
  fundName: string;
  securityId: string;
  categoryId: string;
  categoryLabel: string;
  marketValueCLP: number;
  weightPct: number;
  confidence: string;
}

interface BondItem {
  name: string;
  securityId: string;
  couponRate: number;
  maturityDate: string;
  creditRating: string | null;
  bondType: "government" | "corporate" | "em_sovereign";
  marketValueUSD: number;
  marketValueCLP: number;
  weightPct: number;
}

interface EtfItem {
  ticker: string;
  name: string;
  categoryId: string;
  categoryLabel: string;
  marketValueCLP: number;
  weightPct: number;
}

interface CashItem {
  name: string;
  marketValueCLP: number;
  weightPct: number;
  currency: string;
}

interface Observation {
  severity: "alta" | "media" | "info";
  text: string;
}

interface SectorBreakdownItem {
  sector: string;
  sleeveVista: string | null;
  deltaPp: number;
  sleevePct: number | null;
  actualPct: number;
}

interface TradeSuggestion {
  action: "REDUCIR" | "AGREGAR" | "MANTENER";
  reason: string;
  holdings?: string[];
  amountUSD?: number;
  instrument?: string;
  instrumentTicker?: string;
  priority: "alta" | "media" | "baja";
}

interface RadiografiaData {
  clientId: string;
  clientName: string;
  perfilModelo: string;
  perfilCliente: string;
  reportDate: string;
  notaComite: string | null;
  totalValueCLP: number;
  allocation: Record<string, { actual: number; target: number; delta: number }>;
  flags: Array<{ type: string; holdingName: string; message: string }>;
  sectorBreakdown: SectorBreakdownItem[];
  tradeSuggestions: TradeSuggestion[];
  instrumentBreakdown: {
    stocks: StockItem[];
    funds: FundItem[];
    bonds: BondItem[];
    etfs: EtfItem[];
    cash: CashItem[];
  };
  observations: Observation[];
}

interface Props {
  clientId: string;
}

const PROFILE_LABELS: Record<string, string> = {
  conservador: "Conservador",
  moderado_conservador: "Moderado Conservador",
  moderado: "Moderado",
  moderado_agresivo: "Moderado Agresivo",
  agresivo: "Agresivo",
};

function formatCLP(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  return `$${(value / 1e3).toFixed(0)}K`;
}

export default function RecomendacionPage({ clientId }: Props) {
  const [data, setData] = useState<RadiografiaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRadiografia = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/portfolio/radiografia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      const d = await res.json();
      if (d.success && d.data) {
        setData(d.data);
      } else {
        setError(d.error || "Error al generar radiografia");
      }
    } catch {
      setError("Error de conexion");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchRadiografia();
  }, [fetchRadiografia]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader className="w-6 h-6 animate-spin text-gb-primary mx-auto mb-3" />
          <p className="text-sm text-gb-gray">Generando radiografia...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 inline mr-2" />
          {error || "No se pudo generar la radiografia"}
        </div>
      </div>
    );
  }

  const { instrumentBreakdown: ib } = data;
  const hasStocks = ib.stocks.length > 0;
  const hasFunds = ib.funds.length > 0;
  const hasBonds = ib.bonds.length > 0;
  const hasEtfs = ib.etfs.length > 0;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* ── Section 1: Header ────────────────────────────────────────── */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gb-black">
            Radiografia — {data.clientName}
          </h1>
          <div className="flex items-center gap-3 mt-1.5">
            <span className="text-sm text-gb-gray">
              Perfil: {PROFILE_LABELS[data.perfilCliente] || data.perfilCliente}
              {" → "}
              Modelo: {PROFILE_LABELS[data.perfilModelo] || data.perfilModelo}
            </span>
            <span className="text-xs text-gb-gray bg-slate-100 px-2 py-0.5 rounded">
              Comite: {data.reportDate}
            </span>
            <span className="text-xs font-mono text-gb-black bg-slate-100 px-2 py-0.5 rounded">
              {formatCLP(data.totalValueCLP)}
            </span>
          </div>
        </div>
        <button
          onClick={fetchRadiografia}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gb-border rounded-md hover:bg-slate-50 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Actualizar
        </button>
      </div>

      {/* Flags */}
      {data.flags.length > 0 && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-xs font-medium text-amber-800 mb-1">Advertencias:</p>
          {data.flags.map((f, i) => (
            <p key={i} className="text-xs text-amber-700">• {f.message}</p>
          ))}
        </div>
      )}

      {/* ── Section 2: Macro Allocation ──────────────────────────────── */}
      <MacroAllocationV2
        allocation={data.allocation}
        totalValueCLP={data.totalValueCLP}
      />

      {/* ── Section 3: Instrument Breakdown ──────────────────────────── */}
      {hasStocks && (
        <StocksTreemap
          stocks={ib.stocks}
          sectorBreakdown={data.sectorBreakdown}
        />
      )}

      {hasFunds && (
        <FundsBreakdown
          items={ib.funds}
          title="Fondos por Categoria"
          subtitle={`${ib.funds.length} fondos · Agrupados por categoria del comite`}
        />
      )}

      {hasEtfs && (
        <FundsBreakdown
          items={ib.etfs.map((e) => ({
            fundName: e.name,
            ticker: e.ticker,
            securityId: e.ticker,
            categoryId: e.categoryId,
            categoryLabel: e.categoryLabel,
            marketValueCLP: e.marketValueCLP,
            weightPct: e.weightPct,
          }))}
          title="ETFs"
          subtitle={`${ib.etfs.length} ETFs · Agrupados por categoria del comite`}
        />
      )}

      {hasBonds && <BondsBreakdown bonds={ib.bonds} />}

      {/* ── Section 4: Observations ──────────────────────────────────── */}
      <ObservacionesPanel observations={data.observations} />

      {/* Trade Suggestions (keep existing component) */}
      {data.tradeSuggestions.length > 0 && (
        <TradeSuggestions suggestions={data.tradeSuggestions} />
      )}

      {/* ── Section 5: Narrative Analysis ────────────────────────────── */}
      <NarrativeAnalysis
        clientId={data.clientId}
        clientName={data.clientName}
        allocation={data.allocation}
        observations={data.observations}
        sectorBreakdown={data.sectorBreakdown}
        totalValueCLP={data.totalValueCLP}
        perfilCliente={data.perfilCliente}
        perfilModelo={data.perfilModelo}
        notaComite={data.notaComite}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No new errors (or only pre-existing ones)

- [ ] **Step 3: Commit**

```bash
git add components/recomendacion/RecomendacionPage.tsx
git commit -m "feat: rewire RecomendacionPage with all v2 components"
```

---

### Task 10: Integration Test + Cleanup

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (including new instrument-type and observations tests)

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: Clean compile

- [ ] **Step 3: Verify dev server loads the page**

Run: `npm run dev` and navigate to `/recomendacion`, select a client. Verify:
- Macro allocation shows bars + donuts
- Stock treemap renders (if client has stocks)
- Funds table renders (if client has funds)
- Bonds table renders (if client has bonds)
- Observations panel shows relevant bullets
- "Generar Analisis" button works

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: radiografia v2 integration verification"
```
