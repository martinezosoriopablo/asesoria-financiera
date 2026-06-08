# Component Refactoring Phase 2 — Sub-component Extraction

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract large JSX blocks and pure functions from SeguimientoPage (1541→~750), ReviewSnapshotModal (1103→~550), and HoldingReturnsPanel (654→~400) into focused sub-components and utilities.

**Architecture:** Move JSX blocks verbatim into new sub-components. Move pure functions into lib/ utilities. No behavior changes. Each parent passes props down; children are presentational.

**Tech Stack:** React 19, TypeScript, Next.js 16 App Router, Tailwind v4

**Constraint:** Zero behavior change. Move code verbatim. Existing tests (330+) must continue passing.

---

## File Structure

### New files (SeguimientoPage extractions)
- `components/seguimiento/SeguimientoSummaryCards.tsx` — Currency toggle + valor cards + TAC + period returns
- `components/seguimiento/RebalancingTable.tsx` — Rebalancing IIFE → component with execution save
- `components/seguimiento/CartolaHistory.tsx` — Cartola table + full snapshot history + delete all
- `components/seguimiento/SeguimientoHeader.tsx` — Title, back link, action buttons

### New files (ReviewSnapshotModal extractions)
- `components/seguimiento/HoldingsEditTable.tsx` — Editable holdings table
- `components/seguimiento/FundSearchPopup.tsx` — Search input + results for price matching
- `components/seguimiento/AutoMatchSuggestions.tsx` — Purple suggestion cards with accept/reject

### New files (HoldingReturnsPanel extractions)
- `components/seguimiento/hooks/useHoldingSummaries.ts` — The large holdingSummaries useMemo + enrichment
- `lib/bonds/parse-bond-name.ts` — Bond name parser + rating extraction (pure functions)

### Modified files
- `components/seguimiento/SeguimientoPage.tsx` — Import and use new sub-components
- `components/seguimiento/ReviewSnapshotModal.tsx` — Import and use new sub-components
- `components/seguimiento/HoldingReturnsPanel.tsx` — Import and use new hook + utility

---

## Tasks

### Task 1: Extract SeguimientoSummaryCards from SeguimientoPage

**Files:**
- Create: `components/seguimiento/SeguimientoSummaryCards.tsx`
- Modify: `components/seguimiento/SeguimientoPage.tsx`

- [ ] **Step 1: Read SeguimientoPage.tsx lines 810-949**

Read the full summary cards JSX block to copy verbatim.

- [ ] **Step 2: Create SeguimientoSummaryCards.tsx**

Create `components/seguimiento/SeguimientoSummaryCards.tsx` with the JSX from lines 810-949 wrapped in a component. The component receives all needed values as props:

```typescript
"use client";

import React from "react";
import { Calendar } from "lucide-react";
import { formatNumber, formatCurrency, formatDate } from "@/lib/format";

type PeriodReturn = { nominal: number; real: number | null; usd: number | null };

interface ExchangeRates {
  usd: number;
  uf: number;
  eur?: number;
}

interface Props {
  metrics: { initialValue: number; currentValue: number };
  cartolaExchangeRates: ExchangeRates | null;
  currentExchangeRates: ExchangeRates | null;
  exchangeRates: ExchangeRates | null;
  livePortfolioValue: number | null;
  livePriceDate: string | null;
  historicalSeries: Array<{ fecha: string; total: number; [key: string]: string | number }>;
  snapshots: Array<{ snapshot_date: string; source: string; is_baseline?: boolean }>;
  displayCurrency: string;
  setDisplayCurrency: (cur: string) => void;
  weightedTAC: { weighted: number; annualCost: number; coverage: number } | null;
  baselineAccReturn: number | null;
  convertFromCLP: (clpValue: number, rates: ExchangeRates | null) => string;
  periodReturns: Record<string, PeriodReturn | null> | null;
}

export default function SeguimientoSummaryCards({ ... }: Props) {
  // Paste lines 810-949 JSX verbatim here
}
```

The implementer MUST read lines 810-949 of SeguimientoPage.tsx and copy the JSX block exactly. The outer `{metrics && (` guard becomes the component — the parent will handle the conditional render.

- [ ] **Step 3: Update SeguimientoPage to use the new component**

