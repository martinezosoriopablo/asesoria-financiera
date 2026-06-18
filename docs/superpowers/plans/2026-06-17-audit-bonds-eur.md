# Audit Fixes: Bond Historical Prices + EUR Currency Support

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix audit findings #2 (use real FINRA prices in historical series instead of projection-only) and #5 (thread EUR rate through all FX conversion paths).

**Architecture:** #2 — In the `historical-prices` API, query `bond_prices` table for actual FINRA prices and overlay them onto the constant-yield projection. This gives accurate market prices where available, with projection filling gaps. #5 — Add EUR to `useExchangeRates` hook (from mindicador.cl historical), thread `eurRate` through `useHoldingSummaries`, `useBondCalculations`, and the `historical-prices` API. Use `lib/portfolio/currency.ts` pattern where possible.

**Tech Stack:** Next.js App Router, React hooks, Supabase, mindicador.cl API, FINRA bond_prices table

## Global Constraints

- EUR historical source: mindicador.cl (`/api/euro/{year}`) — BCCH doesn't publish EUR directly
- Bond prices: `bond_prices` table, columns `cusip`, `price_date`, `last_price` (% of par)
- All `marketValue` must be in CLP — apply correct FX rate per currency
- No new dependencies — use existing APIs and tables
- Maintain backward compatibility — EUR=0 or missing should fall back to USD behavior (existing)

---

### Task 1: Add EUR to historical exchange rates API + useExchangeRates hook

**Files:**
- Modify: `app/api/exchange-rates/historical/route.ts`
- Modify: `components/seguimiento/hooks/useExchangeRates.ts`

**Interfaces:**
- Produces: `useExchangeRates` returns `eurRate` (number | undefined) alongside existing usd/uf rates. `deflatorData` gains `eur: Map<string, number>`.

- [x] **Step 1: Add `euro` indicator to historical API**

