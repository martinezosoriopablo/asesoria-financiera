# Radiografia Email Report — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a professional HTML email report from Radiografia data and send it to clients via Resend, with preview modal and confirmation.

**Architecture:** Pure function `buildRadiografiaHTML()` generates email-compatible HTML with inline CSS/SVG charts. API endpoint receives radiografia data + recipient email, builds HTML, sends via Resend. Frontend adds "Enviar por Email" button to RecomendacionPage that opens a preview modal (iframe + email input + send confirmation).

**Tech Stack:** Next.js 16, React 19, Resend (already installed), inline SVG for charts, Tailwind v4 for modal styling

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `lib/radiografia-email.ts` | `buildRadiografiaHTML(data)` — pure function generating complete HTML email string |
| `lib/radiografia-email.test.ts` | Tests for HTML generation (structure, sections, edge cases) |
| `app/api/portfolio/radiografia/send-email/route.ts` | POST endpoint: auth, validate, build HTML, send via Resend |
| `components/recomendacion/SendReportModal.tsx` | Preview modal with iframe + email input + send/cancel |

### Modified files
| File | Changes |
|------|---------|
| `components/recomendacion/NarrativeAnalysis.tsx` | Add `onNarrativeGenerated` callback prop |
| `components/recomendacion/RecomendacionPage.tsx` | Add "Enviar por Email" button, narrative state lifting, modal integration |

---

### Task 1: HTML Email Generator — `buildRadiografiaHTML`

**Files:**
- Create: `lib/radiografia-email.ts`
- Create: `lib/radiografia-email.test.ts`

- [ ] **Step 1: Write tests for buildRadiografiaHTML**