In SeguimientoPage.tsx:
1. Add import: `import SeguimientoSummaryCards from "./SeguimientoSummaryCards";`
2. Replace lines 810-949 with:
```tsx
{metrics && (
  <SeguimientoSummaryCards
    metrics={metrics}
    cartolaExchangeRates={cartolaExchangeRates}
    currentExchangeRates={currentExchangeRates}
    exchangeRates={exchangeRates}
    livePortfolioValue={livePortfolioValue}
    livePriceDate={livePriceDate}
    historicalSeries={historicalSeries}
    snapshots={snapshots}
    displayCurrency={displayCurrency}
    setDisplayCurrency={setDisplayCurrency}
    weightedTAC={weightedTAC}
    baselineAccReturn={baselineAccReturn}
    convertFromCLP={convertFromCLP}
    periodReturns={periodReturns}
  />
)}
```

- [ ] **Step 4: Build and test**

Run: `npm run build && npm run test:run`
Expected: Build succeeds, 330 tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/seguimiento/SeguimientoSummaryCards.tsx components/seguimiento/SeguimientoPage.tsx
git commit -m "refactor: extract SeguimientoSummaryCards sub-component from SeguimientoPage"
```

---

### Task 2: Extract RebalancingTable from SeguimientoPage

**Files:**
- Create: `components/seguimiento/RebalancingTable.tsx`
- Modify: `components/seguimiento/SeguimientoPage.tsx`

- [ ] **Step 1: Read SeguimientoPage.tsx lines 1034-1222**

Read the full rebalancing IIFE to copy verbatim.

- [ ] **Step 2: Create RebalancingTable.tsx**

Create `components/seguimiento/RebalancingTable.tsx`. Move the IIFE logic (row building from lines 1035-1097) into the component body, and the JSX (lines 1099-1221) into the return. The component receives:

```typescript
"use client";

import React, { useState } from "react";
import { RefreshCw, CheckCircle2 } from "lucide-react";

interface Holding {
  securityId?: string;
  fundName?: string;
  name?: string;
  nombre?: string;
  assetClass?: string;
  tipo?: string;
  marketValue?: number;
  marketValueCLP?: number;
  valor?: number;
  percentOfPortfolio?: number;
}

interface CarteraPosition {
  ticker: string;
  nombre: string;
  clase: string;
  porcentaje: number;
}

interface Execution {
  id: string;
  executed_at: string;
  ticker: string;
  nombre: string;
  action: string;
  actual_percent: number;
  target_percent: number;
}

interface Props {
  recommendation: { cartera?: CarteraPosition[] } | null;
  latestSnapshotHoldings: Holding[] | null;
  clientId: string;
  executions: Execution[];
  onExecutionSaved: () => void;
}

export default function RebalancingTable({ recommendation, latestSnapshotHoldings, clientId, executions, onExecutionSaved }: Props) {
  const [savingExecution, setSavingExecution] = useState(false);

  // Row-building logic from lines 1035-1097 goes here
  // JSX from lines 1099-1221 goes in the return
  // Return null if no cartera or no rows
}
```

The implementer MUST read lines 1034-1222 of SeguimientoPage.tsx and move the code exactly. The `savingExecution` state moves into this component. The `fetchExecutions` callback becomes the `onExecutionSaved` prop.

- [ ] **Step 3: Update SeguimientoPage**

1. Add import: `import RebalancingTable from "./RebalancingTable";`
2. Remove `savingExecution`/`setSavingExecution` useState (they move to the child)
3. Replace lines 1034-1222 with:
```tsx
{!portalMode && (
  <RebalancingTable
    recommendation={recommendation}
    latestSnapshotHoldings={snapshots.length > 0 ? (snapshots[snapshots.length - 1].holdings as Holding[] | null) : null}
    clientId={clientId}
    executions={executions}
    onExecutionSaved={fetchExecutions}
  />
)}
```

- [ ] **Step 4: Build and test**

Run: `npm run build && npm run test:run`
Expected: Build succeeds, 330 tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/seguimiento/RebalancingTable.tsx components/seguimiento/SeguimientoPage.tsx
git commit -m "refactor: extract RebalancingTable sub-component from SeguimientoPage"
```

---

### Task 3: Extract CartolaHistory from SeguimientoPage

