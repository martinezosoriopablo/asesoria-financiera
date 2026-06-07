# Component Refactoring Design

## Goal

Decompose 4 oversized components (SeguimientoPage, ClientDetail, ReviewSnapshotModal, HoldingReturnsPanel) into focused hooks and sub-components. Zero behavior change. Zero calculation change. Move code, don't modify it.

## Constraint

The user has confirmed all functionality works correctly. This refactoring must produce identical behavior. No new state patterns, no calculation "improvements," no logic changes. The diff for each component should read as "code moved to new files" — nothing more.

## Scope

| Component | Current lines | Target parent lines | New files |
|-----------|--------------|-------------------|-----------|
| SeguimientoPage | 2,106 | ~400 | 8 (4 hooks + 4 sub-components) |
| ClientDetail | 1,734 | ~350 | 6 (3 hooks + 3 sub-components) |
| ReviewSnapshotModal | 1,725 | ~350 | 5 (3 hooks + 2 sub-components) |
| HoldingReturnsPanel | 927 | ~200 | 4 (2 hooks + 2 sub-components) |

Total: ~23 new files created, 4 files significantly reduced.

---

## Component 1: SeguimientoPage (2,106 -> ~400 lines)

**Location:** `components/seguimiento/SeguimientoPage.tsx`

### Hooks

#### `hooks/useSeguimientoData.ts`
- **Owns:** snapshots, loading, error, clientId, xrayData, cartolaData
- **Does:** Fetches from `/api/clients/[id]/seguimiento`, `/api/portfolio/radiografia`, cartola-related endpoints
- **Returns:** `{ snapshots, loading, error, xrayData, cartolaData, refetch }`

#### `hooks/useHistoricalSeries.ts`
- **Owns:** historicalSeries, historicalLoading, period
- **Does:** Fetches `/api/portfolio/historical-prices` with holdings from latest snapshot. Manages period filter (1M/3M/6M/1Y/ALL)
- **Returns:** `{ historicalSeries, historicalLoading, period, setPeriod }`

#### `hooks/useExchangeRates.ts`
- **Owns:** exchangeRates (current), cartolaExchangeRates (at cartola date)
- **Does:** Fetches `/api/exchange-rates` for current rates. Derives cartola rates from deflator data using `findDeflatorValue` (UF) and `findDeflatorValueNext` (USD T+1)
- **Returns:** `{ exchangeRates, cartolaExchangeRates }`

#### `hooks/useBenchmarkConfig.ts`
- **Owns:** benchmarkConfig, benchmarkReturns, comparisonReturns
- **Does:** Fetches/saves `/api/benchmark/config`. Calculates benchmark return series from historical data
- **Returns:** `{ benchmarkConfig, setBenchmarkConfig, saveBenchmarkConfig, benchmarkReturns, comparisonReturns }`

### Sub-components

#### `CompositionBoxes.tsx`
- **Props:** holdingReturnsData, exchangeRates, cartolaExchangeRates, mode (desde inicio / desde fecha), selectedDate
- **Renders:** 4 boxes (RV, RF, Alternativos, Caja) with initial/final values and returns. Tab selector "Desde inicio / Desde fecha" with date picker
- **Lines:** ~150
- **Note:** Initial values derived as `marketValue * (purchasePrice / currentPrice)` per holding (NOT from snapshot stored class values)

#### `PerformanceAttribution.tsx`
- **Props:** holdingReturnsData, snapshots, totalInitialCLP
- **Renders:** Attribution table. Contribution = `(finalCLP - initialCLP) / portfolioInitialCLP * 100`. Sorted highest to lowest. All positions shown.
- **Lines:** ~200

#### `RentabilidadPorActivo.tsx`
- **Props:** holdingReturnsData, snapshots, clientId, exchangeRates
- **Renders:** Horizontal bars by holding for selected month. Month selector. Color by assetClass. Portfolio total bar.
- **Lines:** ~180

#### `RetornosComparados.tsx`
- **Props:** historicalSeries, snapshots, benchmarkReturns, comparisonReturns
- **Renders:** Grouped monthly bars (portfolio green, benchmark yellow, comparison red). Acumulado bar. Summary table below.
- **Lines:** ~200

### Parent orchestration

SeguimientoPage remains the orchestrator:
1. Calls the 4 hooks
2. Renders tab navigation (Seguimiento / Radiografia / etc.)
3. Passes hook data as props to sub-components
4. Handles modal open/close for ReviewSnapshotModal
5. Renders EvolucionChart, HoldingReturnsPanel, PortfolioBreakdownPies (existing components, unchanged)

---

## Component 2: ClientDetail (1,734 -> ~350 lines)

**Location:** `components/clients/ClientDetail.tsx`

### Hooks

