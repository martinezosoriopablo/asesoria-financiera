# RadiografiaCartola Refactoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract sub-components from the 1794-line RadiografiaCartola.tsx to reduce it to ~600 lines with zero behavior change.

**Architecture:** Move JSX blocks verbatim into focused sub-components. Move the `mergedProposal` useMemo into a hook. Each parent passes props down; children are presentational. No logic changes.

**Tech Stack:** React 19, TypeScript, Next.js 16 App Router, Tailwind v4

**Constraint:** Zero behavior change. Move code verbatim. Existing tests (330+) must continue passing.

---

## File Structure

### New files
- `components/seguimiento/XraySummaryCards.tsx` — 5 stat cards (valor total, TAC, costo anual, ahorro, rent 12M)
- `components/seguimiento/XrayHoldingsTable.tsx` — Holdings detail table with expandable alternatives
- `components/seguimiento/XrayProposalTable.tsx` — Proposal comparison table + cost summary + fund search + carta corredor button
- `components/seguimiento/XrayReportSection.tsx` — AI report generation, editing, copy, custom context
- `components/seguimiento/XrayTaxSummary.tsx` — Tax regime table + link to tax simulator
- `components/seguimiento/hooks/useXrayProposal.ts` — `adjustedCosts` + `mergedProposal` + `getEffectiveTac` + `portfolioRent12m` useMemos

### Modified files
- `components/seguimiento/RadiografiaCartola.tsx` — Import and use new sub-components + hook

---

## Tasks

### Task 1: Extract useXrayProposal hook

**Files:**
- Create: `components/seguimiento/hooks/useXrayProposal.ts`
- Modify: `components/seguimiento/RadiografiaCartola.tsx`

- [ ] **Step 1: Read RadiografiaCartola.tsx lines 512-719**

Read the `getEffectiveTac` callback, `adjustedCosts` useMemo, `mergedProposal` useMemo, `renderMarkdown` function, and `portfolioRent12m` useMemo.

- [ ] **Step 2: Create useXrayProposal.ts**

Create `components/seguimiento/hooks/useXrayProposal.ts`. Move these blocks verbatim:

