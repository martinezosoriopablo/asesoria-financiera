# Comite -> Radiografia Pipeline Design

**Date:** 2026-05-26
**Status:** Approved

## Problem

The investment committee delivers actionable portfolio models per risk profile with specific ETFs, weights, and justifications. But there's no pipeline to:
1. Store the rich comite data in the DB
2. Map client holdings to comite categories
3. Compare actual vs model allocation
4. Generate recommendations that respect custodian constraints (AGF vs Corredora vs Internacional)

## Design Decisions (confirmed with user)

| Decision | Choice |
|----------|--------|
| Profiles | 5 profiles matching comite: conservador, moderado_conservador, moderado, moderado_agresivo, agresivo |
| Posiciones schema | Rich fields + separate sleeves JSONB column |
| Fund mapping | Auto-suggest first time, advisor confirms, then reuse |
| Multi-custodian | Consolidated recommendation respecting per-custodian constraints |
| HTML parsing | Not needed -- comite script already produces structured JSON |
| Custodian on snapshot | Add `custodian` + `custodian_type` to `portfolio_snapshots` |
| Local categories | Add "RF Chile" to comite categories (RV Chile already exists) |

---

## 1. Enriched Model Portfolios Schema

### 1.1 Migration: Update `model_portfolios` table

**Profile CHECK constraint** changes from:
```
ultra_conservador, conservador, moderado, crecimiento, agresivo, muy_agresivo
```
To:
```
conservador, moderado_conservador, moderado, moderado_agresivo, agresivo
```

**New column:** `sleeves JSONB DEFAULT '[]'::jsonb`

**Updated `posiciones` JSONB** per-element schema:
```typescript
interface ModelPosition {
  categoria: string;          // "RV USA Large Cap", "UST 3-10yr Belly", "RF Chile", etc.
  role: "rv" | "rf" | "alt" | "cash";
  bench_pct: number;          // benchmark weight %
  modelo_pct: number;         // model weight %
  broad_neto_pct: number | null; // broad ETF weight after sleeve subtraction (null if no sleeves)
  delta_pp: number;           // deviation from benchmark in pp
  vista: "OW" | "UW" | "N";  // overweight / underweight / neutral
  conviction: "ALTA" | "MEDIA" | "BAJA" | null;
  etf_us: string | null;      // US-listed ETF ticker (VOO, IEF, GLD...)
  etf_ucits: string | null;   // UCITS ETF ticker (CSPX, IDTM, SGLN...)
  justificacion: string | null;
}
```

**Sleeves JSONB** per-element schema:
```typescript
interface ModelSleeve {
  region: string;              // "US", "EU"
  sector: string;              // "US Information Technology", "STOXX Europe 600 Basic Resources"
  vista: "OW" | "UW" | "N";
  conviction: "ALTA" | "MEDIA" | "BAJA";
  etf_us: string | null;      // XLK, XLB, etc.
  etf_ucits: string | null;   // IUIT, IUMS, etc.
  peso_pct: number;            // sleeve weight within parent region
  tesis: string | null;
}
```

### 1.2 Client Profile Mapping

| Client risk_profile | Model perfil |
|---------------------|-------------|
| defensivo | conservador |
| conservador | conservador |
| moderado | moderado |
| agresivo | moderado_agresivo |
| muy_agresivo | agresivo |

Note: `moderado_conservador` has no direct client mapping -- it's available for manual override by the advisor.

---

## 2. Custodian on Snapshots

### 2.1 Migration: Add columns to `portfolio_snapshots`

```sql
ALTER TABLE portfolio_snapshots
  ADD COLUMN IF NOT EXISTS custodian TEXT,
  ADD COLUMN IF NOT EXISTS custodian_type TEXT
    CHECK (custodian_type IN ('agf', 'corredora', 'internacional'));
```

- `custodian`: free text, e.g. "BCI AGF", "Raymond James", "BCI Corredora"
- `custodian_type`: enum for constraint logic
- Both nullable (backward compatible with existing snapshots)

### 2.2 UI: AddSnapshotModal