#### `hooks/useClientData.ts`
- **Owns:** client, loading, error, editMode, editFields (nombre, apellido, email, telefono, etc.), saving
- **Does:** Fetches client by ID. Handles inline edit mode (toggle edit, save via PUT `/api/clients/[id]`, cancel). Manages estado selector (prospecto/activo/inactivo) with auto-save
- **Returns:** `{ client, loading, error, editMode, setEditMode, editFields, setEditFields, saveClient, updateEstado }`

#### `hooks/useClientModals.ts`
- **Owns:** 5 boolean states (showAddSnapshot, showRiskModal, showMeetingModal, showCartaCorredorModal, showDeleteConfirm), selectedSnapshot, selectedMeeting
- **Does:** Open/close modal handlers. Sets selected item before opening
- **Returns:** `{ modalStates, openModal, closeModal, selectedSnapshot, selectedMeeting }`

#### `hooks/useClientPortfolio.ts`
- **Owns:** snapshots, directPortfolio, preferredFunds, loadingPortfolio
- **Does:** Fetches snapshots, direct portfolio holdings, preferred funds for the client. Refetch after snapshot add/delete
- **Returns:** `{ snapshots, directPortfolio, preferredFunds, loadingPortfolio, refetchSnapshots }`

### Sub-components

#### `ClientInfoCard.tsx`
- **Props:** client, editMode, editFields, onToggleEdit, onSaveClient, onFieldChange, onUpdateEstado
- **Renders:** Header card with name, estado inline selector, risk profile badge, contact info, questionnaire due date, edit/save/cancel buttons
- **Lines:** ~200

#### `ClientSnapshotsSection.tsx`
- **Props:** snapshots, loading, onAddSnapshot, onDeleteSnapshot, onSelectSnapshot
- **Renders:** Snapshots list/table with date, custodian, total value. Add button. Delete confirm. Click to open ReviewSnapshotModal
- **Lines:** ~250

#### `ClientMeetingsSection.tsx`
- **Props:** meetings, onAddMeeting, onEditMeeting
- **Renders:** Meetings list with date, type, notes. Add meeting button
- **Lines:** ~150

### Parent orchestration

ClientDetail remains the orchestrator:
1. Calls the 3 hooks
2. Renders ClientInfoCard, ClientSnapshotsSection, ClientMeetingsSection
3. Renders modals (AddSnapshotModal, RiskModal, MeetingModal, CartaCorredorModal) — modals themselves are NOT refactored, just controlled by useClientModals
4. Handles navigation (tabs if any)

---

## Component 3: ReviewSnapshotModal (1,725 -> ~350 lines)

**Location:** `components/seguimiento/ReviewSnapshotModal.tsx`

### Hooks

#### `hooks/useSnapshotExchangeRates.ts`
- **Owns:** usdRate, ufRate, eurRate, ratesLoading
- **Does:** Fetches historical rates from BCCH (USD, UF) and mindicador.cl (EUR) for `fechaCartola`. Re-fetches when date changes. USD uses T+1 convention (observado del dia siguiente)
- **Returns:** `{ usdRate, ufRate, eurRate, ratesLoading }`

#### `hooks/useAutoMatch.ts`
- **Owns:** matchResults, matchLoading
- **Does:** Auto-matches parsed holding names to `fondos_mutuos` / `fondos_inversion` DB records by name + serie. Only runs on initial load (NOT in edit mode, to avoid overwriting user changes)
- **Returns:** `{ matchResults, matchLoading, runAutoMatch }`

#### `hooks/useSnapshotForm.ts`
- **Owns:** holdings (editable array), totals (computed), custodian, custodianType, fechaCartola
- **Does:** Manages the editable holdings list: add row, remove row, edit field (name, quantity, marketPrice, assetClass, currency, securityId). Computes totals (total value, per-class totals). Handles save (POST/PUT to snapshots API)
- **Returns:** `{ holdings, setHolding, addHolding, removeHolding, totals, custodian, setCustodian, fechaCartola, setFechaCartola, save, saving }`

### Sub-components

#### `HoldingsEditor.tsx`
- **Props:** holdings, onSetHolding, onAddHolding, onRemoveHolding, exchangeRates, matchResults
- **Renders:** Table with one row per holding. Each row: name (with auto-match indicator), quantity, price, market value, assetClass dropdown, currency dropdown, securityId. Add row button at bottom
- **Lines:** ~400

#### `SnapshotSummaryBar.tsx`
- **Props:** totals, fechaCartola, onDateChange, custodian, onCustodianChange, exchangeRates
- **Renders:** Top bar showing total value, date picker, custodian selector (with optgroups AGF/Corredora/Internacional), exchange rates display (TC: USD $XXX, UF $XX.XXX)
- **Lines:** ~100

### Parent orchestration

ReviewSnapshotModal remains the modal shell:
1. Calls the 3 hooks
2. Renders SnapshotSummaryBar at top
3. Renders HoldingsEditor as main content
4. Save/Cancel buttons in footer
5. Manages modal open/close lifecycle

