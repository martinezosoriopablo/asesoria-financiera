# Radiografia & Recomendacion — Design Spec

## Goal

New standalone page (`/recomendacion`) that classifies a client's current holdings, compares them against the comite's model portfolio, and generates actionable trade suggestions. Two-level analysis: macro asset allocation (RV/RF/Alt/Cash) and micro sectoral breakdown (normalized within RV). For international-only clients, focus on fundamentals and comite views — no tax analysis by default.

## Context & Existing Infrastructure

### Already implemented (backend)
- **16 comite categories** in `lib/comite-categories.ts` with `classifyHolding()` function + tests
- **Radiografia API** at `POST /api/portfolio/radiografia` — classifies holdings, compares vs model, generates trades
- **Model portfolios** in `model_portfolios` table (production) with `posiciones` (JSONB) and `sleeves` (JSONB)
- **Fund mapping** via `model_fund_mapping` table + auto-suggest API
- **Comite upload** via `POST /api/comite/upload-report` (JSON upload, already functional)
- **Custodian tracking** in `portfolio_snapshots` (custodian, custodian_type columns)
- **Unified price service** in `lib/prices/` with AlphaVantage (premium, 75 calls/min) and Yahoo

### Not yet implemented
- **Radiografia UI component** — no frontend exists
- **Stock sector classification** — individual stocks (AAPL, MSFT) need sector data from AlphaVantage OVERVIEW
- **stock_profiles table** — cache for sector/industry/marketCap per ticker
- **Sector-to-sleeve mapping** — connecting AV sectors to comite sleeves

## Architecture

### Page structure

```
/recomendacion                    → ClientSelector + redirect to /recomendacion/[clientId]
/recomendacion/[clientId]         → Full radiografia page
```

Both under `app/(advisor-shell)/` route group (sidebar layout).

### Navigation
- **Sidebar**: New item "Radiografia" in Principal section (between "Seguimiento" and "Portfolio Designer")
- **From Seguimiento**: Button/link "Ver Radiografia" in SeguimientoPage header area

### Data flow

```
1. Load client + latest snapshot(s) per custodian
2. For each holding:
   a. ETFs/funds → classifyHolding() (existing, high confidence)
   b. Individual stocks → fetch sector from stock_profiles cache
      - Cache miss → AV OVERVIEW → store in stock_profiles → classify
   c. Map stock sector to comite sleeve
3. Load model portfolio for client's mapped risk profile
4. Compare actual vs model:
   a. Macro: RV/RF/Alt/Cash allocation
   b. Micro: Sector breakdown within RV (normalized to 100%)
5. Generate trade suggestions based on deviations + comite views
```

## Components

### 1. stock_profiles table (new)

```sql
CREATE TABLE stock_profiles (
  ticker TEXT PRIMARY KEY,
  name TEXT,
  sector TEXT,              -- "Technology", "Healthcare", etc.
  industry TEXT,            -- "Consumer Electronics", "Drug Manufacturers", etc.
  market_cap BIGINT,
  country TEXT,             -- "US", "BR", etc.
  exchange TEXT,            -- "NYSE", "NASDAQ", etc.
  fetched_at TIMESTAMPTZ DEFAULT now()
);
```

Cache with 30-day TTL. No RLS needed (reference data, not client data).

### 2. Sector-to-sleeve mapping

Static mapping in `lib/sector-mapping.ts`:

```typescript
// AV OVERVIEW sector → comite sleeve region+sector
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
  "Real Estate": "us_reits",        // maps to alt_reits category
  "Basic Materials": "us_materials",
};
```

For non-US stocks: detect country from AV OVERVIEW → map to rv_desarrollados_ex_us or rv_emergentes.

### 3. API: GET /api/stock-profiles?tickers=AAPL,MSFT,GOOGL

New endpoint that:
1. Checks `stock_profiles` for cached data (< 30 days old)
2. For cache misses, fetches AV OVERVIEW in parallel (premium = 75/min, no throttle concern)
3. Stores results in `stock_profiles`
4. Returns all profiles

Response:
```typescript
{
  profiles: Array<{
    ticker: string;
    name: string;
    sector: string;
    industry: string;
    marketCap: number;
    country: string;
  }>;
  fetchedCount: number;  // how many were fetched fresh vs cached
}
```

### 4. Enhanced radiografia API

Extend existing `POST /api/portfolio/radiografia` to include:
- Stock sector data (from stock_profiles)
- Sector-level aggregation within RV
- Sleeve comparison (actual sector weights vs comite sleeve views)
- Trade suggestions with specific instruments and amounts