Already has custodian selection with optgroups (agf/corredora/internacional). Just need to persist `custodian` and `custodian_type` when creating the snapshot.

---

## 3. Comite Categories

### 3.1 Canonical Category List

The comite uses these 14 international categories + 2 local categories:

**Renta Variable (RV):**
- `rv_usa_large_cap` -- RV USA Large Cap (S&P 500) -- ETF: VOO / CSPX
- `rv_desarrollados_ex_us` -- RV Desarrollados ex-US (Europa+Japon) -- ETF: VEA / IWDA
- `rv_emergentes` -- RV Emergentes (MSCI EM IMI) -- ETF: VWO / EIMI
- `rv_chile` -- RV Chile (home bias) -- ETF: ECH / --

**Renta Fija (RF):**
- `rf_ust_belly` -- UST 3-10yr Belly de curva -- ETF: IEF / IDTM
- `rf_ust_short` -- UST 1-3yr Short Duration -- ETF: SHY / IBTS
- `rf_ig_corp` -- US IG Corporate Bonds -- ETF: LQD / LQDE
- `rf_tips` -- US TIPS (inflation-linked) -- ETF: TIP / ITPS
- `rf_high_yield` -- US High Yield -- ETF: HYG / IHYG
- `rf_em_sovereign` -- EM Sovereign USD -- ETF: EMB / EMHC
- `rf_chile` -- RF Chile (deuda local CLP/UF) -- no comite ETF, maps to local funds

**Alternativos (Alt):**
- `alt_gold` -- Gold (hedge moderno + risk-off) -- ETF: GLD / SGLN
- `alt_reits` -- US REITs -- ETF: VNQ / IPRP

**Cash:**
- `cash_tbills` -- US T-Bills 0-3M -- ETF: SGOV / ERNS

### 3.2 Category Inference Rules

To classify a client holding to a comite category:

**Priority 1: Direct ETF/ticker match**
If the holding's `securityId` matches a known ETF from any category, map directly.
Example: holding with securityId "VOO" -> `rv_usa_large_cap`

**Priority 2: Chilean fund by familia_estudios**
For funds matched via `vw_fondos_completo`:
- `familia_estudios` containing "accionario" + "internacional" / "global" / "usa" -> `rv_usa_large_cap` or `rv_desarrollados_ex_us`
- `familia_estudios` containing "accionario" + "nacional" / "chile" -> `rv_chile`
- `familia_estudios` containing "deuda" + "corto plazo" / "money market" -> `rf_chile` (if CLP) or `cash_tbills` (if USD)
- `familia_estudios` containing "deuda" + "mediano" / "largo" -> `rf_chile` (if CLP) or `rf_ust_belly` (if USD)
- `familia_estudios` containing "balanceado" -> split proportionally or assign to nearest match

**Priority 3: Instrument type + geography**
- Bond with CUSIP -> `rf_ig_corp` (default) or refine by issuer/maturity
- Stock with US ticker -> `rv_usa_large_cap`
- Stock ending in "CL" (Chilean ADR) -> `rv_usa_large_cap` (same underlying)
- Cash / money market -> `cash_tbills` (USD) or `rf_chile` (CLP)

**Priority 4: assetClass fallback**
- `equity` -> `rv_usa_large_cap` (conservative default)
- `fixedIncome` -> `rf_ust_belly`
- `alternatives` -> `alt_gold`
- `cash` -> `cash_tbills`

Each classification gets a `confidence` score: `high` (direct match), `medium` (familia/type inference), `low` (fallback). Low-confidence classifications are flagged for advisor review.

---

## 4. Fund Mapping Flow (model_fund_mapping)

### 4.1 First-Time Mapping

When advisor opens radiografia for a client whose custodian hasn't been mapped:

1. System loads all comite categories from active `model_portfolios`
2. For each category, system searches `advisor_preferred_funds` filtered by `custodian_type`
3. Auto-suggest logic:
   - Match preferred fund's `category` field against comite category (lookup table)
   - If multiple matches: prefer lowest TAC, or most recently added
   - If no match: leave empty, flag for manual selection