```typescript
import { useMemo, useCallback } from "react";
import { formatPercent } from "@/lib/format";

// Re-export types needed by consumers
export interface HoldingAnalysis {
  fundName: string;
  marketValue: number;
  weight: number;
  currency: string;
  matched: boolean;
  matchedFund: string | null;
  matchedAgf: string | null;
  categoria: string;
  isFondoInversion?: boolean;
  fiRut?: string;
  fiPrecioFecha?: string | null;
  fiValorLibro?: number | null;
  fiStale?: boolean;
  rent1m: number | null;
  rent3m: number | null;
  rent12m: number | null;
  tac: number | null;
  tacImpactAnnual: number | null;
  tacImpact10Y: number | null;
  beneficio107lir?: boolean;
  beneficio108lir?: boolean;
  isApvEligible: boolean;
  regimen57bis: boolean;
  cheaperAlternatives: Alternative[];
  potentialSavingAnnual: number | null;
  potentialSaving10Y: number | null;
}

export interface Alternative {
  nombre_fondo: string;
  nombre_agf: string;
  fm_serie: string;
  tac_sintetica: number;
  rent_12m: number | null;
  sharpe_365d: number | null;
  patrimonio_mm: number | null;
  categoria: string;
}

export interface ProposalHolding {
  originalFund: string;
  proposedFund: string;
  proposedAgf: string;
  proposedSerie: string;
  categoria: string;
  marketValue: number;
  weight: number;
  currentTac: number | null;
  proposedTac: number;
  currentRent1m: number | null;
  currentRent3m: number | null;
  currentRent12m: number | null;
  proposedRent1m: number | null;
  proposedRent3m: number | null;
  proposedRent12m: number | null;
  proposedSharpe: number | null;
  tacSavingBps: number;
  changed: boolean;
  isPreferred?: boolean;
}

export interface OptimizedProposal {
  holdings: ProposalHolding[];
  currentTacPromedio: number;
  proposedTacPromedio: number;
  currentCostoAnual: number;
  proposedCostoAnual: number;
  ahorroFondosAnual: number;
}

export interface XrayData {
  totalValue: number;
  totalValueCLP: number;
  allocation: {
    rentaVariable: { value: number; percent: number };
    rentaFija: { value: number; percent: number };
    balanceado: { value: number; percent: number };
    alternativos: { value: number; percent: number };
    otros: { value: number; percent: number };
  };
  tacPromedioPortfolio: number;
  costoAnualTotal: number;
  costoProyectado10Y: number;
  ahorroAnualPotencial: number;
  ahorroPotencial10Y: number;
  holdings: HoldingAnalysis[];
  holdingsConTac: number;
  holdingsSinTac: number;
  holdingsConAlternativa: number;
  fondosInversionDetected: Array<{ rut: string; nombre: string; stale: boolean }>;
  proposal: OptimizedProposal;
}

interface ProposalOverride {
  proposedFund: string;
  proposedAgf: string;
  proposedSerie: string;
  proposedTac: number;
  proposedRent1m: number | null;
  proposedRent3m: number | null;
  proposedRent12m: number | null;
}

interface FundMeta {
  fundName: string;
  run: string;
  serie: string;
  tac: number | null;
  moneda: string;
  quantity: number;
}

interface UseXrayProposalParams {
  data: XrayData | null;
  tacOverrides: Record<string, number>;
  proposalOverrides: Record<string, ProposalOverride>;
  proposedTacOverrides: Record<string, number>;
  fundsMeta?: FundMeta[];
  advisoryFee: number;
}

export function useXrayProposal({
  data, tacOverrides, proposalOverrides, proposedTacOverrides, fundsMeta, advisoryFee,
}: UseXrayProposalParams) {
  // Paste getEffectiveTac (lines 513-519) verbatim
  // Paste adjustedCosts useMemo (lines 522-543) verbatim
  // Paste mergedProposal useMemo (lines 546-653) verbatim
  // Paste portfolioRent12m useMemo (lines 707-719) verbatim

  return { getEffectiveTac, adjustedCosts, mergedProposal, portfolioRent12m };
}
```

