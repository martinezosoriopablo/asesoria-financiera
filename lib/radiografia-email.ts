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
          <div style="font-size:11px; text-transform:uppercase; letter-spacing:1.5px; color:#94a3b8; margin-bottom:4px; font-family:${FONT};">Global</div>
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
        Global &mdash; Este reporte es informativo y no constituye recomendacion de inversion.
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
