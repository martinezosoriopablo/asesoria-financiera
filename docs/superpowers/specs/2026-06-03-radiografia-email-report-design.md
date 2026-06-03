# Radiografia Email Report — Design Spec

## Goal

Generate a professional HTML email report from the Radiografia data and send it to the client via Resend. The report uses pure HTML/CSS with inline SVG charts — no JavaScript, no external resources — for maximum email client compatibility (Gmail, Outlook, Apple Mail).

## User Flow

1. Advisor opens `/recomendacion/[clientId]` and reviews the radiografia
2. Optionally generates the AI narrative via "Generar Analisis"
3. Clicks "Enviar por Email" button (in the page header, next to "Actualizar")
4. Modal opens showing:
   - Preview of the HTML email (rendered in an iframe)
   - Client email address (from `clients` table, editable)
   - "Enviar" / "Cancelar" buttons
5. On "Enviar", calls API to send the email via Resend
6. Success toast notification; modal closes

## Architecture

### New files

| File | Responsibility |
|------|---------------|
| `lib/radiografia-email.ts` | Pure function `buildRadiografiaHTML(data)` — generates the full HTML string |
| `app/api/portfolio/radiografia/send-email/route.ts` | POST endpoint: builds HTML, sends via Resend |
| `components/recomendacion/SendReportModal.tsx` | Preview modal with iframe + email input + send button |

### Modified files

| File | Changes |
|------|---------|
| `components/recomendacion/RecomendacionPage.tsx` | Add "Enviar por Email" button + SendReportModal |

## HTML Report Template (`lib/radiografia-email.ts`)

Pure function, no React dependency. Input: radiografia data object. Output: complete HTML string with all styles inline.

```typescript
interface RadiograpfiaEmailData {
  clientName: string;
  reportDate: string;
  perfilCliente: string;
  perfilModelo: string;
  totalValueCLP: number;
  allocation: Record<string, { actual: number; target: number; delta: number }>;
  instrumentBreakdown: {
    stocks: Array<{ ticker: string; name: string; weightPct: number; marketValueCLP: number }>;
    funds: Array<{ fundName: string; weightPct: number; marketValueCLP: number }>;
    bonds: Array<{ name: string; couponRate: number; maturityDate: string; weightPct: number; marketValueUSD: number }>;
    etfs: Array<{ ticker: string; name: string; weightPct: number; marketValueCLP: number }>;
    cash: Array<{ name: string; weightPct: number; marketValueCLP: number }>;
  };
  observations: Array<{ severity: "alta" | "media" | "info"; text: string }>;
  narrative: string | null;
  platformUrl: string;
}

export function buildRadiografiaHTML(data: RadiograpfiaEmailData): string
```

### Sections (all inline-styled)

1. **Header** — Dark background (#1e293b), advisor branding "Greybark Advisors", client name, date, profile badges (perfil, valor total, modelo)

2. **Asset Allocation vs Modelo** — For each role (RV, RF, Alt, Cash):
   - Two horizontal bars (actual solid, modelo ghost/30% opacity) using CSS `div` with percentage widths
   - Delta badge (green <=3pp, amber 3-10pp, red >10pp)
   - Two SVG donut charts side-by-side ("Tu Cartera" / "Modelo") using `<circle>` with `stroke-dasharray`

3. **Principales Posiciones** — HTML table with top 10 holdings (sorted by weight) across all instrument types. Columns: Instrumento (ticker badge + name), Tipo (Accion/Fondo/Bono/ETF/Caja), Peso%, Valor. Ticker in monospace with light gray background badge.

4. **Observaciones** — Cards with left color border:
   - `alta` → red border + red-50 bg
   - `media` → amber border + amber-50 bg
   - `info` → blue border + blue-50 bg

5. **Diagnostico** (conditional — only if `narrative` is not null) — Prose paragraphs from the Claude narrative, styled with comfortable line-height.

6. **Footer** — Light gray background, disclaimer text, link to platform radiografia page.

### Email compatibility rules

- ALL styles must be inline (`style="..."`) — no `<style>` tags (Gmail strips them)
- No `<img>` tags with external URLs — everything inline
- SVG donuts use `<circle>` with `stroke-dasharray` (works in Gmail, Apple Mail, modern Outlook)
- Table-based layout for outer structure (Outlook compatibility)
- Font stack: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
- Max width: 600px centered (email standard)
- Colors: same palette as the web app (gb-black=#1e293b, gb-gray=#94a3b8, blue=#3b82f6, green=#10b981, etc.)

### SVG Donut Chart Generation

Helper function to generate SVG donut from allocation percentages:

```typescript
function buildDonutSVG(
  segments: Array<{ pct: number; color: string }>,
  label: string,
  size: number
): string
```

Uses `stroke-dasharray` on `<circle>` elements. Circumference = 2 * PI * r. Each segment: `dasharray = (pct/100 * circumference) remainder`, offset accumulated from previous segments.

## API Endpoint (`POST /api/portfolio/radiografia/send-email`)

```typescript
// Request
{
  clientId: string;
  recipientEmail: string;
  radiografiaData: RadiografiaEmailData; // sent from frontend (already fetched)
}

// Response
{ success: true, messageId: string }
```

- Auth: `requireAdvisor()`
- Rate limit: 5/min (email sending)
- Validates email format
- Validates client belongs to advisor
- Builds HTML via `buildRadiografiaHTML()`
- Sends via Resend (`resend.emails.send()`)
- From: `SENDER_EMAIL` env var (default `noreply@greybark.cl`)
- Subject: `Radiografia de Cartera — {clientName} — {date}`
- Returns Resend message ID

## SendReportModal Component

```typescript
interface Props {
  isOpen: boolean;
  onClose: () => void;
  data: RadiografiaData;
  clientEmail: string;
  narrative: string | null;
}
```

- Modal overlay with max-width 700px
- Top: editable email input (pre-filled from `clients.email`)
- Middle: iframe with `srcdoc` showing the HTML preview (scrollable, max-height 500px)
- Bottom: "Cancelar" (secondary) + "Enviar Reporte" (primary with mail icon)
- Loading state on send button
- Success/error feedback
- The HTML preview is generated client-side by calling `buildRadiografiaHTML()` (the same pure function used server-side)

## RecomendacionPage Changes

- Add state: `showSendModal`, `clientEmail` (fetched from client data)
- Add "Enviar por Email" button in header (Mail icon + text), next to "Actualizar"
- On click: fetch client email from `/api/clients/[id]` if not already loaded, open modal
- Pass current `data` + `narrative` (from NarrativeAnalysis state, if generated) to modal
- Need to lift narrative state up: NarrativeAnalysis should call `onNarrativeGenerated(text)` callback

### Narrative state lifting

Currently `NarrativeAnalysis` manages its own `narrative` state internally. To include the narrative in the email, add an `onNarrativeGenerated?: (text: string) => void` callback prop. RecomendacionPage stores it in state and passes to SendReportModal.

## Constraints

- No new npm dependencies (Resend already installed)
- HTML must render correctly in Gmail, Apple Mail, Outlook 365
- SVG donuts may not render in Outlook desktop (pre-2019) — acceptable tradeoff, those users see the bars which work everywhere
- Report generation is deterministic (same data = same HTML)
- `buildRadiografiaHTML` must be importable from both client and server (no Node-only APIs)
- Max email size: keep under 100KB (inline styles + SVG are lightweight)

## Out of Scope

- PDF export (future)
- Scheduling/recurring radiografia emails
- Email open tracking
- Custom advisor branding/logo in email
- BCC to advisor