New fields in response:
```typescript
interface RadiografiaResult {
  // ... existing fields ...

  sectorBreakdown: Array<{
    sector: string;           // "Technology", "Healthcare"
    sleeveId: string | null;  // "us_tech", "us_healthcare"
    actualPct: number;        // normalized within RV
    sleevePct: number | null; // from comite sleeves (if available)
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
    reason: string;           // "Tech sobreponderado +10pp vs sleeve OW 25%"
    holdings?: string[];      // specific tickers to reduce
    amountUSD?: number;       // approximate amount
    instrument?: string;      // ETF to buy (from comite)
    instrumentTicker?: string;
    priority: "alta" | "media" | "baja";
  }>;

  taxAnalysisEnabled: boolean; // false by default for internacional
}
```

### 5. Page UI: RecomendacionPage

File: `components/recomendacion/RecomendacionPage.tsx`

Sections top to bottom:

#### 5a. Header
- Client name, risk profile badge, mapped model profile
- Date of latest snapshot(s)
- Button "Actualizar Radiografia" (re-fetch)

#### 5b. Asset Allocation Macro (Level 1)
- 4 horizontal stacked bars or side-by-side comparison:
  - RV: actual% vs model%
  - RF: actual% vs model%
  - Alt: actual% vs model%
  - Cash: actual% vs model%
- Color coding: green (within +/-3pp), amber (3-10pp), red (>10pp)
- Brief text: "Tu cartera esta concentrada en Renta Variable. El modelo sugiere diversificar hacia RF y Alternativos."

#### 5c. Sector Breakdown RV (Level 2)
- Normalized to 100% of RV allocation
- Table with horizontal bars:
  - Sector | Peso actual | Peso sleeve | Delta | Vista | Conviction
- Sorted by absolute delta (biggest deviations first)
- Color per vista: green=OW aligned, red=UW overweight, amber=neutral deviation

#### 5d. Holdings Table
- All positions grouped by sector
- Columns: Ticker | Nombre | Sector | Peso% | Valor USD | Vista comite
- Expandable sector groups
- Badge per holding: "Alineado" / "Revisar"

#### 5e. Trade Suggestions
- Cards with priority ordering (alta first)
- Each card: action icon + description + amount + instrument
- Example: "REDUCIR posicion en Technology (-$15,000) — Sector sobreponderado +12pp. Considerar redirigir a XLV (Healthcare, vista OW alta conviction)"
- For internacional clients: instruments are comite ETFs (etf_us column)

#### 5f. Tax Toggle (hidden by default for internacional)
- Toggle: "Incluir analisis tributario"
- When enabled: shows tax impact per suggested trade (Art 107/108, ganancia/perdida)
- Default OFF for custodian_type === "internacional"

### 6. Sidebar update

Add "Radiografia" item to AdvisorSidebar between "Seguimiento" and "Portfolio Designer":
```typescript
{ label: "Radiografia", href: "/recomendacion", icon: Scale }
```

### 7. Link from Seguimiento

Add button in SeguimientoPage header (near period buttons):
```typescript
<Link href={`/recomendacion/${clientId}`} className="...">
  <Scale className="w-4 h-4" />
  Ver Radiografia
</Link>
```

## Specialized Agent

The radiografia feature will be built using a specialized recommendation agent that:
- Understands the comite's investment thesis and category system
- Can classify any holding to the correct category/sector
- Generates contextual trade suggestions based on comite views
- Adapts recommendations based on client type (AGF/corredora/internacional)

Agent skills to create or leverage:
- Classification engine (extend existing `classifyHolding`)
- Sector enrichment (AV OVERVIEW integration)
- Trade generation logic (deviation thresholds + comite views)
- Recommendation formatting (human-readable, actionable)

## Constraints

- **No tax analysis by default** for clients with custodian_type "internacional" unless advisor explicitly enables it
- **Stock sectors cached** in `stock_profiles` table, refreshed every 30 days
- **AlphaVantage premium** — no rate limit concerns (75 calls/min)
- **Sleeves are optional** — if comite hasn't published sleeve data for a sector, show "Sin vista del comite" instead of hiding the row
- **Minimum data requirement** — needs at least 1 snapshot with holdings to generate radiografia
- **international_prices uses `ticker` column** (not `symbol`) — maintain consistency in any new queries

## Out of Scope

- Automated rebalancing execution (advisor copies suggestions manually)
- PDF export of radiografia (future)
- Historical radiografia comparison (future — "como cambio mi radiografia mes a mes")
- Client portal view of radiografia (advisor-only for now)