4. Present mapping table to advisor for confirmation
5. On confirm: save to `model_fund_mapping`

### 4.2 Lookup Table: Comite Category -> Preferred Fund Category

| Comite Category | Preferred Fund Categories (any of) |
|----------------|-----------------------------------|
| rv_usa_large_cap | "RV Internacional", "RV USA", "RV Global" |
| rv_desarrollados_ex_us | "RV Internacional", "RV Europa", "RV Global" |
| rv_emergentes | "RV Emergentes", "RV Internacional" |
| rv_chile | "RV Nacional" |
| rf_ust_belly | "RF Internacional", "RF USD" |
| rf_ust_short | "RF Internacional", "RF Corto Plazo" |
| rf_ig_corp | "RF Internacional", "RF Corporativa" |
| rf_tips | "RF Internacional" |
| rf_high_yield | "RF High Yield", "RF Internacional" |
| rf_em_sovereign | "RF Emergentes", "RF Internacional" |
| rf_chile | "RF Nacional", "RF Corto Plazo" |
| alt_gold | "Alternativos", "Commodities" |
| alt_reits | "Alternativos", "Inmobiliario" |
| cash_tbills | "Money Market", "Liquidez" |

### 4.3 International Custodian Shortcut

For `custodian_type = "internacional"`: skip fund mapping entirely. Use the comite's `etf_us` (or `etf_ucits` if advisor preference) directly. No need to map through preferred funds.

---

## 5. Radiografia Pipeline (per client)

### 5.1 Input
- `client_id` -- to load snapshots and risk profile
- Snapshots loaded with `custodian` and `custodian_type` per snapshot

### 5.2 Process

```
1. Load latest snapshot(s) per custodian for client
   -> Consolidate into single holdings list, each tagged with custodian

2. Load client risk profile -> map to model perfil

3. Load active model_portfolios for that perfil
   -> posiciones[] + sleeves[]

4. Classify each holding to comite category
   -> Using rules from Section 3.2
   -> Flag low-confidence classifications

5. Aggregate: sum weight per category across all custodians
   -> Compare vs model target weights

6. For each deviation (actual vs model):
   a. If custodian = internacional -> recommend ETF directly from comite
   b. If custodian = agf/corredora -> look up model_fund_mapping
      - If mapping exists -> use it
      - If not -> auto-suggest and flag for confirmation

7. Generate recommendation:
   - Per-category: actual weight, target weight, delta, action (buy/sell/hold)
   - Per-custodian: which trades to execute where
   - Constraints: AGF holdings can only be moved within same AGF (Art. 108 traspaso)
   - Corredora: can buy from any AGF or trade ETFs on Bolsa de Santiago
   - Internacional: full ETF access

8. Output: structured JSON with deviations + proposed trades
```

### 5.3 Output Schema

```typescript
interface RadiografiaResult {
  clientId: string;
  perfilModelo: string;              // "moderado", etc.
  reportDate: string;                // comite report date
  totalValueCLP: number;

  // Per-category comparison
  categories: Array<{
    categoria: string;               // "rv_usa_large_cap"
    categoriaLabel: string;          // "RV USA Large Cap"
    role: "rv" | "rf" | "alt" | "cash";
    targetPct: number;               // model weight
    actualPct: number;               // client actual weight
    deltaPp: number;                 // actual - target
    estado: "SOBREPONDERADO" | "SUBPONDERADO" | "EN_RANGO";
    vista: "OW" | "UW" | "N";       // comite view
    conviction: string | null;

    // What the client currently holds in this category
    currentHoldings: Array<{
      fundName: string;
      securityId: string | null;
      marketValueCLP: number;
      weightPct: number;
      custodian: string;
      custodianType: string;
      classificationConfidence: "high" | "medium" | "low";
    }>;

    // What to buy/sell to reach target
    proposedAction: {
      direction: "buy" | "sell" | "hold";
      amountCLP: number;             // absolute amount to trade
      instrument: string;            // specific fund/ETF name
      ticker: string | null;         // ticker if applicable
      custodian: string;             // where to execute
      custodianType: string;
    } | null;
  }>;

  // Aggregated allocation
  allocation: {
    rv: { actual: number; target: number; delta: number };
    rf: { actual: number; target: number; delta: number };
    alt: { actual: number; target: number; delta: number };
    cash: { actual: number; target: number; delta: number };
  };

  // Flags for advisor attention
  flags: Array<{
    type: "low_confidence_classification" | "unmapped_custodian" | "no_preferred_fund" | "agf_constraint";
    holdingName: string;
    message: string;
  }>;

  // Sleeves (informational)
  sleeves: ModelSleeve[];
}
```