**Files:**
- Create: `components/seguimiento/CartolaHistory.tsx`
- Modify: `components/seguimiento/SeguimientoPage.tsx`

- [ ] **Step 1: Read SeguimientoPage.tsx lines 1394-1464**

- [ ] **Step 2: Create CartolaHistory.tsx**

```typescript
"use client";

import React, { useState } from "react";
import { FileText, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import SnapshotsTable from "./SnapshotsTable";
import type { Snapshot } from "./SeguimientoPage";

interface Props {
  snapshots: Snapshot[];
  onEdit: (snapshot: Snapshot) => void;
  onDelete: (id: string) => void;
  onDeleteAll: () => void;
  onSetBaseline: (id: string) => void;
}

export default function CartolaHistory({ snapshots, onEdit, onDelete, onDeleteAll, onSetBaseline }: Props) {
  const [showAll, setShowAll] = useState(false);

  // Move IIFE logic: split cartolas vs apiSnapshots
  // Move JSX from lines 1402-1463 verbatim
}
```

The `showAllSnapshots` state moves to this component as `showAll`.

- [ ] **Step 3: Update SeguimientoPage**

1. Add import: `import CartolaHistory from "./CartolaHistory";`
2. Remove `showAllSnapshots`/`setShowAllSnapshots` useState
3. Replace lines 1394-1464 with:
```tsx
{!portalMode && (
  <CartolaHistory
    snapshots={snapshots}
    onEdit={setEditingSnapshot}
    onDelete={handleDeleteSnapshot}
    onDeleteAll={handleDeleteAllSnapshots}
    onSetBaseline={handleSetBaseline}
  />
)}
```

- [ ] **Step 4: Build and test**

Run: `npm run build && npm run test:run`
Expected: Build succeeds, 330 tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/seguimiento/CartolaHistory.tsx components/seguimiento/SeguimientoPage.tsx
git commit -m "refactor: extract CartolaHistory sub-component from SeguimientoPage"
```

---

### Task 4: Extract SeguimientoHeader from SeguimientoPage

**Files:**
- Create: `components/seguimiento/SeguimientoHeader.tsx`
- Modify: `components/seguimiento/SeguimientoPage.tsx`

- [ ] **Step 1: Read SeguimientoPage.tsx lines 698-757**

- [ ] **Step 2: Create SeguimientoHeader.tsx**

```typescript
"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw, Mail, TrendingUp, Plus, Scale } from "lucide-react";

interface Props {
  clientId: string;
  clientName: string;
  portalMode: boolean;
  loading: boolean;
  fillingPrices: boolean;
  hasSnapshots: boolean;
  onRefresh: () => void;
  onFillPrices: () => void;
  onSendReport: () => void;
  onAddCartola: () => void;
}

export default function SeguimientoHeader({ ... }: Props) {
  // Lines 698-757 JSX verbatim
}
```

- [ ] **Step 3: Update SeguimientoPage**

Replace lines 698-757 with `<SeguimientoHeader ... />`.

- [ ] **Step 4: Build and test**

Run: `npm run build && npm run test:run`

- [ ] **Step 5: Commit**

```bash
git add components/seguimiento/SeguimientoHeader.tsx components/seguimiento/SeguimientoPage.tsx
git commit -m "refactor: extract SeguimientoHeader sub-component from SeguimientoPage"
```

---

### Task 5: Extract HoldingsEditTable from ReviewSnapshotModal

**Files:**
- Create: `components/seguimiento/HoldingsEditTable.tsx`
- Modify: `components/seguimiento/ReviewSnapshotModal.tsx`

- [ ] **Step 1: Read ReviewSnapshotModal.tsx lines 798-952**

- [ ] **Step 2: Create HoldingsEditTable.tsx**

Move the holdings table JSX (lines 798-952) into a component. It receives holdings array, handlers, uniqueSources, unmatchedIndices, and search trigger:

```typescript
"use client";

import React from "react";
import { Search, AlertTriangle } from "lucide-react";
import type { Holding } from "./hooks/useSnapshotForm";

