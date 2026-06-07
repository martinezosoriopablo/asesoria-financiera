# Radiografia & Recomendacion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New `/recomendacion` page that classifies client holdings (including individual stocks by sector via AlphaVantage), compares them against the comite model portfolio at two levels (macro asset allocation + micro sector breakdown), and generates actionable trade suggestions.

**Architecture:** Extends existing radiografia API (`POST /api/portfolio/radiografia`) with stock sector enrichment from AlphaVantage OVERVIEW (cached in `stock_profiles` table). New page under `app/(advisor-shell)/recomendacion/` with components split by section: macro allocation, sector breakdown, holdings table, and trade suggestions.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase, AlphaVantage API (premium), Tailwind v4, recharts (for charts later)

---

## File Structure

| File | Responsibility |
|------|---------------|
| **Create:** `supabase/migrations/20260602_stock_profiles.sql` | stock_profiles table for AV sector cache |
| **Create:** `lib/stock-profiles.ts` | Fetch + cache stock profiles from AV OVERVIEW |
| **Create:** `lib/sector-mapping.ts` | Map AV sectors to comite sleeves + types |
| **Create:** `lib/stock-profiles.test.ts` | Tests for stock profile fetching + caching |
| **Create:** `lib/sector-mapping.test.ts` | Tests for sector-to-sleeve mapping |
| **Create:** `app/api/stock-profiles/route.ts` | API: GET stock profiles (cached + on-demand fetch) |
| **Modify:** `app/api/portfolio/radiografia/route.ts` | Add sector breakdown + trade suggestions to response |
| **Create:** `app/(advisor-shell)/recomendacion/page.tsx` | Page with ClientSelector |
| **Create:** `app/(advisor-shell)/recomendacion/[clientId]/page.tsx` | Client-specific radiografia page |
| **Create:** `components/recomendacion/RecomendacionPage.tsx` | Main orchestrator component |
| **Create:** `components/recomendacion/MacroAllocation.tsx` | RV/RF/Alt/Cash vs model bars |
| **Create:** `components/recomendacion/SectorBreakdown.tsx` | Sector table normalized to 100% RV |
| **Create:** `components/recomendacion/HoldingsTable.tsx` | All positions grouped by sector |
| **Create:** `components/recomendacion/TradeSuggestions.tsx` | Actionable trade cards |
| **Modify:** `components/shared/AdvisorSidebar.tsx` | Add "Radiografia" nav item |
| **Modify:** `components/seguimiento/SeguimientoPage.tsx` | Add link to /recomendacion |

---

### Task 1: stock_profiles table + migration

**Files:**
- Create: `supabase/migrations/20260602_stock_profiles.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Stock profiles cache (sector, industry from AlphaVantage OVERVIEW)
CREATE TABLE IF NOT EXISTS stock_profiles (
  ticker TEXT PRIMARY KEY,
  name TEXT,
  sector TEXT,
  industry TEXT,
  market_cap BIGINT,
  country TEXT,
  exchange TEXT,
  fetched_at TIMESTAMPTZ DEFAULT now()
);

-- No RLS needed — reference data, not client-specific
```

- [ ] **Step 2: Show SQL to user for execution in Supabase**

Display the SQL so the user can run it in the Supabase SQL editor.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260602_stock_profiles.sql
git commit -m "feat: add stock_profiles table for AV sector cache"
```

---

### Task 2: Sector-to-sleeve mapping

**Files:**
- Create: `lib/sector-mapping.ts`
- Create: `lib/sector-mapping.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/sector-mapping.test.ts
import { describe, it, expect } from "vitest";
import {
  mapSectorToSleeve,
  mapSectorToCategory,
  type StockProfile,
} from "./sector-mapping";

describe("mapSectorToSleeve", () => {
  it("maps Technology to us_tech", () => {
    expect(mapSectorToSleeve("Technology")).toBe("us_tech");
  });

  it("maps Healthcare to us_healthcare", () => {
    expect(mapSectorToSleeve("Healthcare")).toBe("us_healthcare");
  });

  it("maps Real Estate to us_reits", () => {
    expect(mapSectorToSleeve("Real Estate")).toBe("us_reits");
  });

  it("returns null for unknown sector", () => {
    expect(mapSectorToSleeve("Unknown Sector")).toBeNull();
  });
});