In `app/api/exchange-rates/historical/route.ts`, expand the allowed indicators and add mindicador.cl as primary source for EUR (BCCH doesn't have EUR series):

```typescript
// Line 25: expand validation
if (!indicator || !year || !["uf", "dolar", "euro"].includes(indicator)) {
  return NextResponse.json({ success: false, error: "indicator (uf|dolar|euro) and year required" }, { status: 400 });
}
```

In the BCCH try block (line 37), skip BCCH for euro — go straight to mindicador.cl:

```typescript
// Primary: Banco Central for uf/dolar, mindicador for euro
if (indicator !== "euro") {
  try {
    const serie = await fetchBcchSeries(
      indicator as "dolar" | "uf",
      `${year}-01-01`,
      `${year}-12-31`,
    );
    cache[cacheKey] = { data: serie, expiry: Date.now() + CACHE_DURATION };
    return NextResponse.json({ success: true, serie, source: "Banco Central de Chile" });
  } catch (bcchError) {
    console.warn(`[exchange-rates/historical] BCCH failed for ${indicator}/${year}:`, bcchError);
  }
}
```

In the mindicador fallback (line 51), map "euro" indicator:

```typescript
const minIndicator = indicator === "dolar" ? "dolar" : indicator === "euro" ? "euro" : "uf";
```

- [x] **Step 2: Fetch EUR historical in useExchangeRates**

In `components/seguimiento/hooks/useExchangeRates.ts`:

Add `eur` to deflatorData type and `eurRate` to return interface:

```typescript
interface UseExchangeRatesReturn {
  exchangeRates: { uf: number; usd: number; eur: number } | null;
  deflatorData: { uf: Map<string, number>; usd: Map<string, number>; eur: Map<string, number> } | null;
  cartolaExchangeRates: { uf: number; usd: number; eur: number } | null;
  currentExchangeRates: { uf: number; usd: number; eur: number } | null;
  findDeflatorValue: (map: Map<string, number> | undefined, date: string) => number | null;
  findDeflatorValueNext: (map: Map<string, number> | undefined, date: string) => number | null;
}
```

In the `/api/exchange-rates` fetch (line 23), include EUR:

```typescript
fetch("/api/exchange-rates")
  .then(r => r.json())
  .then(d => { if (d.success) setExchangeRates({ uf: d.uf, usd: d.usd, eur: d.eur || 0 }); })
  .catch(() => { /* fallback handled */ });
```

In `fetchDeflators` (line 31), add EUR map and fetch loop:

```typescript
const eurMap = new Map<string, number>();

// After existing uf/usd loops, add:
try {
  const eurRes = await fetch(`/api/exchange-rates/historical?indicator=euro&year=${year}`);
  const eurData = await eurRes.json();
  for (const e of (eurData.serie || []) as Array<{ fecha: string; valor: number }>) {
    eurMap.set(e.fecha, e.valor);
  }
} catch { /* ignore */ }

// Update setDeflatorData:
if (ufMap.size > 0 || usdMap.size > 0) {
  setDeflatorData({ uf: ufMap, usd: usdMap, eur: eurMap });
}
```

In `cartolaExchangeRates` useMemo, add EUR lookup (same-day, no T+1 offset like USD):

```typescript
const eurVal = findDeflatorValue(deflatorData.eur, cartolaDate);
if (!ufVal || !usdVal) return null;
return { uf: ufVal, usd: usdVal, eur: eurVal || 0 };
```

Same for `currentExchangeRates`:

```typescript
const eurVal = findDeflatorValue(deflatorData.eur, valDate);
if (!ufVal || !usdVal) return null;
return { uf: ufVal, usd: usdVal, eur: eurVal || 0 };
```

- [x] **Step 3: Verify build compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`

Fix any type errors from consumers of `useExchangeRates` that now expect `eur` field. The main consumer is `SeguimientoPage.tsx` — it destructures `exchangeRates` and passes `usdRate`/`ufRate` to child components. No changes needed there yet (EUR threading happens in Task 2).

- [x] **Step 4: Commit** — `84f1e82`

```bash
git add app/api/exchange-rates/historical/route.ts components/seguimiento/hooks/useExchangeRates.ts
git commit -m "feat: add EUR to historical exchange rates API and useExchangeRates hook"
```

---

### Task 2: Thread EUR through useHoldingSummaries + useBondCalculations

**Files:**
- Modify: `components/seguimiento/hooks/useHoldingSummaries.ts`
- Modify: `components/seguimiento/hooks/useBondCalculations.ts`
- Modify: `components/seguimiento/HoldingReturnsPanel.tsx`
- Modify: `components/seguimiento/SeguimientoPage.tsx` (pass eurRate)

**Interfaces:**
- Consumes: `eurRate?: number` from `useExchangeRates`
- Produces: Correct CLP conversion for EUR-denominated holdings in enrichedSummaries and bondHoldings

- [x] **Step 1: Add eurRate to useHoldingSummaries**

In `components/seguimiento/hooks/useHoldingSummaries.ts`:

Add `eurRate` to params interface (line 47):

```typescript
interface UseHoldingSummariesParams {
  snapshots: Snapshot[];
  returnMode: "cartola" | "compra";
  fundsMeta?: FundMeta[];
  usdRate?: number;
  ufRate?: number;
  eurRate?: number;
  pricesAtDateEndpoint?: string;
}
```

Destructure it (line 51):

```typescript
export function useHoldingSummaries({
  snapshots,
  returnMode,
  fundsMeta,
  usdRate,
  ufRate,
  eurRate,
  pricesAtDateEndpoint = "/api/portfolio/prices-at-date",
}: UseHoldingSummariesParams) {
```

Fix the catch-all in `enrichedSummaries` useMemo (line 278). Replace the single `else if (usdRate)` with currency-aware conversion:

```typescript
if (priceIsCLP) {
  newMarketValue = h.quantity * mp.price;
} else if (priceIsUF && ufRate) {
  newMarketValue = h.quantity * mp.price * ufRate;
} else if (mp.currency === "EUR" && eurRate) {
  newMarketValue = h.quantity * mp.price * eurRate;
} else if (usdRate) {
  // USD and other currencies fallback
  newMarketValue = h.quantity * mp.price * usdRate;
}
```

Also fix the non-CLP marketValue fallback block (lines 293-298) — add EUR:

```typescript
if (enriched.currency === "EUR" && eurRate && enriched.marketValue > 0) {
  return { ...enriched, marketValue: enriched.marketValue * eurRate };
}
if (enriched.currency === "USD" && usdRate && enriched.marketValue > 0) {
  return { ...enriched, marketValue: enriched.marketValue * usdRate };
}
if (enriched.currency === "UF" && ufRate && enriched.marketValue > 0) {
  return { ...enriched, marketValue: enriched.marketValue * ufRate };
}
```

Add `eurRate` to the useMemo deps array (line 303):

```typescript
}, [holdingSummaries, marketPrices, bondLookups, tacByFundName, usdRate, ufRate, eurRate]);
```

- [x] **Step 2: Add eurRate to useBondCalculations**

In `components/seguimiento/hooks/useBondCalculations.ts`:

Add `eurRate` to params (line 41):

```typescript
interface UseBondCalculationsParams {
  enrichedSummaries: EnrichedSummary[];
  previousSnapshotDate: string | null;
  snapshots: Snapshot[];
  bondPrices: Map<string, { price: number; ytm: number | null; date: string }>;
  ufRate?: number;
  ufRateInitial?: number;
  usdRate?: number;
  eurRate?: number;
}
```

Destructure it and add EUR conversion block after the existing USD block (line 174):

```typescript
} else if (!isChileanBond && h.currency === "EUR" && eurRate) {
  marketValueCalc *= eurRate;
  actualCostBasis *= eurRate;
  devengoUSD *= eurRate;
  marketDeviationUSD *= eurRate;
} else if (!isChileanBond && usdRate) {
  // USD and other currencies fallback
  marketValueCalc *= usdRate;
  actualCostBasis *= usdRate;
  devengoUSD *= usdRate;
  marketDeviationUSD *= usdRate;
}
```

Update currency assignment in the return (line 201):

```typescript
currency: isChileanBond ? "UF" : (h.currency === "EUR" ? "EUR" : "USD"),
```

Add `eurRate` to useMemo deps (line 204):

```typescript
}, [enrichedSummaries, previousSnapshotDate, snapshots, bondPrices, ufRate, ufRateInitial, usdRate, eurRate]);
```

- [x] **Step 3: Thread eurRate through HoldingReturnsPanel and SeguimientoPage**

In `components/seguimiento/HoldingReturnsPanel.tsx`:

Add `eurRate` to Props interface (line 39):

```typescript
eurRate?: number;
```

Destructure it in the component (line 43), pass to `useHoldingSummaries` and `useBondCalculations`:

```typescript
// useHoldingSummaries call — add eurRate
const { holdingSummaries, enrichedSummaries, previousSnapshotDate, bondPrices, loadingPrices } = useHoldingSummaries({
  snapshots, returnMode, fundsMeta, usdRate, ufRate, eurRate, pricesAtDateEndpoint,
});