interface Props {
  holdings: Holding[];
  uniqueSources: string[];
  unmatchedIndices: Set<number>;
  autoMatchComplete: boolean;
  onAssetClassChange: (index: number, value: string) => void;
  onValueChange: (index: number, value: number) => void;
  onCurrencyChange: (index: number, value: string) => void;
  onQuantityChange: (index: number, value: number) => void;
  onPriceChange: (index: number, value: number) => void;
  onPurchaseDateChange: (index: number, value: string) => void;
  onSearchFund: (index: number, fundName: string) => void;
  onHoldingsChange: (holdings: Holding[]) => void;
  formatNumber: (value: number, decimals: number) => string;
}
```

The `ASSET_CLASS_OPTIONS` and `CURRENCY_OPTIONS` constants move to this file (or a shared constants file).

- [ ] **Step 3: Update ReviewSnapshotModal**

Replace lines 798-952 with `<HoldingsEditTable ... />`.

- [ ] **Step 4: Build and test**

Run: `npm run build && npm run test:run`

- [ ] **Step 5: Commit**

```bash
git add components/seguimiento/HoldingsEditTable.tsx components/seguimiento/ReviewSnapshotModal.tsx
git commit -m "refactor: extract HoldingsEditTable sub-component from ReviewSnapshotModal"
```

---

### Task 6: Extract FundSearchPopup from ReviewSnapshotModal

**Files:**
- Create: `components/seguimiento/FundSearchPopup.tsx`
- Modify: `components/seguimiento/ReviewSnapshotModal.tsx`

- [ ] **Step 1: Read ReviewSnapshotModal.tsx lines 955-1058**

- [ ] **Step 2: Create FundSearchPopup.tsx**

Move lines 955-1058 into a component:

```typescript
"use client";

import React from "react";
import { X, Search, Loader } from "lucide-react";
import { formatNumber } from "@/lib/format";

interface SearchResult {
  id: string;
  nombre: string;
  agf?: string;
  serie?: string;
  moneda?: string;
  valor_cuota?: number;
  type?: string;
  exchange?: string;
}

interface Props {
  searchingIndex: number;
  holdingName: string;
  isUnmatched: boolean;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchLoading: boolean;
  searchResults: SearchResult[];
  onSearch: (index: number, fundName: string, query?: string) => void;
  onApply: (index: number, result: SearchResult) => void;
  onClose: () => void;
}
```

- [ ] **Step 3: Update ReviewSnapshotModal**

Replace lines 955-1058 with `<FundSearchPopup ... />` (conditional on `searchingIndex !== null`).

- [ ] **Step 4: Build and test**

Run: `npm run build && npm run test:run`

- [ ] **Step 5: Commit**

```bash
git add components/seguimiento/FundSearchPopup.tsx components/seguimiento/ReviewSnapshotModal.tsx
git commit -m "refactor: extract FundSearchPopup sub-component from ReviewSnapshotModal"
```

---

### Task 7: Extract AutoMatchSuggestions from ReviewSnapshotModal

**Files:**
- Create: `components/seguimiento/AutoMatchSuggestions.tsx`
- Modify: `components/seguimiento/ReviewSnapshotModal.tsx`

- [ ] **Step 1: Read ReviewSnapshotModal.tsx lines 507-629**

- [ ] **Step 2: Create AutoMatchSuggestions.tsx**

Move lines 507-629 into a component:

```typescript
"use client";

import React from "react";
import { Sparkles, Loader, AlertTriangle, CheckCircle2, X } from "lucide-react";
import { formatNumber } from "@/lib/format";
import type { Holding } from "./hooks/useSnapshotForm";
import type { MatchSuggestion } from "./hooks/useAutoMatch";