The implementer MUST read lines 512-719 of RadiografiaCartola.tsx and copy the four blocks exactly. The `renderMarkdown` function stays in the parent (it's only used by the report section which will be extracted later with its own state).

- [ ] **Step 3: Update RadiografiaCartola**

1. Add import: `import { useXrayProposal } from "./hooks/useXrayProposal";`
2. Also import types: `import type { XrayData, HoldingAnalysis, ProposalHolding, Alternative, OptimizedProposal } from "./hooks/useXrayProposal";`
3. Remove the local interface definitions for `HoldingAnalysis`, `Alternative`, `ProposalHolding`, `OptimizedProposal`, `XrayData` (lines 28-120)
4. Remove `getEffectiveTac`, `adjustedCosts`, `mergedProposal`, `portfolioRent12m` (lines 512-719)
5. Add hook call:
```tsx
const { getEffectiveTac, adjustedCosts, mergedProposal, portfolioRent12m } = useXrayProposal({
  data, tacOverrides, proposalOverrides, proposedTacOverrides, fundsMeta, advisoryFee,
});
```
6. Keep `ProposalOverride`, `SearchResult`, `FundMeta`, `Holding`, `Props` interfaces locally (they're used by the component's own state/callbacks)

- [ ] **Step 4: Build and test**

Run: `rm -rf .next && npm run build && npm run test:run`
Expected: Build succeeds, 330 tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/seguimiento/hooks/useXrayProposal.ts components/seguimiento/RadiografiaCartola.tsx
git commit -m "refactor: extract useXrayProposal hook from RadiografiaCartola"
```

---

### Task 2: Extract XraySummaryCards

**Files:**
- Create: `components/seguimiento/XraySummaryCards.tsx`
- Modify: `components/seguimiento/RadiografiaCartola.tsx`

- [ ] **Step 1: Read RadiografiaCartola.tsx lines 789-869**

Read the 5 summary cards JSX block.

- [ ] **Step 2: Create XraySummaryCards.tsx**

Create `components/seguimiento/XraySummaryCards.tsx`:

```typescript
"use client";

import React from "react";
import { TrendingDown, DollarSign } from "lucide-react";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";

interface Props {
  totalValue: number;
  holdingsCount: number;
  ufValue: number | null;
  usdValue: number | null;
  tacPromedio: number;
  holdingsConTac: number;
  holdingsSinTac: number;
  costoAnual: number;
  ahorroAnualPotencial: number;
  ahorroPotencial10Y: number;
  portfolioRent12m: { value: number; coverage: number } | null;
}

export default function XraySummaryCards({ ... }: Props) {
  // Paste lines 789-869 JSX verbatim
  // Replace data.X references with prop names
}
```

The implementer MUST read lines 789-869 and copy the JSX exactly, replacing `data.totalValue` with `totalValue`, `data.holdings.length` with `holdingsCount`, `adjustedCosts?.tacPromedio ?? data.tacPromedioPortfolio` with `tacPromedio`, etc.

- [ ] **Step 3: Update RadiografiaCartola**

1. Add import: `import XraySummaryCards from "./XraySummaryCards";`
2. Replace lines 789-869 with:
```tsx
<XraySummaryCards
  totalValue={data.totalValue}
  holdingsCount={data.holdings.length}
  ufValue={ufValue}
  usdValue={usdValue}
  tacPromedio={adjustedCosts?.tacPromedio ?? data.tacPromedioPortfolio}
  holdingsConTac={adjustedCosts?.holdingsConTac ?? data.holdingsConTac}
  holdingsSinTac={data.holdingsSinTac}
  costoAnual={adjustedCosts?.costoAnual ?? data.costoAnualTotal}
  ahorroAnualPotencial={data.ahorroAnualPotencial}
  ahorroPotencial10Y={data.ahorroPotencial10Y}
  portfolioRent12m={portfolioRent12m}
/>
```

- [ ] **Step 4: Build and test**

Run: `rm -rf .next && npm run build && npm run test:run`
Expected: Build succeeds, 330 tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/seguimiento/XraySummaryCards.tsx components/seguimiento/RadiografiaCartola.tsx
git commit -m "refactor: extract XraySummaryCards sub-component from RadiografiaCartola"
```

---

### Task 3: Extract XrayHoldingsTable

**Files:**
- Create: `components/seguimiento/XrayHoldingsTable.tsx`
- Modify: `components/seguimiento/RadiografiaCartola.tsx`

- [ ] **Step 1: Read RadiografiaCartola.tsx lines 961-1172**

Read the holdings detail table with expandable alternatives.

- [ ] **Step 2: Create XrayHoldingsTable.tsx**

Create `components/seguimiento/XrayHoldingsTable.tsx`:

```typescript
"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronRight, TrendingDown, DollarSign } from "lucide-react";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import type { HoldingAnalysis } from "./hooks/useXrayProposal";

interface Props {
  holdings: HoldingAnalysis[];
  ahorroPotencial10Y: number;
  ahorroAnualPotencial: number;
  getEffectiveTac: (h: HoldingAnalysis) => number | null;
  tacOverrides: Record<string, number>;
  onTacOverride: (fundName: string, value: number) => void;
}

export default function XrayHoldingsTable({ ... }: Props) {
  const [expandedHolding, setExpandedHolding] = useState<string | null>(null);

  // Paste lines 961-1172 JSX verbatim
  // Move expandedHolding state from parent to here
}
```

The `expandedHolding`/`setExpandedHolding` state moves from the parent into this component.

- [ ] **Step 3: Update RadiografiaCartola**

1. Add import: `import XrayHoldingsTable from "./XrayHoldingsTable";`
2. Remove `expandedHolding`/`setExpandedHolding` useState
3. Replace lines 961-1172 with:
```tsx
<XrayHoldingsTable
  holdings={data.holdings}
  ahorroPotencial10Y={data.ahorroPotencial10Y}
  ahorroAnualPotencial={data.ahorroAnualPotencial}
  getEffectiveTac={getEffectiveTac}
  tacOverrides={tacOverrides}
  onTacOverride={(fundName, value) => setTacOverrides(prev => ({ ...prev, [fundName]: value }))}
/>
```

- [ ] **Step 4: Build and test**

Run: `rm -rf .next && npm run build && npm run test:run`
Expected: Build succeeds, 330 tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/seguimiento/XrayHoldingsTable.tsx components/seguimiento/RadiografiaCartola.tsx
git commit -m "refactor: extract XrayHoldingsTable sub-component from RadiografiaCartola"
```

---

### Task 4: Extract XrayProposalTable

**Files:**
- Create: `components/seguimiento/XrayProposalTable.tsx`
- Modify: `components/seguimiento/RadiografiaCartola.tsx`

- [ ] **Step 1: Read RadiografiaCartola.tsx lines 1174-1596**

Read the entire proposal section: comparison table, inline fund search, cost summary cards, carta corredor button, and CartaCorredorModal.

- [ ] **Step 2: Create XrayProposalTable.tsx**

Create `components/seguimiento/XrayProposalTable.tsx`. This is the largest extraction (~420 lines). It includes:
- The proposal comparison table with editable TACs
- Inline fund search per row
- Cost & return comparison summary (4 cards)
- Mail al corredor button + CartaCorredorModal

```typescript
"use client";

import React, { useState, useRef, useCallback } from "react";
import { Search, X, Mail, Loader } from "lucide-react";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import CartaCorredorModal from "@/components/portfolio/CartaCorredorModal";
import type { HoldingAnalysis } from "./hooks/useXrayProposal";

interface SearchResult {
  id: string;
  type: "fund" | "stock";
  fo_run?: number;
  serie?: string;
  nombre: string;
  agf?: string;
  moneda: string;
  valor_cuota: number | null;
  tac?: number | null;
  rent_1m?: number | null;
  rent_3m?: number | null;
  rent_12m?: number | null;
  isPreferred?: boolean;
}

interface MergedProposal {
  holdings: Array<{
    originalFund: string;
    proposedFund: string;
    proposedAgf: string;
    proposedSerie: string;
    categoria: string;
    marketValue: number;
    weight: number;
    currentTac: number | null;
    proposedTac: number;
    currentRent1m: number | null;
    currentRent3m: number | null;
    currentRent12m: number | null;
    proposedRent1m: number | null;
    proposedRent3m: number | null;
    proposedRent12m: number | null;
    tacSavingBps: number;
    changed: boolean;
    isPreferred?: boolean;
  }>;
  currentTacPromedio: number;
  proposedTacPromedio: number;
  currentCostoAnual: number;
  proposedCostoAnual: number;
  ahorroFondosAnual: number;
  feeAnual: number;
  costoTotalPropuesto: number;
  ahorroNeto: number;
  currentRent12m: number | null;
  proposedRent12m: number | null;
  currentRent12mCoverage: number;
  proposedRent12mCoverage: number;
}

interface Props {
  mergedProposal: MergedProposal;
  dataHoldings: HoldingAnalysis[];
  ufValue: number | null;
  advisoryFee: number;
  onAdvisoryFeeChange: (fee: number) => void;
  tacOverrides: Record<string, number>;
  onTacOverride: (fundName: string, value: number) => void;
  proposedTacOverrides: Record<string, number>;
  onProposedTacOverride: (fundName: string, value: number) => void;
  proposalOverrides: Record<string, any>;
  onSelectFund: (holdingFundName: string, result: SearchResult) => void;
  onRemoveOverride: (holdingFundName: string) => void;
  readOnly?: boolean;
  clientId?: string;
}

export default function XrayProposalTable({ ... }: Props) {
  const [rentPeriod, setRentPeriod] = useState<"1M" | "3M" | "1Y">("1Y");
  const [showCartaCorredor, setShowCartaCorredor] = useState(false);
  const [searchingFund, setSearchingFund] = useState<string | null>(null);
  const [fundSearchQuery, setFundSearchQuery] = useState("");
  const [fundSearchResults, setFundSearchResults] = useState<SearchResult[]>([]);
  const [fundSearchLoading, setFundSearchLoading] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Move searchFunds, handleFundSearchInput from parent
  // Paste lines 1174-1596 JSX verbatim
}
```

The following state and callbacks move from parent to this component:
- `rentPeriod`/`setRentPeriod`
- `showCartaCorredor`/`setShowCartaCorredor`
- `searchingFund`/`setSearchingFund`
- `fundSearchQuery`/`setFundSearchQuery`
- `fundSearchResults`/`setFundSearchResults`
- `fundSearchLoading`/`setFundSearchLoading`
- `searchTimeoutRef`
- `searchFunds` callback
- `handleFundSearchInput` callback

The parent keeps `selectFundForProposal` and `removeProposalOverride` since they modify parent state, but passes them as `onSelectFund` and `onRemoveOverride` props.

- [ ] **Step 3: Update RadiografiaCartola**

1. Add import: `import XrayProposalTable from "./XrayProposalTable";`
2. Remove moved state variables (rentPeriod, showCartaCorredor, searchingFund, fundSearchQuery, fundSearchResults, fundSearchLoading, searchTimeoutRef)
3. Remove `searchFunds` and `handleFundSearchInput` callbacks
4. Replace lines 1174-1596 with:
```tsx
{mergedProposal && (
  <XrayProposalTable
    mergedProposal={mergedProposal}
    dataHoldings={data.holdings}
    ufValue={ufValue}
    advisoryFee={advisoryFee}
    onAdvisoryFeeChange={setAdvisoryFee}
    tacOverrides={tacOverrides}
    onTacOverride={(fundName, value) => setTacOverrides(prev => ({ ...prev, [fundName]: value }))}
    proposedTacOverrides={proposedTacOverrides}
    onProposedTacOverride={(fundName, value) => setProposedTacOverrides(prev => ({ ...prev, [fundName]: value }))}
    proposalOverrides={proposalOverrides}
    onSelectFund={selectFundForProposal}
    onRemoveOverride={removeProposalOverride}
    readOnly={readOnly}
    clientId={clientId}
  />
)}
```

- [ ] **Step 4: Build and test**

Run: `rm -rf .next && npm run build && npm run test:run`
Expected: Build succeeds, 330 tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/seguimiento/XrayProposalTable.tsx components/seguimiento/RadiografiaCartola.tsx
git commit -m "refactor: extract XrayProposalTable sub-component from RadiografiaCartola"
```

---

### Task 5: Extract XrayTaxSummary

**Files:**
- Create: `components/seguimiento/XrayTaxSummary.tsx`
- Modify: `components/seguimiento/RadiografiaCartola.tsx`

- [ ] **Step 1: Read RadiografiaCartola.tsx lines 1598-1665**

Read the tax summary section.

- [ ] **Step 2: Create XrayTaxSummary.tsx**

```typescript
"use client";

import React from "react";
import { ArrowRight } from "lucide-react";
import type { HoldingAnalysis } from "./hooks/useXrayProposal";

interface Props {
  holdings: HoldingAnalysis[];
  rawHoldings: Array<{ fundName: string; securityId?: string | null; serie?: string | null; quantity?: number; unitCost?: number; costBasis?: number; marketPrice?: number; marketValue: number; marketValueCLP?: number; assetClass?: string; currency?: string }>;
  mergedProposal: { holdings: Array<{ originalFund: string; changed: boolean; proposedTac: number }> } | null;
  ufValue: number | null;
  usdValue: number | null;
  clientName?: string;
  clientId?: string;
  readOnly?: boolean;
}

export default function XrayTaxSummary({ holdings, rawHoldings, mergedProposal, ufValue, usdValue, clientName, clientId, readOnly }: Props) {
  // Paste lines 1598-1665 JSX verbatim
}
```

- [ ] **Step 3: Update RadiografiaCartola**

1. Add import: `import XrayTaxSummary from "./XrayTaxSummary";`
2. Replace lines 1598-1665 with:
```tsx
{data.holdings.length > 0 && (
  <XrayTaxSummary
    holdings={data.holdings}
    rawHoldings={holdings}
    mergedProposal={mergedProposal}
    ufValue={ufValue}
    usdValue={usdValue}
    clientName={clientName}
    clientId={clientId}
    readOnly={readOnly}
  />
)}
```

- [ ] **Step 4: Build and test**

Run: `rm -rf .next && npm run build && npm run test:run`
Expected: Build succeeds, 330 tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/seguimiento/XrayTaxSummary.tsx components/seguimiento/RadiografiaCartola.tsx
git commit -m "refactor: extract XrayTaxSummary sub-component from RadiografiaCartola"
```

---

### Task 6: Extract XrayReportSection

**Files:**
- Create: `components/seguimiento/XrayReportSection.tsx`
- Modify: `components/seguimiento/RadiografiaCartola.tsx`

- [ ] **Step 1: Read RadiografiaCartola.tsx lines 1667-1784**

Read the report section. Also read lines 362-464 (generateReport, startEditing, saveEdit, cancelEdit, regenerateReport, copyReport) and lines 655-704 (renderMarkdown).

- [ ] **Step 2: Create XrayReportSection.tsx**

```typescript
"use client";

import React, { useState, useRef, useCallback } from "react";
import { FileText, Loader, AlertTriangle, Pencil, Save, RotateCcw, Copy, Check } from "lucide-react";

interface Props {
  data: any;
  mergedProposal: any;
  adjustedCosts: any;
  getEffectiveTac: (h: any) => number | null;
  clientName?: string;
  advisoryFee: number;
  ufValue: number | null;
  usdValue: number | null;
  cartolaDate?: string;
  currentValue?: number;
  currentValueDate?: string;
  modelData: any;
  storageKey: string | null;
  customContext: string;
  onCustomContextChange: (value: string) => void;
}

export default function XrayReportSection({ ... }: Props) {
  // Move report state here: report, reportLoading, reportError, isEditing, editedReport, copied, textareaRef
  // Move callbacks: generateReport, startEditing, saveEdit, cancelEdit, regenerateReport, copyReport
  // Move renderMarkdown function
  // Paste lines 1667-1784 JSX verbatim
}
```

The following state and callbacks move from parent:
- `report`/`setReport`
- `reportLoading`/`setReportLoading`
- `reportError`/`setReportError`
- `isEditing`/`setIsEditing`
- `editedReport`/`setEditedReport`
- `copied`/`setCopied`
- `textareaRef`
- `generateReport`, `startEditing`, `saveEdit`, `cancelEdit`, `regenerateReport`, `copyReport`
- `renderMarkdown`

The `customContext` state stays in the parent because it's used by `generateReport` AND by the parent's localStorage persistence. Pass it as prop with an `onCustomContextChange` callback.

- [ ] **Step 3: Update RadiografiaCartola**

1. Add import: `import XrayReportSection from "./XrayReportSection";`
2. Remove moved state and callbacks (report, reportLoading, reportError, isEditing, editedReport, copied, textareaRef, generateReport, startEditing, saveEdit, cancelEdit, regenerateReport, copyReport, renderMarkdown)
3. Replace lines 1667-1784 with:
```tsx
{!readOnly && (
  <XrayReportSection
    data={data}
    mergedProposal={mergedProposal}
    adjustedCosts={adjustedCosts}
    getEffectiveTac={getEffectiveTac}
    clientName={clientName}
    advisoryFee={advisoryFee}
    ufValue={ufValue}
    usdValue={usdValue}
    cartolaDate={cartolaDate}
    currentValue={currentValue}
    currentValueDate={currentValueDate}
    modelData={modelData}
    storageKey={storageKey}
    customContext={customContext}
    onCustomContextChange={setCustomContext}
  />
)}
```

- [ ] **Step 4: Build and test**

Run: `rm -rf .next && npm run build && npm run test:run`
Expected: Build succeeds, 330 tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/seguimiento/XrayReportSection.tsx components/seguimiento/RadiografiaCartola.tsx
git commit -m "refactor: extract XrayReportSection sub-component from RadiografiaCartola"
```

---

### Task 7: Final verification

- [ ] **Step 1: Full build**

Run: `rm -rf .next && npm run build`
Expected: Build succeeds with zero errors.

- [ ] **Step 2: Full test suite**

Run: `npm run test:run`
Expected: All tests pass (330+ tests).

- [ ] **Step 3: Check line counts**

Run: `wc -l components/seguimiento/RadiografiaCartola.tsx`

Expected approximate: ~550-650 lines (down from 1794).

- [ ] **Step 4: Commit docs if needed**

No commit needed unless docs require updating.