---

## 6. API Endpoints

### 6.1 Modified Endpoints

**`POST /api/comite/model-portfolios`**
- Update to accept enriched posiciones schema (Section 1.1)
- Add `sleeves` field per profile
- Update CHECK constraint for 5 profiles

**`POST /api/portfolio/snapshots`**
- Accept `custodian` and `custodian_type` fields
- Persist on snapshot row

### 6.2 New Endpoints

**`POST /api/portfolio/radiografia`**
- Input: `{ clientId, perfilOverride? }`
- Loads snapshots, classifies holdings, compares vs model, generates recommendations
- Returns `RadiografiaResult`

**`GET /api/comite/categories`**
- Returns canonical category list with labels and default ETFs
- Used by mapping UI and classification logic

**`POST /api/advisor/fund-mapping/auto-suggest`**
- Input: `{ custodianType }`
- Returns suggested mapping of comite categories to preferred funds
- Advisor confirms via existing `POST /api/advisor/fund-mapping`

---

## 7. UI Components

### 7.1 Radiografia View (new or replace existing)

**Location:** Used from client seguimiento page and standalone

**Sections:**
1. **Header:** Client name, risk profile, model date, total value
2. **Allocation donut:** Actual vs model side-by-side (RV/RF/Alt/Cash)
3. **Category table:** All 16 categories with actual%, target%, delta, estado badge, current holdings, proposed action
4. **Flags panel:** Low-confidence classifications, unmapped funds -- advisor can resolve inline
5. **Action summary:** Per-custodian trade list ("En BCI AGF: traspasar X a Y. En Raymond James: comprar VOO por $Z")

### 7.2 Fund Mapping Confirmation Modal

Shown on first use of a custodian type. Table with:
- Comite category | Auto-suggested fund | Confidence | Override dropdown

Advisor clicks "Confirmar" to save all mappings at once.

---

## 8. Migration Plan

### 8.1 DB Migrations (in order)

1. **Create `model_portfolios` table** (migration exists but not executed)
   - Modify CHECK constraint to 5 profiles before executing
   - Add `sleeves JSONB` column

2. **Add custodian columns to `portfolio_snapshots`**
   ```sql
   ALTER TABLE portfolio_snapshots
     ADD COLUMN IF NOT EXISTS custodian TEXT,
     ADD COLUMN IF NOT EXISTS custodian_type TEXT
       CHECK (custodian_type IN ('agf', 'corredora', 'internacional'));
   ```

3. **Create `comite_reports` table** (if upload route needs it)

4. **Ensure `custodian_config` and `model_fund_mapping` exist** (migration 20260523 may not be executed)

### 8.2 Comite Script Update

The comite script that generates the HTML should also emit a JSON file matching the `ModelPortfolioUpload` interface with enriched posiciones + sleeves. This JSON is uploaded via `POST /api/comite/model-portfolios`.

---

## 9. What This Design Does NOT Cover

- **Rebalancing execution:** This generates recommendations, not trade orders
- **Tax optimization:** Art. 108 traspaso rules are respected as constraints but not optimized
- **Historical tracking:** No versioned recommendations per client (could add later)
- **Client portal view:** Recommendations are advisor-facing only for now
- **Sleeves implementation detail:** Sleeves are shown as informational; the category-level weights already include sleeve effects via `broad_neto_pct`