describe("mapSectorToCategory", () => {
  it("maps US Technology stock to rv_usa_large_cap", () => {
    const profile: StockProfile = {
      ticker: "AAPL",
      name: "Apple Inc",
      sector: "Technology",
      industry: "Consumer Electronics",
      marketCap: 3000000000000,
      country: "US",
      exchange: "NASDAQ",
    };
    expect(mapSectorToCategory(profile)).toBe("rv_usa_large_cap");
  });

  it("maps US Real Estate stock to alt_reits", () => {
    const profile: StockProfile = {
      ticker: "O",
      name: "Realty Income",
      sector: "Real Estate",
      industry: "REIT",
      marketCap: 40000000000,
      country: "US",
      exchange: "NYSE",
    };
    expect(mapSectorToCategory(profile)).toBe("alt_reits");
  });

  it("maps Brazilian stock to rv_emergentes", () => {
    const profile: StockProfile = {
      ticker: "VALE",
      name: "Vale SA",
      sector: "Basic Materials",
      industry: "Mining",
      marketCap: 50000000000,
      country: "BR",
      exchange: "NYSE",
    };
    expect(mapSectorToCategory(profile)).toBe("rv_emergentes");
  });

  it("maps UK stock to rv_desarrollados_ex_us", () => {
    const profile: StockProfile = {
      ticker: "BP",
      name: "BP plc",
      sector: "Energy",
      industry: "Oil",
      marketCap: 80000000000,
      country: "GB",
      exchange: "NYSE",
    };
    expect(mapSectorToCategory(profile)).toBe("rv_desarrollados_ex_us");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/sector-mapping.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement sector-mapping.ts**

```typescript
// lib/sector-mapping.ts

export interface StockProfile {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  marketCap: number;
  country: string;
  exchange: string;
}

// AV OVERVIEW sector → comite sleeve ID
const SECTOR_TO_SLEEVE: Record<string, string> = {
  "Technology": "us_tech",
  "Healthcare": "us_healthcare",
  "Financial Services": "us_financials",
  "Consumer Cyclical": "us_consumer_discretionary",
  "Consumer Defensive": "us_consumer_staples",
  "Energy": "us_energy",
  "Industrials": "us_industrials",
  "Communication Services": "us_communication",
  "Utilities": "us_utilities",
  "Real Estate": "us_reits",
  "Basic Materials": "us_materials",
};

// Emerging market countries (ISO 2-letter codes)
const EMERGING_COUNTRIES = new Set([
  "BR", "CN", "IN", "MX", "KR", "TW", "ZA", "ID", "TH", "MY",
  "PH", "CL", "CO", "PE", "CZ", "PL", "HU", "TR", "SA", "AE",
  "QA", "KW", "EG", "VN",
]);

// Developed non-US countries
const DEVELOPED_EX_US = new Set([
  "GB", "DE", "FR", "JP", "CA", "AU", "CH", "NL", "SE", "DK",
  "NO", "FI", "IE", "IT", "ES", "PT", "AT", "BE", "SG", "HK",
  "NZ", "IL", "LU",
]);

/**
 * Map an AV sector string to a comite sleeve ID.
 * Returns null if sector is unknown.
 */
export function mapSectorToSleeve(sector: string): string | null {
  return SECTOR_TO_SLEEVE[sector] ?? null;
}

/**
 * Map a stock profile to the appropriate comite category.
 * Priority: country-based geography first, then sector for US stocks.
 */
export function mapSectorToCategory(profile: StockProfile): string {
  // Real Estate → alt_reits regardless of country
  if (profile.sector === "Real Estate") {
    return "alt_reits";
  }

  // Non-US stocks: classify by geography
  if (profile.country && profile.country !== "US") {
    if (EMERGING_COUNTRIES.has(profile.country)) {
      return "rv_emergentes";
    }
    if (DEVELOPED_EX_US.has(profile.country)) {
      return "rv_desarrollados_ex_us";
    }
  }

  // US stocks (or unknown country): all go to rv_usa_large_cap
  return "rv_usa_large_cap";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/sector-mapping.test.ts`
Expected: 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/sector-mapping.ts lib/sector-mapping.test.ts
git commit -m "feat: sector-to-sleeve mapping for stock classification"
```

---

### Task 3: Stock profiles fetcher (AV OVERVIEW + cache)

**Files:**
- Create: `lib/stock-profiles.ts`
- Create: `lib/stock-profiles.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/stock-profiles.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchStockOverview, parseAVOverview } from "./stock-profiles";

describe("parseAVOverview", () => {
  it("parses a valid AV OVERVIEW response", () => {
    const raw = {
      Symbol: "AAPL",
      Name: "Apple Inc",
      Sector: "Technology",
      Industry: "Consumer Electronics",
      MarketCapitalization: "3000000000000",
      Country: "USA",
      Exchange: "NASDAQ",
    };
    const result = parseAVOverview(raw);
    expect(result).toEqual({
      ticker: "AAPL",
      name: "Apple Inc",
      sector: "Technology",
      industry: "Consumer Electronics",
      marketCap: 3000000000000,
      country: "US",
      exchange: "NASDAQ",
    });
  });

  it("normalizes USA/United States to US", () => {
    const raw = {
      Symbol: "MSFT",
      Name: "Microsoft",
      Sector: "Technology",
      Industry: "Software",
      MarketCapitalization: "2500000000000",
      Country: "United States",
      Exchange: "NASDAQ",
    };
    expect(parseAVOverview(raw)?.country).toBe("US");
  });

  it("returns null for empty/error response", () => {
    expect(parseAVOverview({})).toBeNull();
    expect(parseAVOverview({ Note: "API rate limit" })).toBeNull();
    expect(parseAVOverview({ "Error Message": "Invalid" })).toBeNull();
  });
});

describe("fetchStockOverview", () => {
  beforeEach(() => {
    vi.stubEnv("ALPHA_VANTAGE_API_KEY", "test-key");
  });

  it("returns null when API key is missing", async () => {
    vi.stubEnv("ALPHA_VANTAGE_API_KEY", "");
    const result = await fetchStockOverview("AAPL");
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/stock-profiles.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement stock-profiles.ts**

```typescript
// lib/stock-profiles.ts
import { AV_BASE } from "@/lib/prices/alphavantage";
import type { StockProfile } from "@/lib/sector-mapping";

const COUNTRY_NORMALIZE: Record<string, string> = {
  USA: "US",
  "United States": "US",
  "United Kingdom": "GB",
  Brazil: "BR",
  China: "CN",
  India: "IN",
  Mexico: "MX",
  "South Korea": "KR",
  Taiwan: "TW",
  Japan: "JP",
  Canada: "CA",
  Australia: "AU",
  Switzerland: "CH",
  Germany: "DE",
  France: "FR",
  Netherlands: "NL",
  Chile: "CL",
  Colombia: "CO",
  Peru: "PE",
};

/**
 * Parse raw AV OVERVIEW JSON into a StockProfile.
 * Returns null if the response is invalid or an error.
 */
export function parseAVOverview(
  raw: Record<string, unknown>
): StockProfile | null {
  if (!raw || raw.Note || raw.Information || raw["Error Message"]) return null;

  const symbol = raw.Symbol as string;
  const name = raw.Name as string;
  const sector = raw.Sector as string;
  if (!symbol || !sector || sector === "LIFE SCIENCES") return null;

  const rawCountry = (raw.Country as string) || "";
  const country = COUNTRY_NORMALIZE[rawCountry] || rawCountry.slice(0, 2).toUpperCase();

  return {
    ticker: symbol,
    name: name || symbol,
    sector,
    industry: (raw.Industry as string) || "",
    marketCap: parseInt((raw.MarketCapitalization as string) || "0", 10) || 0,
    country,
    exchange: (raw.Exchange as string) || "",
  };
}

/**
 * Fetch a single stock's overview from AlphaVantage.
 * Returns parsed StockProfile or null on error.
 */
export async function fetchStockOverview(
  ticker: string
): Promise<StockProfile | null> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY || "";
  if (!apiKey) return null;

  try {
    const url = `${AV_BASE}?function=OVERVIEW&symbol=${encodeURIComponent(ticker)}&apikey=${apiKey}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return parseAVOverview(data);
  } catch {
    return null;
  }
}

/**
 * Fetch multiple stock overviews in parallel.
 * Respects AV premium rate (75/min) — no throttling needed.
 */
export async function fetchStockOverviews(
  tickers: string[]
): Promise<Map<string, StockProfile>> {
  const results = new Map<string, StockProfile>();
  const settled = await Promise.allSettled(
    tickers.map(async (t) => {
      const profile = await fetchStockOverview(t);
      if (profile) results.set(t, profile);
    })
  );
  return results;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/stock-profiles.test.ts`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/stock-profiles.ts lib/stock-profiles.test.ts
git commit -m "feat: stock profile fetcher with AV OVERVIEW parsing"
```

---

### Task 4: Stock profiles API route

**Files:**
- Create: `app/api/stock-profiles/route.ts`

- [ ] **Step 1: Create the API route**

```typescript
// app/api/stock-profiles/route.ts
import { NextRequest } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";
import { fetchStockOverviews } from "@/lib/stock-profiles";
import type { StockProfile } from "@/lib/sector-mapping";

const CACHE_DAYS = 30;

export async function GET(req: NextRequest) {
  return handleApiError("stock-profiles", async () => {
    const { error } = await requireAdvisor();
    if (error) return error;

    const tickersParam = req.nextUrl.searchParams.get("tickers");
    if (!tickersParam) return errorResponse("tickers param required", 400);

    const tickers = tickersParam
      .split(",")
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
    if (tickers.length === 0) return errorResponse("No tickers provided", 400);
    if (tickers.length > 50) return errorResponse("Max 50 tickers per request", 400);

    const sb = createAdminClient();

    // 1. Check cache
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - CACHE_DAYS);
    const cutoffStr = cutoff.toISOString();

    const { data: cached } = await sb
      .from("stock_profiles")
      .select("ticker, name, sector, industry, market_cap, country, exchange, fetched_at")
      .in("ticker", tickers)
      .gte("fetched_at", cutoffStr);

    const cachedMap = new Map<string, StockProfile>();
    for (const row of cached || []) {
      cachedMap.set(row.ticker, {
        ticker: row.ticker,
        name: row.name || row.ticker,
        sector: row.sector || "",
        industry: row.industry || "",
        marketCap: row.market_cap || 0,
        country: row.country || "",
        exchange: row.exchange || "",
      });
    }

    // 2. Fetch missing from AV
    const missing = tickers.filter((t) => !cachedMap.has(t));
    let fetchedCount = 0;

    if (missing.length > 0) {
      const fetched = await fetchStockOverviews(missing);
      fetchedCount = fetched.size;

      // Store in DB
      const rows = Array.from(fetched.values()).map((p) => ({
        ticker: p.ticker,
        name: p.name,
        sector: p.sector,
        industry: p.industry,
        market_cap: p.marketCap,
        country: p.country,
        exchange: p.exchange,
        fetched_at: new Date().toISOString(),
      }));

      if (rows.length > 0) {
        await sb
          .from("stock_profiles")
          .upsert(rows, { onConflict: "ticker" });
      }

      // Merge into cached
      for (const [ticker, profile] of fetched) {
        cachedMap.set(ticker, profile);
      }
    }

    // 3. Return all profiles
    const profiles = tickers
      .map((t) => cachedMap.get(t))
      .filter((p): p is StockProfile => p != null);

    return successResponse({ profiles, fetchedCount });
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep -i "stock-profiles\|sector-mapping"`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add app/api/stock-profiles/route.ts
git commit -m "feat: stock profiles API with AV cache"
```

---

### Task 5: Enhance radiografia API with sector breakdown

**Files:**
- Modify: `app/api/portfolio/radiografia/route.ts`

- [ ] **Step 1: Add sector breakdown types and imports**

At the top of the file, add imports:

```typescript
import { mapSectorToSleeve, mapSectorToCategory, type StockProfile } from "@/lib/sector-mapping";
```

After the existing `CategoryResult` interface (~line 77), add:

```typescript
interface SectorBreakdownItem {
  sector: string;
  sleeveId: string | null;
  actualPct: number;
  sleevePct: number | null;
  deltaPp: number;
  sleeveVista: "OW" | "UW" | "N" | null;
  sleeveConviction: "ALTA" | "MEDIA" | "BAJA" | null;
  holdings: Array<{
    fundName: string;
    ticker: string;
    marketValueUSD: number;
    weightInSector: number;
  }>;
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
```

- [ ] **Step 2: After step 8 (classify holdings), enrich stocks with sector data**

Insert after line ~239 (after classification loop), before step 9:

```typescript
    // ── 8b. Enrich stocks with sector data ────────────────────────────
    // Identify holdings that are individual stocks (not ETFs, not numeric RUNs)
    const stockTickers = classifiedHoldings
      .filter((h) => {
        const sid = h.securityId?.trim() || "";
        // Not a numeric RUN, not empty, not a known ETF, short alpha ticker
        return sid && !/^\d+$/.test(sid) && /^[A-Z]{1,5}$/.test(sid);
      })
      .map((h) => h.securityId!.trim().toUpperCase());

    const uniqueStockTickers = [...new Set(stockTickers)];
    const stockProfiles = new Map<string, StockProfile>();

    if (uniqueStockTickers.length > 0) {
      // Check stock_profiles cache
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);

      const { data: cached } = await supabase
        .from("stock_profiles")
        .select("ticker, name, sector, industry, market_cap, country, exchange")
        .in("ticker", uniqueStockTickers)
        .gte("fetched_at", cutoff.toISOString());

      for (const row of cached || []) {
        stockProfiles.set(row.ticker, {
          ticker: row.ticker,
          name: row.name || row.ticker,
          sector: row.sector || "",
          industry: row.industry || "",
          marketCap: row.market_cap || 0,
          country: row.country || "",
          exchange: row.exchange || "",
        });
      }

      // Fetch missing from AV
      const missingTickers = uniqueStockTickers.filter((t) => !stockProfiles.has(t));
      if (missingTickers.length > 0) {
        const { fetchStockOverviews } = await import("@/lib/stock-profiles");
        const fetched = await fetchStockOverviews(missingTickers);

        // Store in DB
        const rows = Array.from(fetched.values()).map((p) => ({
          ticker: p.ticker,
          name: p.name,
          sector: p.sector,
          industry: p.industry,
          market_cap: p.marketCap,
          country: p.country,
          exchange: p.exchange,
          fetched_at: new Date().toISOString(),
        }));
        if (rows.length > 0) {
          await supabase.from("stock_profiles").upsert(rows, { onConflict: "ticker" });
        }

        for (const [t, p] of fetched) stockProfiles.set(t, p);
      }

      // Reclassify stocks using sector data (upgrade from low to medium confidence)
      for (const h of classifiedHoldings) {
        const sid = h.securityId?.trim().toUpperCase() || "";
        const profile = stockProfiles.get(sid);
        if (profile && h.confidence === "low") {
          h.categoryId = mapSectorToCategory(profile);
          h.confidence = "medium";
        }
      }
    }
```

- [ ] **Step 3: After step 12 (allocation), build sector breakdown**

Insert after the allocation summary block (~line 434):

```typescript
    // ── 12b. Build sector breakdown (normalized within RV) ─────────
    const rvHoldings = classifiedHoldings.filter((h) => {
      const cat = getCategoryById(h.categoryId);
      return cat?.role === "rv";
    });

    const rvTotalCLP = rvHoldings.reduce((s, h) => s + h.valueCLP, 0);

    // Group RV holdings by sector
    const sectorGroups = new Map<string, typeof rvHoldings>();
    for (const h of rvHoldings) {
      const sid = h.securityId?.trim().toUpperCase() || "";
      const profile = stockProfiles.get(sid);
      const sector = profile?.sector || "Other";
      if (!sectorGroups.has(sector)) sectorGroups.set(sector, []);
      sectorGroups.get(sector)!.push(h);
    }

    // Get sleeve data from model
    const sleeveMap = new Map<string, { vista: string; conviction: string; peso_pct: number }>();
    for (const s of sleeves) {
      const id = s.id as string || s.sector as string || "";
      if (id) {
        sleeveMap.set(id, {
          vista: (s.vista as string) || "N",
          conviction: (s.conviction as string) || "",
          peso_pct: (s.peso_pct as number) || 0,
        });
      }
    }

    const sectorBreakdown: SectorBreakdownItem[] = Array.from(sectorGroups.entries())
      .map(([sector, holdings]) => {
        const sectorValueCLP = holdings.reduce((s, h) => s + h.valueCLP, 0);
        const actualPct = rvTotalCLP > 0
          ? Math.round((sectorValueCLP / rvTotalCLP) * 10000) / 100
          : 0;

        const sleeveId = mapSectorToSleeve(sector);
        const sleeve = sleeveId ? sleeveMap.get(sleeveId) : null;

        return {
          sector,
          sleeveId,
          actualPct,
          sleevePct: sleeve?.peso_pct ?? null,
          deltaPp: sleeve?.peso_pct != null
            ? Math.round((actualPct - sleeve.peso_pct) * 100) / 100
            : 0,
          sleeveVista: (sleeve?.vista as SectorBreakdownItem["sleeveVista"]) ?? null,
          sleeveConviction: (sleeve?.conviction as SectorBreakdownItem["sleeveConviction"]) ?? null,
          holdings: holdings.map((h) => ({
            fundName: h.fundName,
            ticker: h.securityId?.trim() || "",
            marketValueUSD: h.marketValue || 0,
            weightInSector: sectorValueCLP > 0
              ? Math.round((h.valueCLP / sectorValueCLP) * 10000) / 100
              : 0,
          })),
        };
      })
      .sort((a, b) => Math.abs(b.deltaPp) - Math.abs(a.deltaPp));

    // ── 12c. Generate trade suggestions ────────────────────────────
    const tradeSuggestions: TradeSuggestion[] = [];

    // Macro-level suggestions (asset allocation gaps)
    for (const role of ["rf", "alt", "cash"] as ComiteRole[]) {
      const alloc = allocation[role];
      if (alloc.target > 0 && alloc.actual < alloc.target - 3) {
        const gap = alloc.target - alloc.actual;
        // Find the primary ETF for this role's biggest category
        const roleCats = categories.filter((c) => c.role === role && c.targetPct > 0);
        const biggest = roleCats.sort((a, b) => b.targetPct - a.targetPct)[0];
        if (biggest) {
          const catDef = getCategoryById(biggest.categoria);
          tradeSuggestions.push({
            action: "AGREGAR",
            reason: `${role.toUpperCase()} subponderado ${Math.abs(gap).toFixed(1)}pp vs modelo. Considerar agregar exposicion.`,
            instrument: catDef?.etfUS ? `ETF ${catDef.etfUS}` : biggest.categoriaLabel,
            instrumentTicker: catDef?.etfUS || undefined,
            amountUSD: undefined,
            priority: gap > 10 ? "alta" : "media",
          });
        }
      }
    }

    // Sector-level suggestions (within RV)
    for (const sb of sectorBreakdown) {
      if (sb.sleevePct == null) continue;
      const delta = sb.actualPct - sb.sleevePct;

      if (delta > 5) {
        // Overweight sector
        const topHoldings = sb.holdings
          .sort((a, b) => b.marketValueUSD - a.marketValueUSD)
          .slice(0, 3)
          .map((h) => h.ticker);

        tradeSuggestions.push({
          action: "REDUCIR",
          reason: `${sb.sector} sobreponderado +${delta.toFixed(1)}pp vs sleeve${sb.sleeveVista ? ` (vista: ${sb.sleeveVista})` : ""}.`,
          holdings: topHoldings,
          priority: delta > 15 ? "alta" : "media",
        });
      } else if (delta < -5 && sb.sleeveVista === "OW") {
        // Underweight sector with OW view
        const sleeve = sb.sleeveId ? sleeveMap.get(sb.sleeveId) : null;
        tradeSuggestions.push({
          action: "AGREGAR",
          reason: `${sb.sector} subponderado ${Math.abs(delta).toFixed(1)}pp, vista OW del comite${sb.sleeveConviction ? ` (conviction ${sb.sleeveConviction})` : ""}.`,
          priority: sb.sleeveConviction === "ALTA" ? "alta" : "media",
        });
      }
    }

    // Sort by priority
    const priorityOrder = { alta: 0, media: 1, baja: 2 };
    tradeSuggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    // Determine if tax analysis should be shown
    const isAllInternacional = custodiansList.every((c) => c.type === "internacional");
```

- [ ] **Step 4: Update the response to include new fields**

Replace the return statement (~line 451) with:

```typescript
    return successResponse({
      data: {
        clientId,
        clientName,
        perfilModelo,
        perfilCliente,
        reportDate: modelRow.report_date,
        notaComite: modelRow.nota_comite || null,
        totalValueCLP,
        categories,
        allocation,
        flags,
        sleeves,
        custodians: custodiansList,
        sectorBreakdown,
        tradeSuggestions,
        stockProfiles: Object.fromEntries(stockProfiles),
        taxAnalysisEnabled: !isAllInternacional,
      },
    });
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep -i "radiografia"`
Expected: No new errors

- [ ] **Step 6: Commit**

```bash
git add app/api/portfolio/radiografia/route.ts
git commit -m "feat: radiografia API with sector breakdown + trade suggestions"
```

---

### Task 6: Recomendacion page routing

**Files:**
- Create: `app/(advisor-shell)/recomendacion/page.tsx`
- Create: `app/(advisor-shell)/recomendacion/[clientId]/page.tsx`

- [ ] **Step 1: Create the selector page**

```typescript
// app/(advisor-shell)/recomendacion/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ClientSelector from "@/components/shared/ClientSelector";
import { Scale } from "lucide-react";

export default function RecomendacionSelectorPage() {
  const router = useRouter();
  const [clientId, setClientId] = useState<string | null>(null);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gb-black">Radiografia</h1>
        <p className="text-sm text-gb-gray mt-1">
          Compara las posiciones del cliente contra el portafolio modelo del comite
        </p>
      </div>

      <div className="max-w-md">
        <ClientSelector
          value={clientId}
          onChange={(id) => {
            setClientId(id);
            if (id) router.push(`/recomendacion/${id}`);
          }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the client-specific page**

```typescript
// app/(advisor-shell)/recomendacion/[clientId]/page.tsx
"use client";

import { useParams } from "next/navigation";
import RecomendacionPage from "@/components/recomendacion/RecomendacionPage";

export default function RecomendacionClientPage() {
  const { clientId } = useParams<{ clientId: string }>();

  if (!clientId) return null;

  return <RecomendacionPage clientId={clientId} />;
}
```

- [ ] **Step 3: Commit**

```bash
git add "app/(advisor-shell)/recomendacion/page.tsx" "app/(advisor-shell)/recomendacion/[clientId]/page.tsx"
git commit -m "feat: recomendacion page routing with client selector"
```

---

### Task 7: RecomendacionPage orchestrator component

**Files:**
- Create: `components/recomendacion/RecomendacionPage.tsx`

- [ ] **Step 1: Create the main orchestrator**

```typescript
// components/recomendacion/RecomendacionPage.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Loader, RefreshCw, Scale, AlertTriangle } from "lucide-react";
import MacroAllocation from "./MacroAllocation";
import SectorBreakdown from "./SectorBreakdown";
import HoldingsTable from "./HoldingsTable";
import TradeSuggestions from "./TradeSuggestions";

interface RadiografiaData {
  clientId: string;
  clientName: string;
  perfilModelo: string;
  perfilCliente: string;
  reportDate: string;
  notaComite: string | null;
  totalValueCLP: number;
  categories: Array<{
    categoria: string;
    categoriaLabel: string;
    role: "rv" | "rf" | "alt" | "cash";
    targetPct: number;
    actualPct: number;
    deltaPp: number;
    estado: "SOBREPONDERADO" | "SUBPONDERADO" | "EN_RANGO";
    vista: "OW" | "UW" | "N";
    conviction: string | null;
    currentHoldings: Array<{
      fundName: string;
      securityId: string | null;
      marketValueCLP: number;
      weightPct: number;
      custodian: string;
      custodianType: string;
      classificationConfidence: "high" | "medium" | "low";
    }>;
    proposedAction: {
      direction: "buy" | "sell" | "hold";
      amountCLP: number;
      instrument: string;
      ticker: string | null;
      custodian: string;
      custodianType: string;
    } | null;
  }>;
  allocation: Record<string, { actual: number; target: number; delta: number }>;
  flags: Array<{ type: string; holdingName: string; message: string }>;
  sleeves: Array<Record<string, unknown>>;
  custodians: Array<{ name: string; type: string; snapshotDate: string }>;
  sectorBreakdown: Array<{
    sector: string;
    sleeveId: string | null;
    actualPct: number;
    sleevePct: number | null;
    deltaPp: number;
    sleeveVista: "OW" | "UW" | "N" | null;
    sleeveConviction: "ALTA" | "MEDIA" | "BAJA" | null;
    holdings: Array<{
      fundName: string;
      ticker: string;
      marketValueUSD: number;
      weightInSector: number;
    }>;
  }>;
  tradeSuggestions: Array<{
    action: "REDUCIR" | "AGREGAR" | "MANTENER";
    reason: string;
    holdings?: string[];
    amountUSD?: number;
    instrument?: string;
    instrumentTicker?: string;
    priority: "alta" | "media" | "baja";
  }>;
  stockProfiles: Record<string, {
    ticker: string;
    name: string;
    sector: string;
    industry: string;
    marketCap: number;
    country: string;
  }>;
  taxAnalysisEnabled: boolean;
}

interface Props {
  clientId: string;
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
        <Loader className="w-6 h-6 animate-spin text-gb-gray" />
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

  const profileLabels: Record<string, string> = {
    conservador: "Conservador",
    moderado_conservador: "Moderado Conservador",
    moderado: "Moderado",
    moderado_agresivo: "Moderado Agresivo",
    agresivo: "Agresivo",
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gb-black">
            Radiografia — {data.clientName}
          </h1>
          <p className="text-sm text-gb-gray mt-1">
            Perfil: {profileLabels[data.perfilCliente] || data.perfilCliente}
            {" → "}
            Modelo: {profileLabels[data.perfilModelo] || data.perfilModelo}
            {" · "}
            Comite: {data.reportDate}
          </p>
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

      {/* Macro Allocation */}
      <MacroAllocation allocation={data.allocation} />

      {/* Sector Breakdown (if RV > 0) */}
      {data.sectorBreakdown.length > 0 && (
        <SectorBreakdown sectors={data.sectorBreakdown} />
      )}

      {/* Holdings Table */}
      <HoldingsTable
        categories={data.categories}
        stockProfiles={data.stockProfiles}
        sectorBreakdown={data.sectorBreakdown}
      />

      {/* Trade Suggestions */}
      {data.tradeSuggestions.length > 0 && (
        <TradeSuggestions suggestions={data.tradeSuggestions} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/recomendacion/RecomendacionPage.tsx
git commit -m "feat: RecomendacionPage orchestrator component"
```

---

### Task 8: MacroAllocation component

**Files:**
- Create: `components/recomendacion/MacroAllocation.tsx`

- [ ] **Step 1: Create the component**

```typescript
// components/recomendacion/MacroAllocation.tsx
"use client";

import React from "react";

interface Props {
  allocation: Record<string, { actual: number; target: number; delta: number }>;
}

const ROLE_LABELS: Record<string, string> = {
  rv: "Renta Variable",
  rf: "Renta Fija",
  alt: "Alternativos",
  cash: "Caja",
};

const ROLE_COLORS: Record<string, { bar: string; bg: string }> = {
  rv: { bar: "bg-blue-500", bg: "bg-blue-100" },
  rf: { bar: "bg-emerald-500", bg: "bg-emerald-100" },
  alt: { bar: "bg-purple-500", bg: "bg-purple-100" },
  cash: { bar: "bg-slate-400", bg: "bg-slate-100" },
};

function deltaColor(delta: number): string {
  const abs = Math.abs(delta);
  if (abs <= 3) return "text-green-600";
  if (abs <= 10) return "text-amber-600";
  return "text-red-600";
}

export default function MacroAllocation({ allocation }: Props) {
  return (
    <div className="bg-white rounded-lg border border-gb-border shadow-sm mb-6">
      <div className="px-6 py-4 border-b border-gb-border">
        <h2 className="text-base font-semibold text-gb-black">
          Asset Allocation vs Modelo
        </h2>
      </div>
      <div className="px-6 py-4 space-y-4">
        {(["rv", "rf", "alt", "cash"] as const).map((role) => {
          const alloc = allocation[role];
          if (!alloc) return null;
          const colors = ROLE_COLORS[role];
          const maxPct = Math.max(alloc.actual, alloc.target, 1);

          return (
            <div key={role}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gb-black">
                  {ROLE_LABELS[role]}
                </span>
                <span className={`text-sm font-medium ${deltaColor(alloc.delta)}`}>
                  {alloc.delta > 0 ? "+" : ""}{alloc.delta.toFixed(1)}pp
                </span>
              </div>
              <div className="flex items-center gap-3">
                {/* Actual bar */}
                <div className="flex-1">
                  <div className={`h-5 ${colors.bg} rounded-full overflow-hidden`}>
                    <div
                      className={`h-full ${colors.bar} rounded-full transition-all duration-500`}
                      style={{ width: `${Math.min((alloc.actual / Math.max(maxPct, 1)) * 100, 100)}%` }}
                    />
                  </div>
                </div>
                <div className="w-20 text-right">
                  <span className="text-sm font-semibold text-gb-black">
                    {alloc.actual.toFixed(1)}%
                  </span>
                  <span className="text-xs text-gb-gray ml-1">
                    / {alloc.target.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary message */}
      {(() => {
        const rvDelta = allocation.rv?.delta || 0;
        if (Math.abs(rvDelta) > 20) {
          return (
            <div className="px-6 py-3 bg-amber-50 border-t border-amber-200 rounded-b-lg">
              <p className="text-xs text-amber-800">
                La cartera esta fuertemente concentrada en Renta Variable
                ({allocation.rv?.actual.toFixed(0)}% vs {allocation.rv?.target.toFixed(0)}% modelo).
                El modelo sugiere diversificar hacia otros tipos de activo.
              </p>
            </div>
          );
        }
        return null;
      })()}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/recomendacion/MacroAllocation.tsx
git commit -m "feat: MacroAllocation component — asset allocation vs model bars"
```

---

### Task 9: SectorBreakdown component

**Files:**
- Create: `components/recomendacion/SectorBreakdown.tsx`

- [ ] **Step 1: Create the component**

```typescript
// components/recomendacion/SectorBreakdown.tsx
"use client";

import React from "react";

interface SectorItem {
  sector: string;
  sleeveId: string | null;
  actualPct: number;
  sleevePct: number | null;
  deltaPp: number;
  sleeveVista: "OW" | "UW" | "N" | null;
  sleeveConviction: "ALTA" | "MEDIA" | "BAJA" | null;
  holdings: Array<{
    fundName: string;
    ticker: string;
    marketValueUSD: number;
    weightInSector: number;
  }>;
}

interface Props {
  sectors: SectorItem[];
}

function vistaLabel(vista: string | null): { text: string; className: string } {
  switch (vista) {
    case "OW": return { text: "Overweight", className: "text-green-700 bg-green-100" };
    case "UW": return { text: "Underweight", className: "text-red-700 bg-red-100" };
    case "N": return { text: "Neutral", className: "text-slate-600 bg-slate-100" };
    default: return { text: "—", className: "text-slate-400 bg-slate-50" };
  }
}

function deltaColor(delta: number): string {
  if (Math.abs(delta) <= 3) return "text-green-600";
  if (Math.abs(delta) <= 10) return "text-amber-600";
  return "text-red-600";
}

export default function SectorBreakdown({ sectors }: Props) {
  return (
    <div className="bg-white rounded-lg border border-gb-border shadow-sm mb-6">
      <div className="px-6 py-4 border-b border-gb-border">
        <h2 className="text-base font-semibold text-gb-black">
          Desglose Sectorial — Renta Variable
        </h2>
        <p className="text-xs text-gb-gray mt-0.5">
          Normalizado al 100% de la exposicion en RV
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-gb-border">
              <th className="text-left px-6 py-2 font-medium text-gb-gray">Sector</th>
              <th className="text-right px-4 py-2 font-medium text-gb-gray">Actual</th>
              <th className="text-right px-4 py-2 font-medium text-gb-gray">Sleeve</th>
              <th className="text-right px-4 py-2 font-medium text-gb-gray">Delta</th>
              <th className="text-center px-4 py-2 font-medium text-gb-gray">Vista</th>
              <th className="text-center px-4 py-2 font-medium text-gb-gray">Conviction</th>
            </tr>
          </thead>
          <tbody>
            {sectors.map((s) => {
              const vista = vistaLabel(s.sleeveVista);
              return (
                <tr key={s.sector} className="border-b border-gb-border last:border-0 hover:bg-slate-50">
                  <td className="px-6 py-3">
                    <span className="font-medium text-gb-black">{s.sector}</span>
                    <span className="text-xs text-gb-gray ml-2">
                      ({s.holdings.length} posicion{s.holdings.length !== 1 ? "es" : ""})
                    </span>
                  </td>
                  <td className="text-right px-4 py-3 font-mono text-gb-black">
                    {s.actualPct.toFixed(1)}%
                  </td>
                  <td className="text-right px-4 py-3 font-mono text-gb-gray">
                    {s.sleevePct != null ? `${s.sleevePct.toFixed(1)}%` : "—"}
                  </td>
                  <td className={`text-right px-4 py-3 font-mono font-medium ${deltaColor(s.deltaPp)}`}>
                    {s.sleevePct != null
                      ? `${s.deltaPp > 0 ? "+" : ""}${s.deltaPp.toFixed(1)}pp`
                      : "—"}
                  </td>
                  <td className="text-center px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${vista.className}`}>
                      {vista.text}
                    </span>
                  </td>
                  <td className="text-center px-4 py-3 text-xs text-gb-gray">
                    {s.sleeveConviction || "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/recomendacion/SectorBreakdown.tsx
git commit -m "feat: SectorBreakdown component — RV sector vs sleeve table"
```

---

### Task 10: HoldingsTable component

**Files:**
- Create: `components/recomendacion/HoldingsTable.tsx`

- [ ] **Step 1: Create the component**

```typescript
// components/recomendacion/HoldingsTable.tsx
"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface CategoryData {
  categoria: string;
  categoriaLabel: string;
  role: "rv" | "rf" | "alt" | "cash";
  targetPct: number;
  actualPct: number;
  deltaPp: number;
  currentHoldings: Array<{
    fundName: string;
    securityId: string | null;
    marketValueCLP: number;
    weightPct: number;
    custodian: string;
    custodianType: string;
    classificationConfidence: "high" | "medium" | "low";
  }>;
}

interface SectorItem {
  sector: string;
  holdings: Array<{
    fundName: string;
    ticker: string;
    marketValueUSD: number;
    weightInSector: number;
  }>;
}

interface StockProfile {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  marketCap: number;
  country: string;
}

interface Props {
  categories: CategoryData[];
  stockProfiles: Record<string, StockProfile>;
  sectorBreakdown: SectorItem[];
}

function confidenceBadge(c: string) {
  switch (c) {
    case "high": return <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700">Alta</span>;
    case "medium": return <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">Media</span>;
    default: return <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700">Baja</span>;
  }
}

function formatCLP(value: number): string {
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

export default function HoldingsTable({ categories, stockProfiles, sectorBreakdown }: Props) {
  const [expandedSectors, setExpandedSectors] = useState<Set<string>>(new Set());

  const toggleSector = (sector: string) => {
    setExpandedSectors((prev) => {
      const next = new Set(prev);
      if (next.has(sector)) next.delete(sector);
      else next.add(sector);
      return next;
    });
  };

  // Group holdings by sector using stockProfiles
  const allHoldings = categories.flatMap((c) =>
    c.currentHoldings.map((h) => ({
      ...h,
      categoryLabel: c.categoriaLabel,
      role: c.role,
    }))
  );

  const bySector = new Map<string, typeof allHoldings>();
  for (const h of allHoldings) {
    const sid = h.securityId?.toUpperCase() || "";
    const profile = stockProfiles[sid];
    const sector = profile?.sector || h.categoryLabel;
    if (!bySector.has(sector)) bySector.set(sector, []);
    bySector.get(sector)!.push(h);
  }

  // Sort sectors by total value
  const sortedSectors = Array.from(bySector.entries())
    .map(([sector, holdings]) => ({
      sector,
      holdings: holdings.sort((a, b) => b.marketValueCLP - a.marketValueCLP),
      totalValue: holdings.reduce((s, h) => s + h.marketValueCLP, 0),
    }))
    .sort((a, b) => b.totalValue - a.totalValue);

  return (
    <div className="bg-white rounded-lg border border-gb-border shadow-sm mb-6">
      <div className="px-6 py-4 border-b border-gb-border">
        <h2 className="text-base font-semibold text-gb-black">
          Posiciones por Sector
        </h2>
      </div>
      <div className="divide-y divide-gb-border">
        {sortedSectors.map(({ sector, holdings, totalValue }) => {
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
                  <span className="text-sm font-medium text-gb-black">{sector}</span>
                  <span className="text-xs text-gb-gray">
                    ({holdings.length} posicion{holdings.length !== 1 ? "es" : ""})
                  </span>
                </div>
                <span className="text-sm font-mono text-gb-black">
                  {formatCLP(totalValue)}
                </span>
              </button>

              {isExpanded && (
                <div className="px-6 pb-3">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gb-gray">
                        <th className="text-left py-1 font-medium">Ticker</th>
                        <th className="text-left py-1 font-medium">Nombre</th>
                        <th className="text-right py-1 font-medium">Valor CLP</th>
                        <th className="text-right py-1 font-medium">Peso</th>
                        <th className="text-center py-1 font-medium">Confianza</th>
                        <th className="text-left py-1 font-medium">Custodio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {holdings.map((h, i) => (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="py-2 font-mono text-gb-black">
                            {h.securityId || "—"}
                          </td>
                          <td className="py-2 text-gb-black truncate max-w-[200px]">
                            {h.fundName}
                          </td>
                          <td className="py-2 text-right font-mono">
                            {formatCLP(h.marketValueCLP)}
                          </td>
                          <td className="py-2 text-right font-mono">
                            {h.weightPct.toFixed(1)}%
                          </td>
                          <td className="py-2 text-center">
                            {confidenceBadge(h.classificationConfidence)}
                          </td>
                          <td className="py-2 text-gb-gray text-xs">
                            {h.custodian}
                          </td>
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

- [ ] **Step 2: Commit**

```bash
git add components/recomendacion/HoldingsTable.tsx
git commit -m "feat: HoldingsTable component — positions grouped by sector"
```

---

### Task 11: TradeSuggestions component

**Files:**
- Create: `components/recomendacion/TradeSuggestions.tsx`

- [ ] **Step 1: Create the component**

```typescript
// components/recomendacion/TradeSuggestions.tsx
"use client";

import React from "react";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";

interface Suggestion {
  action: "REDUCIR" | "AGREGAR" | "MANTENER";
  reason: string;
  holdings?: string[];
  amountUSD?: number;
  instrument?: string;
  instrumentTicker?: string;
  priority: "alta" | "media" | "baja";
}

interface Props {
  suggestions: Suggestion[];
}

const ACTION_CONFIG = {
  REDUCIR: { icon: TrendingDown, color: "border-red-200 bg-red-50", iconColor: "text-red-600", label: "Reducir" },
  AGREGAR: { icon: TrendingUp, color: "border-green-200 bg-green-50", iconColor: "text-green-600", label: "Agregar" },
  MANTENER: { icon: Minus, color: "border-slate-200 bg-slate-50", iconColor: "text-slate-500", label: "Mantener" },
};

const PRIORITY_BADGE = {
  alta: "bg-red-100 text-red-700",
  media: "bg-amber-100 text-amber-700",
  baja: "bg-slate-100 text-slate-600",
};

export default function TradeSuggestions({ suggestions }: Props) {
  return (
    <div className="bg-white rounded-lg border border-gb-border shadow-sm mb-6">
      <div className="px-6 py-4 border-b border-gb-border">
        <h2 className="text-base font-semibold text-gb-black">
          Sugerencias de Ajuste
        </h2>
        <p className="text-xs text-gb-gray mt-0.5">
          Basadas en desviaciones vs modelo y vistas del comite
        </p>
      </div>
      <div className="p-4 space-y-3">
        {suggestions.map((s, i) => {
          const config = ACTION_CONFIG[s.action];
          const Icon = config.icon;
          return (
            <div
              key={i}
              className={`rounded-lg border p-4 ${config.color}`}
            >
              <div className="flex items-start gap-3">
                <Icon className={`w-5 h-5 mt-0.5 ${config.iconColor}`} />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-gb-black">
                      {config.label}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_BADGE[s.priority]}`}>
                      {s.priority}
                    </span>
                  </div>
                  <p className="text-sm text-gb-black/80">{s.reason}</p>
                  {s.holdings && s.holdings.length > 0 && (
                    <p className="text-xs text-gb-gray mt-1">
                      Posiciones: {s.holdings.join(", ")}
                    </p>
                  )}
                  {s.instrument && (
                    <p className="text-xs text-gb-gray mt-1">
                      Instrumento sugerido: <span className="font-medium">{s.instrument}</span>
                      {s.instrumentTicker && ` (${s.instrumentTicker})`}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/recomendacion/TradeSuggestions.tsx
git commit -m "feat: TradeSuggestions component — actionable trade cards"
```

---

### Task 12: Sidebar + Seguimiento navigation links

**Files:**
- Modify: `components/shared/AdvisorSidebar.tsx`
- Modify: `components/seguimiento/SeguimientoPage.tsx`

- [ ] **Step 1: Add Radiografia to sidebar**

In `components/shared/AdvisorSidebar.tsx`, find the `NAV_ITEMS` array (should have items like Dashboard, Clientes, etc.) and add after the Seguimiento entry:

```typescript
{ label: "Radiografia", href: "/recomendacion", icon: Scale },
```

Also add `Scale` to the lucide-react import at the top of the file.

- [ ] **Step 2: Add link from SeguimientoPage**

In `components/seguimiento/SeguimientoPage.tsx`, find the header area (near the client name/profile display) and add a Link to the radiografia. Add after the "Actualizar" button or similar controls:

```typescript
<Link
  href={`/recomendacion/${clientId}`}
  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gb-border rounded-md hover:bg-slate-50 transition-colors"
>
  <Scale className="w-3.5 h-3.5" />
  Ver Radiografia
</Link>
```

Ensure `Scale` is imported from lucide-react and `Link` from next/link.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep -i "sidebar\|seguimiento" | head -10`
Expected: No new errors from these files

- [ ] **Step 4: Commit**

```bash
git add components/shared/AdvisorSidebar.tsx components/seguimiento/SeguimientoPage.tsx
git commit -m "feat: add Radiografia to sidebar + link from Seguimiento"
```

---

### Task 13: Integration test — full flow

**Files:**
- None (manual test)

- [ ] **Step 1: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: Only pre-existing errors (rate-limit.test.ts), no new errors

- [ ] **Step 2: Run existing tests**

Run: `npx vitest run`
Expected: All existing tests pass + new sector-mapping and stock-profiles tests pass

- [ ] **Step 3: Manual browser test**

1. Open `http://localhost:3000/recomendacion`
2. Select Toledo from ClientSelector
3. Verify:
   - MacroAllocation bars show (likely ~100% RV, 0% RF/Alt/Cash)
   - SectorBreakdown table shows sectors from Toledo's stocks
   - HoldingsTable shows all positions grouped by sector (expandable)
   - TradeSuggestions shows at least macro-level suggestion (add RF/Alt)
   - Sidebar has "Radiografia" link
   - Seguimiento has "Ver Radiografia" button

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete radiografia/recomendacion page with sector analysis"
```