interface Props {
  holdings: Holding[];
  matchSuggestions: MatchSuggestion[];
  autoMatchLoading: boolean;
  autoMatchComplete: boolean;
  autoAppliedCount: number;
  unmatchedIndices: Set<number>;
  onApply: (suggestion: MatchSuggestion) => void;
  onDismiss: (index: number) => void;
  onApplyAll: () => void;
}
```

- [ ] **Step 3: Update ReviewSnapshotModal**

Replace lines 506-629 with conditional `<AutoMatchSuggestions ... />`.

- [ ] **Step 4: Build and test**

Run: `npm run build && npm run test:run`

- [ ] **Step 5: Commit**

```bash
git add components/seguimiento/AutoMatchSuggestions.tsx components/seguimiento/ReviewSnapshotModal.tsx
git commit -m "refactor: extract AutoMatchSuggestions sub-component from ReviewSnapshotModal"
```

---

### Task 8: Extract parseBondName to lib/bonds/

**Files:**
- Create: `lib/bonds/parse-bond-name.ts`
- Modify: `components/seguimiento/HoldingReturnsPanel.tsx`

- [ ] **Step 1: Read HoldingReturnsPanel.tsx lines 40-117**

Read the bond name parsing utilities.

- [ ] **Step 2: Create lib/bonds/parse-bond-name.ts**

Move lines 40-117 (regex patterns, Moody's mapping, `extractRating()`, `parseBondName()`) verbatim into `lib/bonds/parse-bond-name.ts`. Export `parseBondName` and `extractRating`.

- [ ] **Step 3: Update HoldingReturnsPanel**

1. Add import: `import { parseBondName, extractRating } from "@/lib/bonds/parse-bond-name";`
2. Remove lines 40-117 (the moved code)

- [ ] **Step 4: Build and test**

Run: `npm run build && npm run test:run`

- [ ] **Step 5: Commit**

```bash
git add lib/bonds/parse-bond-name.ts components/seguimiento/HoldingReturnsPanel.tsx
git commit -m "refactor: extract parseBondName utility to lib/bonds/"
```

---

### Task 9: Extract useHoldingSummaries hook from HoldingReturnsPanel

**Files:**
- Create: `components/seguimiento/hooks/useHoldingSummaries.ts`
- Modify: `components/seguimiento/HoldingReturnsPanel.tsx`

- [ ] **Step 1: Read HoldingReturnsPanel.tsx lines 150-397**

Read the holdingSummaries useMemo, tacByFundName useMemo, and enrichedSummaries useMemo.

- [ ] **Step 2: Create useHoldingSummaries.ts**

Move the three useMemo blocks into a hook:

```typescript
import { useMemo } from "react";
import { inferInstrumentType } from "@/lib/instrument-type";
import { parseBondName, extractRating } from "@/lib/bonds/parse-bond-name";

// Move HoldingData interface here
// Move FundMeta interface here (or import from HoldingReturnsPanel)

interface UseHoldingSummariesParams {
  snapshots: Snapshot[];
  returnMode: "cartola" | "compra";
  fundsMeta?: FundMeta[];
  marketPrices: Map<string, ...>;
  bondLookups: Map<string, ...>;
}

export function useHoldingSummaries(params: UseHoldingSummariesParams) {
  // holdingSummaries useMemo (lines 155-323)
  // tacByFundName useMemo (lines 329-340)
  // enrichedSummaries useMemo (lines 343-397)
  return { holdingSummaries, latestRawHoldings, enrichedSummaries, previousSnapshotDate };
}
```

The implementer MUST read lines 150-397 and copy the three useMemos verbatim. Types needed by the hook (HoldingData, etc.) should also move.

- [ ] **Step 3: Update HoldingReturnsPanel**

1. Add import: `import { useHoldingSummaries } from "./hooks/useHoldingSummaries";`
2. Remove the three useMemo blocks (lines 155-397)
3. Destructure from the hook call

- [ ] **Step 4: Build and test**

Run: `npm run build && npm run test:run`

- [ ] **Step 5: Commit**

```bash
git add components/seguimiento/hooks/useHoldingSummaries.ts components/seguimiento/HoldingReturnsPanel.tsx
git commit -m "refactor: extract useHoldingSummaries hook from HoldingReturnsPanel"
```

---

### Task 10: Final verification

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: Build succeeds with zero errors.

- [ ] **Step 2: Full test suite**

Run: `npm run test:run`
Expected: All tests pass (330+ tests).

- [ ] **Step 3: Check line counts**

Run: `wc -l components/seguimiento/SeguimientoPage.tsx components/seguimiento/ReviewSnapshotModal.tsx components/seguimiento/HoldingReturnsPanel.tsx`

Expected approximate:
- SeguimientoPage: ~750 lines (down from 1541)
- ReviewSnapshotModal: ~550 lines (down from 1103)
- HoldingReturnsPanel: ~400 lines (down from 654)

- [ ] **Step 4: Commit**

No commit needed if no changes. If docs need updating:
```bash
git add docs/GREYBARK-ARCHITECTURE.md
git commit -m "docs: update line counts after phase 2 refactoring"
```