// useBondCalculations call — add eurRate
const bondHoldings = useBondCalculations({
  enrichedSummaries, previousSnapshotDate, snapshots, bondPrices,
  ufRate, ufRateInitial, usdRate, eurRate,
});
```

In `components/seguimiento/SeguimientoPage.tsx` (line 288), pass eurRate:

```typescript
<HoldingReturnsPanel
  snapshots={snapshots} clientId={clientId}
  onCurrentValueUpdate={seg.setLivePortfolioValue}
  onPriceDateUpdate={seg.setLivePriceDate}
  onHoldingReturnsReady={seg.setHoldingReturnsData}
  fundsMeta={fundsMeta}
  usdRate={(currentExchangeRates || exchangeRates)?.usd}
  ufRate={(currentExchangeRates || exchangeRates)?.uf}
  eurRate={(currentExchangeRates || exchangeRates)?.eur}
  ufRateInitial={deflatorData ? findDeflatorValue(deflatorData.uf, snapshots[0]?.snapshot_date) ?? undefined : undefined}
/>
```

- [x] **Step 4: Fix lib/tax/bridge.ts toCLP**

In `lib/tax/bridge.ts` line 71, add `eurRate` parameter and EUR handling:

```typescript
function toCLP(value: number, currency: string | undefined, usdRate: number, eurRate?: number): number {
  if (!currency || currency === "CLP") return value;
  if (currency === "USD") return value * usdRate;
  if (currency === "EUR" && eurRate) return value * eurRate;
  return value;
}
```

Find all callers of `toCLP` in bridge.ts and pass eurRate (it's a local function, so callers are in the same file). The main caller `buildTaxableHoldings` will need `eurRate` in its params.

- [x] **Step 5: Verify build compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: 0 errors

- [x] **Step 6: Commit** — `8257682`

```bash
git add components/seguimiento/hooks/useHoldingSummaries.ts components/seguimiento/hooks/useBondCalculations.ts components/seguimiento/HoldingReturnsPanel.tsx components/seguimiento/SeguimientoPage.tsx lib/tax/bridge.ts
git commit -m "feat: thread EUR rate through holding summaries, bond calculations, and tax bridge"
```

---

### Task 3: Use real FINRA prices in historical-prices API for bonds

**Files:**
- Modify: `app/api/portfolio/historical-prices/route.ts` (bond section, lines 534-593)

**Interfaces:**
- Consumes: `bond_prices` table (cusip, price_date, last_price)
- Produces: More accurate bond prices in the historical series — FINRA actuals overlaid on constant-yield projection

- [x] **Step 1: Add FINRA price query to bond processing**

In `app/api/portfolio/historical-prices/route.ts`, inside the bond loop (after line 561 `if (projected.length === 0) continue;`), query `bond_prices` for actual FINRA prices and overlay them:

```typescript
// After: if (projected.length === 0) continue;