```typescript
// lib/radiografia-email.test.ts
import { describe, it, expect } from "vitest";
import { buildRadiografiaHTML, type RadiografiaEmailData } from "./radiografia-email";

function makeData(overrides: Partial<RadiografiaEmailData> = {}): RadiografiaEmailData {
  return {
    clientName: "Juan Perez",
    reportDate: "2026-06-03",
    perfilCliente: "moderado_agresivo",
    perfilModelo: "moderado_agresivo",
    totalValueCLP: 142000000,
    allocation: {
      rv: { actual: 95, target: 60, delta: 35 },
      rf: { actual: 0, target: 25, delta: -25 },
      alt: { actual: 0, target: 10, delta: -10 },
      cash: { actual: 5, target: 5, delta: 0 },
    },
    instrumentBreakdown: {
      stocks: [
        { ticker: "AAPL", name: "Apple Inc", weightPct: 22.1, marketValueCLP: 31400000 },
        { ticker: "MSFT", name: "Microsoft", weightPct: 18.3, marketValueCLP: 26000000 },
      ],
      funds: [],
      bonds: [],
      etfs: [],
      cash: [{ name: "Caja USD", weightPct: 5, marketValueCLP: 7100000 }],
    },
    observations: [
      { severity: "alta", text: "Sin exposicion a Renta Fija" },
      { severity: "media", text: "Top 3 = 53% del portafolio" },
    ],
    narrative: null,
    platformUrl: "https://app.greybark.cl",
    ...overrides,
  };
}

describe("buildRadiografiaHTML", () => {
  it("returns valid HTML document", () => {
    const html = buildRadiografiaHTML(makeData());
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("</html>");
  });

  it("includes client name in header", () => {
    const html = buildRadiografiaHTML(makeData());
    expect(html).toContain("Juan Perez");
  });

  it("includes allocation bars for all roles", () => {
    const html = buildRadiografiaHTML(makeData());
    expect(html).toContain("Renta Variable");
    expect(html).toContain("Renta Fija");
    expect(html).toContain("Alternativos");
    expect(html).toContain("Caja");
  });

  it("includes delta badges with correct sign", () => {
    const html = buildRadiografiaHTML(makeData());
    expect(html).toContain("+35.0pp");
    expect(html).toContain("-25.0pp");
  });

  it("includes SVG donut charts", () => {
    const html = buildRadiografiaHTML(makeData());
    expect(html).toContain("<svg");
    expect(html).toContain("stroke-dasharray");
    expect(html).toContain("Tu Cartera");
    expect(html).toContain("Modelo");
  });

  it("includes top holdings table", () => {
    const html = buildRadiografiaHTML(makeData());
    expect(html).toContain("AAPL");
    expect(html).toContain("Apple Inc");
    expect(html).toContain("22.1%");
  });

  it("includes observations with severity styling", () => {
    const html = buildRadiografiaHTML(makeData());
    expect(html).toContain("Sin exposicion a Renta Fija");
    expect(html).toContain("#ef4444"); // red border for alta
    expect(html).toContain("#f59e0b"); // amber border for media
  });

  it("excludes narrative section when null", () => {
    const html = buildRadiografiaHTML(makeData({ narrative: null }));
    expect(html).not.toContain("Diagnostico");
  });

  it("includes narrative section when provided", () => {
    const html = buildRadiografiaHTML(makeData({
      narrative: "Tu cartera presenta concentracion significativa.",
    }));
    expect(html).toContain("Diagnostico");
    expect(html).toContain("Tu cartera presenta concentracion significativa.");
  });

  it("includes footer with platform link", () => {
    const html = buildRadiografiaHTML(makeData());
    expect(html).toContain("https://app.greybark.cl");
    expect(html).toContain("no constituye recomendacion");
  });

  it("uses only inline styles (no style tags)", () => {
    const html = buildRadiografiaHTML(makeData());
    expect(html).not.toMatch(/<style[\s>]/);
  });

  it("merges all instrument types in holdings table sorted by weight", () => {
    const html = buildRadiografiaHTML(makeData({
      instrumentBreakdown: {
        stocks: [{ ticker: "AAPL", name: "Apple", weightPct: 10, marketValueCLP: 14200000 }],
        funds: [{ fundName: "Banchile RV", weightPct: 15, marketValueCLP: 21300000 }],
        bonds: [{ name: "UST 4.5%", couponRate: 4.5, maturityDate: "2030-01-15", weightPct: 20, marketValueUSD: 25000 }],
        etfs: [{ ticker: "VOO", name: "Vanguard S&P", weightPct: 30, marketValueCLP: 42600000 }],
        cash: [{ name: "Caja", weightPct: 5, marketValueCLP: 7100000 }],
      },
    }));
    // VOO (30%) should appear before UST (20%) before Banchile (15%) before AAPL (10%)
    const vooIdx = html.indexOf("VOO");
    const ustIdx = html.indexOf("UST 4.5%");
    const banchileIdx = html.indexOf("Banchile RV");
    const aaplIdx = html.indexOf("AAPL");
    expect(vooIdx).toBeLessThan(ustIdx);
    expect(ustIdx).toBeLessThan(banchileIdx);
    expect(banchileIdx).toBeLessThan(aaplIdx);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/radiografia-email.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement buildRadiografiaHTML**

```typescript
// lib/radiografia-email.ts

