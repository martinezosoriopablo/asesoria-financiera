# Instrument Taxonomy & Return Engines — Design Spec

## Goal

Classify financial instruments correctly by what they ARE (instrument type) vs what they INVEST IN (asset class), and apply the right return calculation engine to each type. Eliminates the current bug where fixed income funds get treated as bonds (with devengo calculations that don't apply to them).

## Context

The platform tracks portfolios from two custodian types:

- **Internacional** (Stonex, Pershing): bonds, stocks, ETFs, mutual funds, commodities (via ETFs), cash
- **Local** (Chilean brokers): stocks (including international like AAPL via local exchange), FM, FI, ETFs, bonds, cash

Current code uses `assetType` and `assetClass` inconsistently. The `inferAssetType` function classifies anything with `assetClass: "fixedIncome"` as a bond, which is wrong — a fixed income mutual fund is NOT a bond.

## Taxonomy: Two Independent Dimensions

### Dimension 1: `instrumentType` — what the instrument IS

Determines which return calculation engine to use.

| Type | Description | Examples |
|------|-------------|---------|
| `bond` | Direct fixed income instrument with coupon and maturity | Corporate bond (Blackstone 5.29% 2027), sovereign bond |
| `stock` | Direct equity position | AAPL, Falabella, SQM |
| `etf` | Exchange-traded fund (any underlying) | VOO (equity), AGG (fixed income), GLD (commodity) |
| `fund` | Mutual fund (FM) or Fondo de Inversion (FI) | BTG Renta Fija, Fintual Risky Norris |
| `cash` | Money market, deposits, cash equivalents | Stonex cash sweep, deposito a plazo |

### Dimension 2: `assetClass` — what it invests in

For allocation reporting and portfolio composition charts. Does NOT affect return calculation.

| Class | Examples |
|-------|---------|
| `equity` | AAPL stock, VOO ETF, FM de RV |
| `fixedIncome` | Goldman bond, AGG ETF, FM de RF |
| `balanced` | Multi-asset FM, allocation ETF |
| `alternatives` | GLD ETF, FM inmobiliario |
| `cash` | Money market, efectivo |

### Key Rule

**`instrumentType` drives the return engine. `assetClass` is for reporting only.**

A fixed income ETF (AGG) uses the ETF engine (price + distributions), NOT the bond engine. A RF mutual fund uses the fund engine (NAV change + distributions), NOT devengo.

## Return Engines by Instrument Type

### Engine 1: Bond — Devengo + Market Deviation

Applies to: `instrumentType === "bond"` only.

**Inputs required:** purchase price (% of par), purchase date, coupon rate, maturity date, face value, current market price.

**Calculation:**

```
costBasis = faceValue * purchasePrice / 100
purchaseYTM = solve_ytm(purchasePrice, couponRate, maturity, purchaseDate)

// Devengo: theoretical return accrued since purchase
devengoUSD = purchaseYTM * costBasis * days30_360(purchaseDate, endDate) / 360
devengoPct = devengoUSD / costBasis * 100

// Market deviation: actual market value vs theoretical value
theoreticalValue = costBasis + devengoUSD
marketValue = faceValue * currentPrice / 100
marketDeviationUSD = marketValue - theoreticalValue

// Total return
totalReturnUSD = devengoUSD + marketDeviationUSD
totalReturnPct = totalReturnUSD / costBasis * 100
```

**No coupon summation.** The devengo based on purchase YTM already captures coupon income + pull-to-par. Adding coupon payments would double-count. The price drops at coupon cut ("corte de cupon") but devengo continues accruing linearly from purchase price, so there's no discontinuity.

**Output fields:**
- `devengoUSD` / `devengoPct` — theoretical accrued return
- `marketDeviationUSD` — how much better/worse vs YTM expectation
- `totalReturnUSD` / `totalReturnPct` — actual total return

### Engine 2: Price + Distributions (Stock, ETF, Fund)

Applies to: `instrumentType` in `["stock", "etf", "fund"]`.

**Calculation:**

```
priceReturn = (currentPrice / purchasePrice - 1) * 100
distributionYield = dividendsPaid / costBasis * 100  (if any)
totalReturn = priceReturn + distributionYield
```

All three types (stock, ETF, fund) use the same engine. The difference is:
- **Stocks**: dividends come from corporate actions
- **ETFs**: distributions (dividends, capital gains, return of capital)
- **Funds (FM/FI)**: distributions/dividends (some FM/FI distribute, most don't)

For FM/FI where everything is in the NAV (no distributions), `distributionYield = 0` and total return = price return.

**Price sources by type:**
- `fund` with RUN (numeric securityId): CMF / Fintual API
- `etf` / `stock`: Yahoo Finance
- Bonds: FINRA TRACE (current logic stays)

### Engine 3: Cash

Applies to: `instrumentType === "cash"`.

Returns 0 (or minimal). No calculation needed. Shows market value only.

## Detection Logic: `inferInstrumentType`

Replaces current `inferAssetType`. Priority order:

1. **Explicit `instrumentType`** from cartola/snapshot → use as-is
2. **Bond markers**: has `couponRate > 0` AND `maturityDate` AND (`securityId` looks like CUSIP — 9 chars alphanumeric) → `bond`
3. **RUN-based**: `securityId` is purely numeric → `fund` (Chilean FM/FI)
4. **Ticker-based**: `securityId` matches known ETF patterns or ETF database → `etf`
5. **Ticker-based**: `securityId` is non-numeric ticker → `stock`
6. **Name-based fallback**: use `classifyFund(fundName)` to guess, default to `fund`
7. **Cash markers**: name contains money market / cash / efectivo → `cash`

Note: This function infers `instrumentType`, NOT `assetClass`. The `assetClass` continues to be inferred from fund name or set from DB (familia_estudios).

## Changes to Existing Code

### `lib/bonds/period-return.ts`

Refactor `calcBondPeriodReturn` to use the devengo-only model:
- Remove `couponsPaid` and `couponDates` from output
- Remove `accruedInterest` (coupon-based accrual) — replaced by `devengoUSD` (YTM-based)
- Add `marketDeviationUSD` field
- Keep `accruedYieldPct` → rename to `devengoPct`

### `components/seguimiento/HoldingReturnsPanel.tsx`

- Rename `inferAssetType` → `inferInstrumentType` with updated logic
- **Critical fix**: Remove the condition that routes `assetClass: "fixedIncome"` to bond engine. Only `instrumentType === "bond"` goes to bond engine.
- ETFs and funds with `assetClass: "fixedIncome"` go through Engine 2 (price + distributions), same as equity ETFs/funds.
- All non-bond, non-cash instruments go to EquitySection (rename to be more generic, or split into FundsSection / DirectSection).

### `components/seguimiento/FixedIncomeSection.tsx`

- Remove "Cupones" column (no longer tracked separately)
- Rename "Devengo" to show devengo based on TIR
- Add "Desv. Mercado" column (market deviation)
- Only receives `instrumentType === "bond"` holdings

### `components/seguimiento/EquitySection.tsx`

- Already works for stock/etf/fund — no major changes
- TYPE_BADGE already has fund/etf/stock
- Verify dividends column works for all three types

### `components/seguimiento/ReviewSnapshotModal.tsx`

- Update `assetTypeToClass` to use new `instrumentType` values
- The `classifyFund` function stays (it infers `assetClass`, not `instrumentType`)
- Ensure the "F. Compra" date picker only shows for `instrumentType === "bond"`, not for `assetClass === "fixedIncome"`

### Field naming

Rename `assetType` → `instrumentType` across the codebase. This is a breaking change for existing snapshot JSON, so:
- Read both `instrumentType` and `assetType` (backward compat)
- Write `instrumentType` going forward
- `inferInstrumentType` checks both fields

## What Does NOT Change

- `assetClass` dimension — stays exactly as is, used for allocation charts
- Bond price fetching from FINRA — stays
- Fund price fetching from CMF/Fintual — stays
- Stock/ETF price fetching from Yahoo — stays
- `purchaseDate` field we just added — stays, used by bond engine
- Exchange rate handling — stays

## Testing

- Unit tests for `inferInstrumentType` with each case (bond, fund, etf, stock, cash, ambiguous)
- Unit test for refactored `calcBondPeriodReturn` with devengo-only model
- Verify: FM with `assetClass: "fixedIncome"` does NOT get devengo calculation
- Verify: ETF with `assetClass: "fixedIncome"` (e.g., AGG) gets price + distribution engine
- Verify: Direct bond with CUSIP still gets full bond engine