// Overlay real FINRA prices where available
const secId = (bh.securityId || "").trim();
if (/^[A-Z0-9]{9}$/i.test(secId)) {
  const { data: finraPrices } = await supabase
    .from("bond_prices")
    .select("price_date, last_price")
    .eq("cusip", secId)
    .gte("price_date", bondFromDate)
    .lte("price_date", toDate)
    .order("price_date");

  if (finraPrices && finraPrices.length > 0) {
    // Build a map of FINRA actual prices (as fraction of par, same as projected)
    const finraMap = new Map<string, number>();
    for (const fp of finraPrices) {
      if (fp.last_price != null && fp.last_price > 0) {
        finraMap.set(fp.price_date, fp.last_price / 100); // % of par → fraction
      }
    }
    // Overlay: replace projected with actual where available
    for (const p of projected) {
      const actual = finraMap.get(p.date);
      if (actual !== undefined) {
        p.price = actual;
      }
    }
  }
}
```

- [x] **Step 2: Add EUR FX support to bond and international holdings**

In the same file, the FX conversion currently uses `getDolarObservado` for ALL non-CLP currencies. Add EUR support.

First, add a helper at the top of the handler function (after imports) to get EUR rate from mindicador.cl:

```typescript
// EUR rate cache for historical-prices (session-scoped)
const eurRateCache = new Map<string, number>();