export interface RadiografiaEmailData {
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

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

const PROFILE_LABELS: Record<string, string> = {
  conservador: "Conservador",
  moderado_conservador: "Moderado Conservador",
  moderado: "Moderado",
  moderado_agresivo: "Moderado Agresivo",
  agresivo: "Agresivo",
};

const ROLE_LABELS: Record<string, string> = {
  rv: "Renta Variable",
  rf: "Renta Fija",
  alt: "Alternativos",
  cash: "Caja",
};

const ROLE_COLORS: Record<string, string> = {
  rv: "#3b82f6",
  rf: "#10b981",
  alt: "#8b5cf6",
  cash: "#94a3b8",
};

const OBS_COLORS: Record<string, { border: string; bg: string; text: string }> = {
  alta: { border: "#ef4444", bg: "#fef2f2", text: "#991b1b" },
  media: { border: "#f59e0b", bg: "#fffbeb", text: "#92400e" },
  info: { border: "#3b82f6", bg: "#eff6ff", text: "#1e40af" },
};

function formatCLP(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function formatUSD(value: number): string {
  if (value >= 1e6) return `USD $${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `USD $${(value / 1e3).toFixed(0)}K`;
  return `USD $${value.toFixed(0)}`;
}

function deltaColor(delta: number): { text: string; bg: string } {
  const abs = Math.abs(delta);
  if (abs <= 3) return { text: "#166534", bg: "#f0fdf4" };
  if (abs <= 10) return { text: "#92400e", bg: "#fffbeb" };
  return { text: "#991b1b", bg: "#fef2f2" };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildDonutSVG(
  segments: Array<{ pct: number; color: string }>,
  label: string,
  sublabel: string,
): string {
  const size = 120;
  const r = 50;
  const strokeWidth = 12;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  const circles = segments
    .filter((s) => s.pct > 0)
    .map((s) => {
      const dashLen = (s.pct / 100) * circumference;
      const circle = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${strokeWidth}" stroke-dasharray="${dashLen.toFixed(1)} ${circumference.toFixed(1)}" stroke-dashoffset="${(-offset).toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>`;
      offset += dashLen;
      return circle;
    })
    .join("\n    ");

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#f1f5f9" stroke-width="${strokeWidth}"/>
    ${circles}
    <text x="${size / 2}" y="${size / 2 + 4}" text-anchor="middle" font-size="12" fill="#64748b" font-family="${FONT}">${escapeHtml(sublabel)}</text>
  </svg>`;
}

function buildAllocationSection(allocation: Record<string, { actual: number; target: number; delta: number }>): string {
  const roles = ["rv", "rf", "alt", "cash"];

  const bars = roles
    .map((role) => {
      const a = allocation[role];
      if (!a) return "";
      const maxPct = Math.max(a.actual, a.target, 1);
      const dc = deltaColor(a.delta);
      const sign = a.delta > 0 ? "+" : "";
      return `
      <div style="margin-bottom:14px;">
        <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;">
          <span style="color:#1e293b; font-weight:500; font-family:${FONT};">${ROLE_LABELS[role]}</span>
          <span style="color:${dc.text}; font-weight:600; background:${dc.bg}; padding:1px 8px; border-radius:10px; font-size:11px; font-family:${FONT};">${sign}${a.delta.toFixed(1)}pp</span>
        </div>
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:2px;">
          <span style="font-size:10px; color:#94a3b8; width:40px; font-family:${FONT};">Actual</span>
          <div style="flex:1; height:14px; background:#f1f5f9; border-radius:7px; overflow:hidden;">
            <div style="width:${Math.min((a.actual / maxPct) * 100, 100).toFixed(0)}%; height:100%; background:${ROLE_COLORS[role]}; border-radius:7px;"></div>
          </div>
          <span style="font-size:11px; font-family:monospace; width:40px; text-align:right; font-weight:600; color:#1e293b;">${a.actual.toFixed(1)}%</span>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:10px; color:#94a3b8; width:40px; font-family:${FONT};">Modelo</span>
          <div style="flex:1; height:14px; background:#f1f5f9; border-radius:7px; overflow:hidden;">
            <div style="width:${Math.min((a.target / maxPct) * 100, 100).toFixed(0)}%; height:100%; background:${ROLE_COLORS[role]}; border-radius:7px; opacity:0.3;"></div>
          </div>
          <span style="font-size:11px; font-family:monospace; color:#94a3b8; width:40px; text-align:right;">${a.target.toFixed(1)}%</span>
        </div>
      </div>`;
    })
    .join("");

  const actualSegments = roles
    .filter((r) => allocation[r] && allocation[r].actual > 0)
    .map((r) => ({ pct: allocation[r].actual, color: ROLE_COLORS[r] }));
  const targetSegments = roles
    .filter((r) => allocation[r] && allocation[r].target > 0)
    .map((r) => ({ pct: allocation[r].target, color: ROLE_COLORS[r] }));

  const actualDonut = buildDonutSVG(actualSegments, "Tu Cartera", `${Math.round(actualSegments.reduce((s, x) => s + x.pct, 0))}%`);
  const targetDonut = buildDonutSVG(targetSegments, "Modelo", "Objetivo");

  return `
    <div style="padding:24px 32px; border-bottom:1px solid #e2e8f0;">
      <div style="font-size:14px; font-weight:600; color:#1e293b; margin-bottom:16px; font-family:${FONT};">Asset Allocation vs Modelo</div>
      ${bars}
      <div style="display:flex; justify-content:center; gap:40px; margin-top:20px;">
        <div style="text-align:center;">
          <div style="font-size:10px; text-transform:uppercase; letter-spacing:1px; color:#94a3b8; margin-bottom:8px; font-family:${FONT};">Tu Cartera</div>
          ${actualDonut}
        </div>
        <div style="text-align:center;">
          <div style="font-size:10px; text-transform:uppercase; letter-spacing:1px; color:#94a3b8; margin-bottom:8px; font-family:${FONT};">Modelo</div>
          ${targetDonut}
        </div>
      </div>
    </div>`;
}

interface HoldingRow {
  name: string;
  ticker: string | null;
  tipo: string;
  weightPct: number;
  valor: string;
}

function buildHoldingsSection(ib: RadiografiaEmailData["instrumentBreakdown"]): string {
  const rows: HoldingRow[] = [];
  for (const s of ib.stocks) rows.push({ name: s.name, ticker: s.ticker, tipo: "Accion", weightPct: s.weightPct, valor: formatCLP(s.marketValueCLP) });
  for (const f of ib.funds) rows.push({ name: f.fundName, ticker: null, tipo: "Fondo", weightPct: f.weightPct, valor: formatCLP(f.marketValueCLP) });
  for (const b of ib.bonds) rows.push({ name: b.name, ticker: null, tipo: "Bono", weightPct: b.weightPct, valor: formatUSD(b.marketValueUSD) });
  for (const e of ib.etfs) rows.push({ name: e.name, ticker: e.ticker, tipo: "ETF", weightPct: e.weightPct, valor: formatCLP(e.marketValueCLP) });
  for (const c of ib.cash) rows.push({ name: c.name, ticker: null, tipo: "Caja", weightPct: c.weightPct, valor: formatCLP(c.marketValueCLP) });

  rows.sort((a, b) => b.weightPct - a.weightPct);
  const top = rows.slice(0, 10);

  const rowsHtml = top
    .map(
      (r) => `
        <tr style="border-bottom:1px solid #f8fafc;">
          <td style="padding:8px 0; font-weight:600; color:#1e293b; font-family:${FONT};">${r.ticker ? `<span style="font-family:monospace; background:#f1f5f9; padding:2px 6px; border-radius:4px; margin-right:6px; font-size:11px;">${escapeHtml(r.ticker)}</span>` : ""}${escapeHtml(r.name)}</td>
          <td style="padding:8px 0; color:#64748b; font-family:${FONT}; font-size:12px;">${r.tipo}</td>
          <td style="padding:8px 0; text-align:right; font-family:monospace; font-weight:600; font-size:12px;">${r.weightPct.toFixed(1)}%</td>
          <td style="padding:8px 0; text-align:right; font-family:monospace; font-size:12px; color:#475569;">${r.valor}</td>
        </tr>`,
    )
    .join("");

  return `
    <div style="padding:24px 32px; border-bottom:1px solid #e2e8f0;">
      <div style="font-size:14px; font-weight:600; color:#1e293b; margin-bottom:12px; font-family:${FONT};">Principales Posiciones</div>
      <table style="width:100%; border-collapse:collapse; font-size:12px;">
        <tr style="border-bottom:1px solid #f1f5f9;">
          <th style="text-align:left; padding:6px 0; color:#94a3b8; font-weight:500; font-family:${FONT};">Instrumento</th>
          <th style="text-align:left; padding:6px 0; color:#94a3b8; font-weight:500; font-family:${FONT};">Tipo</th>
          <th style="text-align:right; padding:6px 0; color:#94a3b8; font-weight:500; font-family:${FONT};">Peso</th>
          <th style="text-align:right; padding:6px 0; color:#94a3b8; font-weight:500; font-family:${FONT};">Valor</th>
        </tr>
        ${rowsHtml}
      </table>
    </div>`;
}

function buildObservationsSection(observations: RadiografiaEmailData["observations"]): string {
  if (observations.length === 0) return "";
  const items = observations
    .map((o) => {
      const c = OBS_COLORS[o.severity] || OBS_COLORS.info;
      return `<div style="padding:10px 14px; background:${c.bg}; border-left:4px solid ${c.border}; border-radius:0 6px 6px 0; margin-bottom:8px;">
        <div style="font-size:12px; color:${c.text}; font-family:${FONT};">${escapeHtml(o.text)}</div>
      </div>`;
    })
    .join("");

  return `
    <div style="padding:24px 32px; border-bottom:1px solid #e2e8f0;">
      <div style="font-size:14px; font-weight:600; color:#1e293b; margin-bottom:12px; font-family:${FONT};">Observaciones</div>
      ${items}
    </div>`;
}

function buildNarrativeSection(narrative: string): string {
  const paragraphs = narrative
    .split("\n\n")
    .filter((p) => p.trim())
    .map((p) => `<div style="font-size:13px; color:#475569; line-height:1.7; margin-bottom:12px; font-family:${FONT};">${escapeHtml(p)}</div>`)
    .join("");

  return `
    <div style="padding:24px 32px; border-bottom:1px solid #e2e8f0;">
      <div style="font-size:14px; font-weight:600; color:#1e293b; margin-bottom:12px; font-family:${FONT};">Diagnostico</div>
      ${paragraphs}
    </div>`;
}

export function buildRadiografiaHTML(data: RadiografiaEmailData): string {
  const profileLabel = PROFILE_LABELS[data.perfilCliente] || data.perfilCliente;
  const modelLabel = PROFILE_LABELS[data.perfilModelo] || data.perfilModelo;

  const header = `
    <div style="background:#1e293b; color:white; padding:24px 32px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div style="font-size:11px; text-transform:uppercase; letter-spacing:1.5px; color:#94a3b8; margin-bottom:4px; font-family:${FONT};">Greybark Advisors</div>
          <div style="font-size:20px; font-weight:600; font-family:${FONT};">Radiografia de Cartera</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:14px; font-weight:500; font-family:${FONT};">${escapeHtml(data.clientName)}</div>
          <div style="font-size:12px; color:#94a3b8; font-family:${FONT};">${escapeHtml(data.reportDate)}</div>
        </div>
      </div>
      <div style="margin-top:12px; display:flex; gap:12px;">
        <div style="background:#334155; padding:6px 12px; border-radius:6px; font-size:12px; font-family:${FONT};">
          <span style="color:#94a3b8;">Perfil:</span> ${escapeHtml(profileLabel)}
        </div>
        <div style="background:#334155; padding:6px 12px; border-radius:6px; font-size:12px; font-family:${FONT};">
          <span style="color:#94a3b8;">Valor:</span> ${formatCLP(data.totalValueCLP)}
        </div>
        <div style="background:#334155; padding:6px 12px; border-radius:6px; font-size:12px; font-family:${FONT};">
          <span style="color:#94a3b8;">Modelo:</span> ${escapeHtml(modelLabel)}
        </div>
      </div>
    </div>`;

  const allocation = buildAllocationSection(data.allocation);
  const holdings = buildHoldingsSection(data.instrumentBreakdown);
  const observations = buildObservationsSection(data.observations);
  const narrative = data.narrative ? buildNarrativeSection(data.narrative) : "";

  const footer = `
    <div style="padding:20px 32px; background:#f8fafc;">
      <div style="font-size:11px; color:#94a3b8; text-align:center; font-family:${FONT};">
        Greybark Advisors &mdash; Este reporte es informativo y no constituye recomendacion de inversion.
        <br/>Para ver la radiografia completa, <a href="${escapeHtml(data.platformUrl)}" style="color:#3b82f6; text-decoration:underline;">ingresa a la plataforma</a>.
      </div>
    </div>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Radiografia — ${escapeHtml(data.clientName)}</title>
</head>
<body style="margin:0; padding:0; background:#f1f5f9; font-family:${FONT};">
  <div style="max-width:600px; margin:0 auto; background:#ffffff;">
    ${header}
    ${allocation}
    ${holdings}
    ${observations}
    ${narrative}
    ${footer}
  </div>
</body>
</html>`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/radiografia-email.test.ts`
Expected: 12 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/radiografia-email.ts lib/radiografia-email.test.ts
git commit -m "feat: buildRadiografiaHTML email generator with inline CSS/SVG charts"
```

---

### Task 2: Send Email API Endpoint

**Files:**
- Create: `app/api/portfolio/radiografia/send-email/route.ts`

- [ ] **Step 1: Create the send-email endpoint**

```typescript
// app/api/portfolio/radiografia/send-email/route.ts
import { NextRequest } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";
import { buildRadiografiaHTML, type RadiografiaEmailData } from "@/lib/radiografia-email";
import { Resend } from "resend";

export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "radiografia-send-email", { limit: 5 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  return handleApiError("radiografia-send-email", async () => {
    const body = await request.json();
    const { clientId, recipientEmail, radiografiaData } = body as {
      clientId: string;
      recipientEmail: string;
      radiografiaData: RadiografiaEmailData;
    };

    if (!clientId || !recipientEmail || !radiografiaData) {
      return errorResponse("Datos requeridos: clientId, recipientEmail, radiografiaData", 400);
    }

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
      return errorResponse("Email invalido", 400);
    }

    // Validate client belongs to advisor
    const supabase = createAdminClient();
    const { data: client } = await supabase
      .from("clients")
      .select("id, name")
      .eq("id", clientId)
      .eq("advisor_id", advisor!.id)
      .single();

    if (!client) {
      return errorResponse("Cliente no encontrado", 404);
    }

    // Build HTML
    const html = buildRadiografiaHTML(radiografiaData);

    // Send via Resend
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      return errorResponse("Email service no configurado", 500);
    }

    const resend = new Resend(resendKey);
    const senderEmail = process.env.SENDER_EMAIL || "noreply@greybark.cl";

    const { data: emailResult, error: emailError } = await resend.emails.send({
      from: `Greybark Advisors <${senderEmail}>`,
      to: recipientEmail,
      subject: `Radiografia de Cartera — ${radiografiaData.clientName} — ${radiografiaData.reportDate}`,
      html,
    });

    if (emailError) {
      console.error("Resend error:", emailError);
      return errorResponse("Error al enviar email", 500);
    }

    return successResponse({
      messageId: emailResult?.id || "sent",
    });
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep -v "rate-limit.test.ts"`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add app/api/portfolio/radiografia/send-email/route.ts
git commit -m "feat: add send-email API endpoint for radiografia reports"
```

---

### Task 3: Lift Narrative State + NarrativeAnalysis Callback

**Files:**
- Modify: `components/recomendacion/NarrativeAnalysis.tsx`

- [ ] **Step 1: Add onNarrativeGenerated callback prop to NarrativeAnalysis**

In `components/recomendacion/NarrativeAnalysis.tsx`, add the callback to the Props interface and call it when narrative is generated.

Add `onNarrativeGenerated` to the Props interface (after `notaComite`):

```typescript
  onNarrativeGenerated?: (text: string) => void;
```

Add it to the destructured props:

```typescript
export default function NarrativeAnalysis({
  clientName,
  allocation,
  observations,
  sectorBreakdown,
  totalValueCLP,
  perfilCliente,
  perfilModelo,
  notaComite,
  onNarrativeGenerated,
}: Props) {
```

In the `generateNarrative` function, after `setNarrative(data.narrative)`, add:

```typescript
        onNarrativeGenerated?.(data.narrative);
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep -v "rate-limit.test.ts"`
Expected: No new errors (existing callers don't pass the prop — it's optional)

- [ ] **Step 3: Commit**

```bash
git add components/recomendacion/NarrativeAnalysis.tsx
git commit -m "feat: add onNarrativeGenerated callback to NarrativeAnalysis"
```

---

### Task 4: SendReportModal Component

**Files:**
- Create: `components/recomendacion/SendReportModal.tsx`

- [ ] **Step 1: Create SendReportModal**

```tsx
// components/recomendacion/SendReportModal.tsx
"use client";

import React, { useState, useMemo } from "react";
import { X, Mail, Loader, CheckCircle } from "lucide-react";
import { buildRadiografiaHTML, type RadiografiaEmailData } from "@/lib/radiografia-email";

interface RadiografiaData {
  clientId: string;
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
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  data: RadiografiaData;
  clientEmail: string;
  narrative: string | null;
}

export default function SendReportModal({ isOpen, onClose, data, clientEmail, narrative }: Props) {
  const [email, setEmail] = useState(clientEmail);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailData: RadiografiaEmailData = useMemo(() => ({
    clientName: data.clientName,
    reportDate: data.reportDate,
    perfilCliente: data.perfilCliente,
    perfilModelo: data.perfilModelo,
    totalValueCLP: data.totalValueCLP,
    allocation: data.allocation,
    instrumentBreakdown: data.instrumentBreakdown,
    observations: data.observations,
    narrative,
    platformUrl: typeof window !== "undefined" ? `${window.location.origin}/recomendacion/${data.clientId}` : "",
  }), [data, narrative]);

  const previewHtml = useMemo(() => buildRadiografiaHTML(emailData), [emailData]);

  const handleSend = async () => {
    if (!email.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/portfolio/radiografia/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: data.clientId,
          recipientEmail: email.trim(),
          radiografiaData: emailData,
        }),
      });
      const result = await res.json();
      if (result.success) {
        setSent(true);
        setTimeout(() => onClose(), 2000);
      } else {
        setError(result.error || "Error al enviar");
      }
    } catch {
      setError("Error de conexion");
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50 }}>
      {/* Overlay */}
      <div
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }}
        onClick={onClose}
      />

      {/* Modal */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 16 }}>
        <div className="bg-white rounded-xl shadow-2xl" style={{ width: "100%", maxWidth: 720, maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
          {/* Header */}
          <div className="px-6 py-4 border-b border-gb-border flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gb-black">Enviar Radiografia por Email</h2>
              <p className="text-xs text-gb-gray mt-0.5">Vista previa del reporte que recibira el cliente</p>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-md transition-colors">
              <X className="w-5 h-5 text-gb-gray" />
            </button>
          </div>

          {/* Email input */}
          <div className="px-6 py-3 border-b border-gb-border">
            <label className="text-xs font-medium text-gb-gray block mb-1">Destinatario</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@cliente.com"
              className="w-full px-3 py-2 text-sm border border-gb-border rounded-md focus:outline-none focus:ring-2 focus:ring-gb-primary/20 focus:border-gb-primary"
              disabled={sending || sent}
            />
          </div>

          {/* Preview iframe */}
          <div className="flex-1 overflow-hidden px-6 py-3" style={{ minHeight: 300, maxHeight: 500 }}>
            <div className="border border-gb-border rounded-lg overflow-hidden h-full">
              <iframe
                srcDoc={previewHtml}
                title="Vista previa del reporte"
                style={{ width: "100%", height: "100%", border: "none", minHeight: 280 }}
                sandbox="allow-same-origin"
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="px-6 py-2">
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</p>
            </div>
          )}

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gb-border flex items-center justify-end gap-3">
            {sent ? (
              <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
                <CheckCircle className="w-4 h-4" />
                Enviado correctamente
              </div>
            ) : (
              <>
                <button
                  onClick={onClose}
                  disabled={sending}
                  className="px-4 py-2 text-sm font-medium border border-gb-border rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSend}
                  disabled={sending || !email.trim()}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gb-primary rounded-lg hover:bg-gb-primary/90 disabled:opacity-50 transition-colors"
                >
                  {sending ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Mail className="w-4 h-4" />
                      Enviar Reporte
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep -v "rate-limit.test.ts"`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add components/recomendacion/SendReportModal.tsx
git commit -m "feat: SendReportModal with preview iframe and email sending"
```

---

### Task 5: Integrate into RecomendacionPage

**Files:**
- Modify: `components/recomendacion/RecomendacionPage.tsx`

- [ ] **Step 1: Add imports, state, and email button to RecomendacionPage**

In `components/recomendacion/RecomendacionPage.tsx`:

Add `Mail` to the lucide import:

```typescript
import { Loader, RefreshCw, AlertTriangle, Mail } from "lucide-react";
```

Add SendReportModal import after the TradeSuggestions import:

```typescript
import SendReportModal from "./SendReportModal";
```

Add state variables after the existing `error` state (line 133):

```typescript
  const [narrativeText, setNarrativeText] = useState<string | null>(null);
  const [showSendModal, setShowSendModal] = useState(false);
  const [clientEmail, setClientEmail] = useState<string>("");
```

Add a function to fetch client email, after `fetchRadiografia`:

```typescript
  const openSendModal = useCallback(async () => {
    if (!clientEmail) {
      try {
        const res = await fetch(`/api/clients/${clientId}`);
        const d = await res.json();
        if (d.success && d.data?.email) {
          setClientEmail(d.data.email);
        }
      } catch { /* ignore */ }
    }
    setShowSendModal(true);
  }, [clientId, clientEmail]);
```

- [ ] **Step 2: Add "Enviar por Email" button next to "Actualizar"**

Replace the single "Actualizar" button div (lines 211-218) with both buttons:

```tsx
        <div className="flex items-center gap-2">
          <button
            onClick={openSendModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-gb-primary rounded-md hover:bg-gb-primary/90 transition-colors"
          >
            <Mail className="w-3.5 h-3.5" />
            Enviar por Email
          </button>
          <button
            onClick={fetchRadiografia}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gb-border rounded-md hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Actualizar
          </button>
        </div>
```

- [ ] **Step 3: Add onNarrativeGenerated callback to NarrativeAnalysis**

Replace the NarrativeAnalysis usage (around line 280) to add the callback:

```tsx
      <NarrativeAnalysis
        clientId={data.clientId}
        clientName={data.clientName}
        allocation={data.allocation}
        observations={data.observations}
        sectorBreakdown={data.sectorBreakdown}
        totalValueCLP={data.totalValueCLP}
        perfilCliente={data.perfilCliente}
        perfilModelo={data.perfilModelo}
        notaComite={data.notaComite}
        onNarrativeGenerated={setNarrativeText}
      />
```

- [ ] **Step 4: Add SendReportModal at the end of the component (before closing div)**

Before the final `</div>` of the return statement:

```tsx
      {/* Send Report Modal */}
      <SendReportModal
        isOpen={showSendModal}
        onClose={() => { setShowSendModal(false); }}
        data={data}
        clientEmail={clientEmail}
        narrative={narrativeText}
      />
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep -v "rate-limit.test.ts"`
Expected: No new errors

- [ ] **Step 6: Run all tests**

Run: `npx vitest run`
Expected: All radiografia tests pass (instrument-type: 12, observations: 7, radiografia-email: 12)

- [ ] **Step 7: Commit**

```bash
git add components/recomendacion/RecomendacionPage.tsx
git commit -m "feat: integrate SendReportModal into RecomendacionPage"
```

---

### Task 6: Integration Verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (including new radiografia-email tests)

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit 2>&1 | grep -v "rate-limit.test.ts"`
Expected: Clean compile

- [ ] **Step 3: Verify dev server loads**

Run: `npm run dev` and navigate to `/recomendacion`, select a client. Verify:
- "Enviar por Email" button appears in header
- Clicking it opens the modal with email preview
- Preview shows all sections (header, bars, donuts, holdings, observations)
- Email input is pre-filled if client has email
- Cancel closes the modal

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: radiografia email report integration verification"
```
