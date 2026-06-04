# Seguimiento Email Report + Performance Attribution by Period

## Goal

Two related features: (1) add a month selector to PerformanceAttribution so advisors can see contribution by position for any past month, and (2) send a comprehensive seguimiento email report to clients with all key metrics, attribution, and narrative.

## Architecture

Two independent subsystems sharing no code except existing utilities. Part A modifies an existing component. Part B creates a new email pipeline following the radiografia-email pattern.

## Part A: Performance Attribution by Period

### What changes

Add a month selector to `PerformanceAttribution.tsx` identical to the one in `RentabilidadPorActivo.tsx` (left/right arrows + month label + "Acumulado" option).

### Behavior

- **"Acumulado"** (default): current behavior unchanged. Uses `holdingReturnsData` from HoldingReturnsPanel (live prices). Shows contribution from cartola date to today.
- **Specific month** (e.g., "Mayo 2026"): fetches prices at month start and month end for each holding via `POST /api/portfolio/prices-at-date`. Uses the nearest cartola snapshot to determine which holdings existed at that time.

### Data flow for a specific month

1. Find the cartola snapshot nearest to the 1st of the selected month (reuse `findCartolaNearest` pattern from RentabilidadPorActivo).
2. Extract holdings from that snapshot (fundName, securityId, quantity, assetClass, currency, marketValueCLP).
3. Call `prices-at-date` with `startDate = month start` and `endDate = month end (or today if current month)`.
4. For each holding: `initialCLP = startPrice * quantity * fxRate`, `finalCLP = endPrice * quantity * fxRate`. Contribution = `(finalCLP - initialCLP) / portfolioInitialCLP * 100`.
5. Group by asset class, then by position within each class. Sort by contribution descending.
6. Portfolio total return = sum of all contributions.

### Month list

Built from the first cartola snapshot date to the current month. Same logic as RentabilidadPorActivo: `months` array with `{ label: "Mayo 2026", value: "2026-05" }`.

### UI

The existing collapsible sections (by asset class, by position, benchmark) remain. Only the data source changes based on the selected period. Benchmark attribution section is hidden when viewing a specific month (not enough data to split allocation vs selection effect for a single month).

### Files modified

- `components/seguimiento/PerformanceAttribution.tsx` — add month selector, add fetch logic for specific months, conditional data source

---

## Part B: Seguimiento Email Report

### Email content (top to bottom)

All rendered as HTML tables with inline CSS. No JavaScript, no external stylesheets, no images. Max width 600px. Same design language as `radiografia-email.ts`.

#### 1. Header
- Client name (large, bold)
- Report date
- Risk profile badge (e.g., "Moderado Agresivo")
- Total portfolio value in display currency (with CLP equivalent if not CLP)

#### 2. Composition (RV / RF / Alt / Caja)
Four-row table:
| Clase | Valor Inicial | Valor Actual | Retorno |
Each row has a colored left border (blue=RV, green=RF, purple=Alt, gray=Caja). Return cell colored green/red.

#### 3. Period Returns
Table with columns: Periodo, Nominal, Real (vs UF), USD.
Rows: 1M, 3M, 6M, 1Y, YTD. Cells show "—" when period has insufficient data. Green/red coloring on values.

#### 4. Portfolio Distribution
Two side-by-side mini-tables (or stacked on narrow screens):
- **By asset type**: Acciones X%, Fondos X%, ETFs X%, Bonos X%, Caja X%
- **By currency**: CLP X%, USD X%, UF X%, EUR X%

#### 5. Benchmark Comparison
Table: Periodo, Portafolio %, Benchmark %, Diferencia.
Rows: 1M, 3M, 6M, 1Y, YTD. Difference cell green if positive (outperformance), red if negative. Benchmark label shown in header (e.g., "vs UF +2%").

#### 6. Returns by Holding
Table sorted by return % descending. Columns: Holding, Tipo, Retorno %. Color-coded bar (CSS `background` with `width` percentage) per row. Max 20 holdings. Asset class color on left border.

#### 7. Performance Attribution
Table sorted by contribution descending. Columns: Posicion, Tipo, Contribucion (pp). Positive contributions with green bar, negative with red bar. Top 15 positions. Total row at bottom.

#### 8. Narrative
Text from `client_monthly_closings` for the current month if it exists with status "final" or "draft". If no closing exists, generate one on-demand using the same logic as `POST /api/client-closings` (fetches market report, client info, holdings, calls Claude Sonnet 4). Rendered as paragraphs with no markdown.