async function getEurRate(fecha: string): Promise<number> {
  const cached = eurRateCache.get(fecha);
  if (cached) return cached;
  // Try mindicador.cl for the year
  const year = fecha.split("-")[0];
  const cacheKey = `eur-${year}`;
  if (!eurRateCache.has(cacheKey)) {
    try {
      const res = await fetch(`https://mindicador.cl/api/euro/${year}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const data = await res.json();
        for (const e of (data.serie || []) as Array<{ fecha: string; valor: number }>) {
          const dateStr = e.fecha.split("T")[0];
          eurRateCache.set(dateStr, e.valor);
        }
        eurRateCache.set(cacheKey, 1); // mark year as loaded
      }
    } catch { /* ignore */ }
  }
  // Find closest <= fecha
  let bestDate = "";
  let bestVal = 0;
  for (const [d, v] of eurRateCache) {
    if (d <= fecha && d > bestDate && !d.startsWith("eur-")) {
      bestDate = d;
      bestVal = v;
    }
  }
  if (bestVal > 0) return bestVal;
  throw new Error(`No EUR rate for ${fecha}`);
}
```

Then in the international holdings section (line 513), change the FX conversion to be currency-aware:

```typescript
if (!isCLP) {
  const isEUR = (ih.currency || "USD").toUpperCase() === "EUR";
  for (const [fecha, price] of intPriceMap) {
    try {
      const fxRate = isEUR ? await getEurRate(fecha) : await getDolarObservado(fecha);
      fechaMap.set(fecha, price * fxRate);
    } catch {
      // Skip dates without FX rate
    }
  }
}
```

Same for bond holdings section (line 581):

```typescript
const isEUR = (bh.currency || "USD").toUpperCase() === "EUR";
if (isCLP) {
  fechaMap.set(p.date, usdValue);
} else {
  try {
    const fxRate = isEUR ? await getEurRate(p.date) : await getDolarObservado(p.date);
    fechaMap.set(p.date, usdValue * fxRate);
  } catch {
    // Skip dates without FX rate
  }
}
```

Same for flat holdings section (line 634):

```typescript
const isEUR = (fh.currency || "USD").toUpperCase() === "EUR";
// ...
const fxRate = isEUR ? await getEurRate(dateStr) : await getDolarObservado(dateStr);
fechaMap.set(dateStr, fh.marketValue * fxRate);
```

- [x] **Step 3: Verify build compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: 0 errors

- [x] **Step 4: Commit** — `c9370ce`

```bash
git add app/api/portfolio/historical-prices/route.ts
git commit -m "feat: overlay FINRA prices on bond projections + EUR FX in historical-prices"
```

---

### Task 4: Verify + final build

**Files:** None (verification only)

- [x] **Step 1: Run tests**

```bash
npm run test:run 2>&1 | tail -20
```

Result: 325 passed, 5 failed (pre-existing failures in `seguimiento-email.test.ts` — confirmed identical before these changes).

- [x] **Step 2: Run build**

```bash
npm run build 2>&1 | tail -30
```

Result: Build succeeds with 0 errors.

- [x] **Step 3: Run lint**

```bash
npm run lint 2>&1 | tail -10
```

Result: No new warnings (24 errors / 25 warnings all pre-existing in scripts/*.cjs and unrelated files).

- [x] **Step 4: Final commit (if any fixes needed)**

No fixes needed — all clean. Pushed to remote.

---

## Status: COMPLETE

All 4 tasks implemented and pushed. Commits:
- `84f1e82` — Task 1: EUR in historical exchange rates API + useExchangeRates hook
- `8257682` — Task 2: EUR threaded through holding summaries, bond calculations, tax bridge
- `c9370ce` — Task 3: FINRA price overlay on bond projections + EUR FX in historical-prices

## Next: Manual QA

Revisión modulo por modulo (tab por tab) recomendada:
- Evaluación critica de funcionalidades — que todo funcione, cálculos correctos, formato confiable
- Verificar EUR holdings se convierten correctamente a CLP en seguimiento
- Verificar bonos muestran precios FINRA reales donde hay datos (vs solo proyección)
- Verificar que holdings USD siguen funcionando igual (backward compat)