---

## Component 4: HoldingReturnsPanel (927 -> ~200 lines)

**Location:** `components/seguimiento/HoldingReturnsPanel.tsx`

### Hooks

#### `hooks/useBondCalculations.ts`
- **Owns:** (all derived via useMemo — no useState)
- **Does:** The 13 useMemo pipeline for bonds: accrued interest calculation, modified duration, YTM, market value from price%, cost basis handling. Uses `costBasisPricePct` (always real) for MV/devengo/duration. Uses `purchasePricePct` (mode-dependent) only for return %
- **Input props:** bondHoldings, mode ("cartola" | "compra"), exchangeRates
- **Returns:** `{ processedBondHoldings, bondTotalValue, bondTotalReturn }`

#### `hooks/useHoldingQuotes.ts`
- **Owns:** quotes, quotesLoading
- **Does:** Fetches live quotes for CFI* fondos de inversion, stocks, ETFs via `/api/prices/quote`. Detects CLP currency to avoid double USD conversion
- **Returns:** `{ quotes, quotesLoading }`

### Sub-components

#### `NonBondHoldingsTable.tsx`
- **Props:** holdings (processed non-bond), mode, totalValue
- **Renders:** Table for funds/ETFs/stocks. Columns: name, quantity, price, market value, weight, return %. Weight = marketValue / totalValue
- **Lines:** ~200

#### `BondHoldingsTable.tsx`
- **Props:** holdings (processed bonds), mode, totalValue
- **Renders:** Table for bonds. Columns: name, coupon, maturity, price%, market value, accrued interest, duration, YTM, weight, return %
- **Lines:** ~200

### Parent orchestration

HoldingReturnsPanel remains the container:
1. Splits holdings into bond vs non-bond
2. Calls useBondCalculations for bond pipeline
3. Calls useHoldingQuotes for live quotes
4. Computes totalValue = nonBondTotal + bondTotal
5. Recalculates weights via `finalNonBondHoldings` and `finalBondHoldings` useMemos (weight = marketValue / totalValue)
6. Renders toggle pill "Desde Cartola / Desde Compra"
7. Renders total value bar
8. Renders NonBondHoldingsTable and BondHoldingsTable

---

## File structure summary

```
components/seguimiento/
  SeguimientoPage.tsx                    (refactored, ~400 lines)
  CompositionBoxes.tsx
  PerformanceAttribution.tsx
  RentabilidadPorActivo.tsx
  RetornosComparados.tsx
  ReviewSnapshotModal.tsx                (refactored, ~350 lines)
  HoldingsEditor.tsx
  SnapshotSummaryBar.tsx
  HoldingReturnsPanel.tsx                (refactored, ~200 lines)
  NonBondHoldingsTable.tsx
  BondHoldingsTable.tsx
  hooks/
    useSeguimientoData.ts                (for SeguimientoPage)
    useHistoricalSeries.ts               (for SeguimientoPage)
    useExchangeRates.ts                  (for SeguimientoPage)
    useBenchmarkConfig.ts                (for SeguimientoPage)
    useSnapshotExchangeRates.ts          (for ReviewSnapshotModal)
    useAutoMatch.ts                      (for ReviewSnapshotModal)
    useSnapshotForm.ts                   (for ReviewSnapshotModal)
    useBondCalculations.ts               (for HoldingReturnsPanel)
    useHoldingQuotes.ts                  (for HoldingReturnsPanel)

components/clients/
  ClientDetail.tsx                       (refactored, ~350 lines)
  hooks/
    useClientData.ts
    useClientModals.ts
    useClientPortfolio.ts
  ClientInfoCard.tsx
  ClientSnapshotsSection.tsx
  ClientMeetingsSection.tsx
```

## Testing strategy

No new unit tests required — this is a pure structural refactoring. Verification:
1. `npm run build` must pass (TypeScript compilation confirms all props/types are correct)
2. `npm run test:run` must pass (existing 330+ tests unchanged)
3. Manual smoke test: open each of the 4 views in browser, verify identical rendering

## Risks and mitigations

| Risk | Mitigation |
|------|-----------|
| Prop drilling becomes verbose | Accept it — explicit props are safer than implicit state sharing |
| Hook dependency order changes | Move useState/useEffect blocks verbatim, preserving exact order within each hook |
| Circular imports | Hooks only import from `lib/` and `@/`, never from sibling components |
| Missing closure variables | Each hook receives all needed values as parameters, returns all needed values |

## Out of scope

- No useReducer or Context introduction
- No calculation formula changes
- No UI changes
- No new features
- No dependency upgrades
- No changes to child components that are already separate files (EvolucionChart, PortfolioBreakdownPies, BenchmarkConfig, etc.)