#### 9. Footer
- Disclaimer: "Este reporte es informativo y no constituye recomendacion de inversion."
- Exchange rates used (TC: USD $XXX, UF $XX.XXX)
- Link to platform: "Ver en plataforma"
- Greybark Advisors branding

### Data interface

```typescript
interface SeguimientoEmailData {
  clientName: string;
  reportDate: string;
  perfilCliente: string;
  totalValueCLP: number;
  displayCurrency: string; // "CLP" | "USD" | "UF"
  exchangeRates: { usd: number; uf: number };

  composition: {
    equity: { initial: number; final: number; returnPct: number };
    fixedIncome: { initial: number; final: number; returnPct: number };
    alternatives: { initial: number; final: number; returnPct: number };
    cash: { initial: number; final: number; returnPct: number };
  };

  periodReturns: Record<string, {
    nominal: number | null;
    real: number | null;
    usd: number | null;
  }>; // keys: "1M", "3M", "6M", "1Y", "YTD"

  distribution: {
    byAssetType: Array<{ label: string; pct: number }>;
    byCurrency: Array<{ label: string; pct: number }>;
  };

  benchmarkComparison: {
    label: string; // e.g., "UF +2%"
    periods: Record<string, {
      portfolio: number | null;
      benchmark: number | null;
      diff: number | null;
    }>;
  } | null;

  holdingReturns: Array<{
    name: string;
    assetType: string;
    returnPct: number;
  }>; // sorted by returnPct desc, max 20

  attribution: Array<{
    name: string;
    instrumentType: string;
    contributionPp: number;
  }>; // sorted by contribution desc, max 15

  narrative: string | null;
  platformUrl: string;
}
```

### Files

| File | Purpose |
|------|---------|
| `lib/seguimiento-email.ts` | Pure function `buildSeguimientoHTML(data: SeguimientoEmailData): string` |
| `lib/seguimiento-email.test.ts` | Unit tests for HTML builder |
| `app/api/seguimiento/send-email/route.ts` | POST endpoint: auth, rate limit, build HTML, send via Resend |
| `components/seguimiento/SendSeguimientoModal.tsx` | Modal with email input + iframe preview |
| `components/seguimiento/SeguimientoPage.tsx` | Add "Enviar Reporte" button, state management, data assembly |

### API endpoint

`POST /api/seguimiento/send-email`

Request body:
```typescript
{
  clientId: string;
  recipientEmail: string;
  seguimientoData: SeguimientoEmailData;
}
```

Auth: `requireAdvisor()`. Rate limit: 5 per minute. Validates email format, verifies client belongs to advisor (`asesor_id`). Builds HTML via `buildSeguimientoHTML()`, sends via Resend.

Response: `{ success: true, data: { messageId: string } }`

### Modal (SendSeguimientoModal)

Same pattern as `SendReportModal.tsx` (radiografia):
- Email input pre-filled with client email (fetched from `/api/clients/{id}`)
- iframe preview using `srcdoc` with `buildSeguimientoHTML()` called client-side
- Send / Cancel buttons
- Loading, success, error states

### Data assembly in SeguimientoPage

When user clicks "Enviar Reporte", SeguimientoPage assembles `SeguimientoEmailData` from existing state:
- `composition` from the computed `boxes` array
- `periodReturns` from the `periodReturns` memo
- `distribution` from `holdingReturnsData` (asset type weights) and holdings currencies
- `benchmarkComparison` from `benchmarkReturns` state
- `holdingReturns` from `holdingReturnsData` (all holdings sorted by return)
- `attribution` from PerformanceAttribution's contribution calculation (need to expose this via callback)
- `narrative` from `client_monthly_closings` (fetched on modal open if not cached)

### Narrative fetch

On modal open, if narrative is not cached:
1. Fetch `GET /api/client-closings?clientId=X&month=YYYY-MM` for current month
2. If closing exists (any status), use its content
3. If no closing, call `POST /api/client-closings` to generate one (reuses existing endpoint)
4. Cache the narrative in component state

---

## Out of Scope

- PDF generation
- Scheduled/automatic email sending
- Email templates configurable by advisor
- Historical email log/tracking
- Outlook desktop SVG compatibility (using tables only)

## Testing

- `lib/seguimiento-email.test.ts`: 10+ tests covering each section of the HTML output, inline styles only, data formatting, edge cases (null periods, empty holdings, no narrative)
- PerformanceAttribution: manual testing with month selector (no unit test for the UI, but the contribution calculation is already tested via existing snapshot-based logic)
- Integration: verify email renders correctly in Gmail web client
