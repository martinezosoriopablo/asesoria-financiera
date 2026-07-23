export interface SeguimientoEmailData {
  clientName: string;
  reportDate: string;
  perfilCliente: string;
  totalValueCLP: number;
  displayCurrency: string; // "CLP" | "USD" | "UF"
  exchangeRates: { usd: number; uf: number };          // tasa de hoy (footer / fallback)
  ratesInitial?: { usd: number; uf: number };          // tasa a la fecha de INICIO del período
  ratesFinal?: { usd: number; uf: number };            // tasa a la fecha de FIN del período
  composition: {
    equity: { initial: number; final: number; returnPct: number };
    fixedIncome: { initial: number; final: number; returnPct: number };
    alternatives: { initial: number; final: number; returnPct: number };
    cash: { initial: number; final: number; returnPct: number };
  };
  periodReturns: Record<string, { nominal: number | null; real: number | null; usd: number | null }>;
  distribution: {
    byAssetType: Array<{ label: string; pct: number }>;
    byCurrency: Array<{ label: string; pct: number }>;
  };
  benchmarkComparison: {
    label: string;
    periods: Record<string, { portfolio: number | null; benchmark: number | null; diff: number | null }>;
  } | null;
  holdingReturns: Array<{ name: string; assetType: string; returnPct: number }>;
  attribution: Array<{ name: string; instrumentType: string; contributionPp: number }>;
  monthlyReturn: number | null; // total portfolio return for the report month
  netCashFlowCLP?: number | null; // aportes(+)/retiros(-) netos del periodo (no es rentabilidad)
  narrative: string | null;
  platformUrl: string;
  returnsBasis?: { fromDate: string; toDate: string; isMonthly?: boolean }; // dates for disclaimer
}

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

const PROFILE_LABELS: Record<string, string> = {
  conservador: "Conservador",
  moderado_conservador: "Moderado Conservador",
  moderado: "Moderado",
  moderado_agresivo: "Moderado Agresivo",
  agresivo: "Agresivo",
};

// Global Advisors brand colors
const BRAND = {
  navy: "#0B2140",
  ring: "#0F2D54",
  copper: "#EB7838",
  azure: "#5AA0E6",
  mist: "#F7F6F2",
  line: "#E7E4DD",
  textSecondary: "#9DB0CA",
  up: "#2ECC8F",
  down: "#EF5B5B",
};

const CLASS_COLORS: Record<string, string> = {
  equity: "#3b82f6",
  fixedIncome: "#10b981",
  alternatives: "#8b5cf6",
  cash: "#94a3b8",
};

const CLASS_LABELS: Record<string, string> = {
  equity: "Renta Variable",
  fixedIncome: "Renta Fija",
  alternatives: "Alternativos",
  cash: "Caja",
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatCLP(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function formatValue(clp: number, currency: string, rates: { usd: number; uf: number }): string {
  if (currency === "USD" && rates.usd > 0) {
    const usd = clp / rates.usd;
    if (usd >= 1e6) return `USD $${(usd / 1e6).toFixed(1)}M`;
    if (usd >= 1e3) return `USD $${(usd / 1e3).toFixed(0)}K`;
    return `USD $${usd.toFixed(0)}`;
  }
  if (currency === "UF" && rates.uf > 0) {
    const uf = clp / rates.uf;
    return `UF ${uf.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
  }
  return formatCLP(clp);
}

function returnCell(val: number | null): string {
  if (val === null) return `<td style="padding:8px 12px; text-align:right; font-family:monospace; font-size:12px; color:#a9a49c;">&mdash;</td>`;
  const color = val >= 0 ? "#166534" : "#991b1b";
  const bg = val >= 0 ? "#f0fdf4" : "#fef2f2";
  const sign = val > 0 ? "+" : "";
  return `<td style="padding:8px 12px; text-align:right; font-family:monospace; font-size:12px; font-weight:600; color:${color}; background:${bg};">${sign}${val.toFixed(1)}%</td>`;
}

// Inline SVG logo for email (white ring, copper bars)
const LOGO_SVG = `<svg viewBox="0 0 100 100" width="32" height="32" style="vertical-align:middle;"><path d="M82.34 39.5 A34 34 0 1 0 82.34 60.5" fill="none" stroke="#FFFFFF" stroke-width="13" stroke-linecap="round"/><path d="M53 50 L85 50" fill="none" stroke="${BRAND.copper}" stroke-width="13" stroke-linecap="round"/></svg>`;

function buildHeader(data: SeguimientoEmailData): string {
  const profileLabel = PROFILE_LABELS[data.perfilCliente] || data.perfilCliente;
  const displayValue = formatValue(data.totalValueCLP, data.displayCurrency, data.ratesFinal || data.exchangeRates);

  return `
    <div style="background:${BRAND.navy}; color:white; padding:24px 32px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>
          <td style="vertical-align:middle;">
            <div style="margin-bottom:6px;">${LOGO_SVG} <span style="font-size:16px; font-weight:700; letter-spacing:1px; color:white; vertical-align:middle; font-family:${FONT}; margin-left:4px;">Global</span></div>
            <div style="font-size:16px; font-weight:600; color:${BRAND.copper}; font-family:${FONT};">Reporte de Seguimiento</div>
          </td>
          <td style="text-align:right; vertical-align:middle;">
            <div style="font-size:14px; font-weight:600; color:white; font-family:${FONT};">${escapeHtml(data.clientName)}</div>
            <div style="font-size:12px; color:${BRAND.textSecondary}; font-family:${FONT};">${escapeHtml(data.reportDate)}</div>
          </td>
        </tr>
      </table>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse; margin-top:12px;">
        <tr>
          <td style="background:${BRAND.ring}; padding:5px 12px; border-radius:6px; font-size:12px; font-family:${FONT}; color:white;">
            <span style="color:${BRAND.copper};">Perfil:</span> ${escapeHtml(profileLabel)}
          </td>
          <td style="width:8px;"></td>
          <td style="background:${BRAND.ring}; padding:5px 12px; border-radius:6px; font-size:12px; font-family:${FONT}; color:white;">
            <span style="color:${BRAND.copper};">Valor:</span> ${displayValue}
          </td>
        </tr>
      </table>
    </div>`;
}

function buildMonthlySummary(data: SeguimientoEmailData): string {
  if (data.monthlyReturn === null) return "";

  const ret = data.monthlyReturn;
  const color = ret >= 0 ? BRAND.up : BRAND.down;
  const sign = ret > 0 ? "+" : "";
  const displayValue = formatValue(data.totalValueCLP, data.displayCurrency, data.ratesFinal || data.exchangeRates);
  const basisLabel = data.returnsBasis
    ? `${data.returnsBasis.fromDate} — ${data.returnsBasis.toDate}`
    : "";

  return `
    <div style="padding:24px 32px; border-bottom:1px solid #E7E4DD;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>
          <td style="vertical-align:top;">
            <div style="font-size:12px; color:#a9a49c; font-weight:500; font-family:${FONT}; margin-bottom:4px;">Valor del Portafolio</div>
            <div style="font-size:22px; font-weight:700; color:${BRAND.navy}; font-family:${FONT};">${displayValue}</div>
          </td>
          <td style="text-align:right; vertical-align:top;">
            <div style="font-size:12px; color:#a9a49c; font-weight:500; font-family:${FONT}; margin-bottom:4px;">Variacion del Mes</div>
            <div style="font-size:22px; font-weight:700; color:${color}; font-family:${FONT};">${sign}${ret.toFixed(2)}%</div>
          </td>
        </tr>
      </table>
      ${basisLabel ? `<div style="font-size:11px; color:#a9a49c; margin-top:8px; font-family:${FONT};">${escapeHtml(basisLabel)}</div>` : ""}
    </div>`;
}

function buildCompositionSection(composition: SeguimientoEmailData["composition"], currency: string, ratesInitial: { usd: number; uf: number }, ratesFinal: { usd: number; uf: number }, returnsBasis?: { fromDate: string; toDate: string }, netCashFlowCLP?: number | null): string {
  const classes = ["equity", "fixedIncome", "alternatives", "cash"] as const;

  const rows = classes
    .map((cls) => {
      const c = composition[cls];
      const color = CLASS_COLORS[cls];
      const label = CLASS_LABELS[cls];
      const retColor = c.returnPct >= 0 ? "#166534" : "#991b1b";
      const retBg = c.returnPct >= 0 ? "#f0fdf4" : "#fef2f2";
      const sign = c.returnPct > 0 ? "+" : "";
      return `
        <tr style="border-bottom:1px solid #F7F6F2;">
          <td style="padding:10px 12px; border-left:4px solid ${color}; font-weight:500; font-size:13px; color:#0B2140; font-family:${FONT};">${label}</td>
          <td style="padding:10px 12px; text-align:right; font-family:monospace; font-size:12px; color:#6E7787;">${formatValue(c.initial, currency, ratesInitial)}</td>
          <td style="padding:10px 12px; text-align:right; font-family:monospace; font-size:12px; font-weight:600; color:#0B2140;">${formatValue(c.final, currency, ratesFinal)}</td>
          <td style="padding:10px 12px; text-align:right; font-family:monospace; font-size:12px; font-weight:600; color:${retColor}; background:${retBg};">${sign}${c.returnPct.toFixed(1)}%</td>
        </tr>`;
    })
    .join("");

  const basisNote = returnsBasis
    ? `<div style="font-size:11px; color:#a9a49c; margin-bottom:12px; font-family:${FONT};">Retornos del periodo: ${escapeHtml(returnsBasis.fromDate)} al ${escapeHtml(returnsBasis.toDate)}</div>`
    : "";

  // Aportes/retiros netos: cambio de valor no explicado por rentabilidad.
  const flowNote = (netCashFlowCLP != null && Math.abs(netCashFlowCLP) > 1)
    ? `<div style="font-size:11px; color:#6E7787; margin-top:10px; font-family:${FONT};">${netCashFlowCLP >= 0 ? "Aportes" : "Retiros"} netos del periodo: ${formatValue(Math.abs(netCashFlowCLP), currency, ratesFinal)} <span style="color:#a9a49c;">(no se contabilizan como rentabilidad)</span></div>`
    : "";

  return `
    <div style="padding:24px 32px; border-bottom:1px solid #E7E4DD;">
      <div style="font-size:14px; font-weight:600; color:${BRAND.navy}; margin-bottom:4px; font-family:${FONT};">Composicion</div>
      ${basisNote}
      <table style="width:100%; border-collapse:collapse; font-size:12px;">
        <tr style="border-bottom:1px solid #E7E4DD;">
          <th style="text-align:left; padding:6px 12px; color:#a9a49c; font-weight:500; font-family:${FONT};">Clase</th>
          <th style="text-align:right; padding:6px 12px; color:#a9a49c; font-weight:500; font-family:${FONT};">Inicio</th>
          <th style="text-align:right; padding:6px 12px; color:#a9a49c; font-weight:500; font-family:${FONT};">Final</th>
          <th style="text-align:right; padding:6px 12px; color:#a9a49c; font-weight:500; font-family:${FONT};">Retorno</th>
        </tr>
        ${rows}
      </table>
      ${flowNote}
    </div>`;
}

function buildPeriodReturnsSection(periodReturns: SeguimientoEmailData["periodReturns"]): string {
  const periodOrder = ["1M", "3M", "6M", "1Y", "YTD"];
  const periods = periodOrder.filter((p) => p in periodReturns);

  // Check if any period has USD data to decide whether to show that column
  const hasUsd = periods.some((p) => periodReturns[p].usd !== null);

  const rows = periods
    .map((p) => {
      const r = periodReturns[p];
      return `
        <tr style="border-bottom:1px solid #F7F6F2;">
          <td style="padding:8px 12px; font-weight:500; font-size:13px; color:#0B2140; font-family:${FONT};">${escapeHtml(p)}</td>
          ${returnCell(r.nominal)}
          ${hasUsd ? returnCell(r.usd) : ""}
        </tr>`;
    })
    .join("");

  return `
    <div style="padding:24px 32px; border-bottom:1px solid #E7E4DD;">
      <div style="font-size:14px; font-weight:600; color:${BRAND.navy}; margin-bottom:12px; font-family:${FONT};">Rentabilidad por Periodo</div>
      <table style="width:100%; border-collapse:collapse; font-size:12px;">
        <tr style="border-bottom:1px solid #E7E4DD;">
          <th style="text-align:left; padding:6px 12px; color:#a9a49c; font-weight:500; font-family:${FONT};">Periodo</th>
          <th style="text-align:right; padding:6px 12px; color:#a9a49c; font-weight:500; font-family:${FONT};">Nominal</th>
          ${hasUsd ? `<th style="text-align:right; padding:6px 12px; color:#a9a49c; font-weight:500; font-family:${FONT};">USD</th>` : ""}
        </tr>
        ${rows}
      </table>
    </div>`;
}


function buildBenchmarkSection(bm: NonNullable<SeguimientoEmailData["benchmarkComparison"]>): string {
  const periodOrder = ["1M", "3M", "6M", "1Y", "YTD"];
  const periods = periodOrder.filter((p) => p in bm.periods);

  const rows = periods
    .map((p) => {
      const d = bm.periods[p];
      return `
        <tr style="border-bottom:1px solid #F7F6F2;">
          <td style="padding:8px 12px; font-weight:500; font-size:13px; color:#0B2140; font-family:${FONT};">${escapeHtml(p)}</td>
          ${returnCell(d.portfolio)}
          ${returnCell(d.benchmark)}
          ${returnCell(d.diff)}
        </tr>`;
    })
    .join("");

  return `
    <div style="padding:24px 32px; border-bottom:1px solid #E7E4DD;">
      <div style="font-size:14px; font-weight:600; color:${BRAND.navy}; margin-bottom:4px; font-family:${FONT};">Benchmark</div>
      <div style="font-size:12px; color:#6E7787; margin-bottom:12px; font-family:${FONT};">${escapeHtml(bm.label)}</div>
      <table style="width:100%; border-collapse:collapse; font-size:12px;">
        <tr style="border-bottom:1px solid #E7E4DD;">
          <th style="text-align:left; padding:6px 12px; color:#a9a49c; font-weight:500; font-family:${FONT};">Periodo</th>
          <th style="text-align:right; padding:6px 12px; color:#a9a49c; font-weight:500; font-family:${FONT};">Portafolio</th>
          <th style="text-align:right; padding:6px 12px; color:#a9a49c; font-weight:500; font-family:${FONT};">Benchmark</th>
          <th style="text-align:right; padding:6px 12px; color:#a9a49c; font-weight:500; font-family:${FONT};">Diferencia</th>
        </tr>
        ${rows}
      </table>
    </div>`;
}

function buildPositionsSection(
  holdings: SeguimientoEmailData["holdingReturns"],
  attribution: SeguimientoEmailData["attribution"],
  returnsBasis?: { fromDate: string; toDate: string; isMonthly?: boolean },
): string {
  // Merge holding returns with attribution contributions
  const contribMap = new Map<string, number>();
  for (const a of attribution) contribMap.set(a.name, a.contributionPp);

  const sorted = [...holdings].sort((a, b) => b.returnPct - a.returnPct);
  const top = sorted.slice(0, 15);
  const totalContrib = attribution.reduce((s, a) => s + a.contributionPp, 0);

  const rows = top
    .map((h) => {
      const retColor = h.returnPct >= 0 ? "#166534" : "#991b1b";
      const retBg = h.returnPct >= 0 ? "#f0fdf4" : "#fef2f2";
      const retSign = h.returnPct > 0 ? "+" : "";
      const contrib = contribMap.get(h.name) ?? 0;
      const cColor = contrib >= 0 ? "#166534" : "#991b1b";
      const cSign = contrib > 0 ? "+" : "";
      return `
        <tr style="border-bottom:1px solid #F7F6F2;">
          <td style="padding:6px 12px; font-size:12px; font-weight:500; color:#0B2140; font-family:${FONT}; max-width:200px; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(h.name)}</td>
          <td style="padding:6px 12px; text-align:right; font-family:monospace; font-size:12px; font-weight:600; color:${retColor}; background:${retBg};">${retSign}${h.returnPct.toFixed(1)}%</td>
          <td style="padding:6px 12px; text-align:right; font-family:monospace; font-size:12px; font-weight:600; color:${cColor};">${cSign}${contrib.toFixed(2)}pp</td>
        </tr>`;
    })
    .join("");

  const totalColor = totalContrib >= 0 ? "#166534" : "#991b1b";
  const totalBg = totalContrib >= 0 ? "#f0fdf4" : "#fef2f2";
  const totalSign = totalContrib > 0 ? "+" : "";

  const basisNote = returnsBasis
    ? `<div style="font-size:11px; color:#a9a49c; margin-bottom:8px; font-family:${FONT};">${returnsBasis.isMonthly ? `Periodo: ${escapeHtml(returnsBasis.fromDate)} al ${escapeHtml(returnsBasis.toDate)}` : `Desde inicio del seguimiento (${escapeHtml(returnsBasis.fromDate)})`}</div>`
    : "";

  return `
    <div style="padding:24px 32px; border-bottom:1px solid #E7E4DD;">
      <div style="font-size:14px; font-weight:600; color:${BRAND.navy}; margin-bottom:4px; font-family:${FONT};">Detalle por Posicion</div>
      ${basisNote}
      <table style="width:100%; border-collapse:collapse;">
        <tr style="border-bottom:1px solid #E7E4DD;">
          <th style="text-align:left; padding:6px 12px; color:#a9a49c; font-weight:500; font-size:11px; font-family:${FONT};">Instrumento</th>
          <th style="text-align:right; padding:6px 12px; color:#a9a49c; font-weight:500; font-size:11px; font-family:${FONT};">Retorno</th>
          <th style="text-align:right; padding:6px 12px; color:#a9a49c; font-weight:500; font-size:11px; font-family:${FONT};">Contribucion</th>
        </tr>
        ${rows}
        <tr style="border-top:2px solid #E7E4DD;">
          <td style="padding:8px 12px; font-size:12px; font-weight:700; color:#0B2140; font-family:${FONT};">TOTAL</td>
          <td style="padding:8px 12px;"></td>
          <td style="padding:8px 12px; text-align:right; font-family:monospace; font-size:12px; font-weight:700; color:${totalColor}; background:${totalBg};">${totalSign}${totalContrib.toFixed(2)}pp</td>
        </tr>
      </table>
    </div>`;
}

function buildNarrativeSection(narrative: string): string {
  const paragraphs = narrative
    .split("\n\n")
    .filter((p) => p.trim())
    .slice(0, 3) // max 3 paragraphs to keep it concise
    .map((p) => `<div style="font-size:13px; color:#6E7787; line-height:1.6; margin-bottom:8px; font-family:${FONT};">${escapeHtml(p)}</div>`)
    .join("");

  return `
    <div style="padding:24px 32px; border-bottom:1px solid #E7E4DD;">
      <div style="font-size:14px; font-weight:600; color:${BRAND.navy}; margin-bottom:8px; font-family:${FONT};">Comentario</div>
      ${paragraphs}
    </div>`;
}

function buildFooter(data: SeguimientoEmailData): string {
  return `
    <div style="padding:20px 32px; background:${BRAND.mist}; border-top:2px solid ${BRAND.line};">
      <div style="font-size:11px; color:${BRAND.textSecondary}; margin-bottom:8px; text-align:center; font-family:${FONT};">
        TC: USD $${data.exchangeRates.usd.toLocaleString("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} &middot; UF $${data.exchangeRates.uf.toLocaleString("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
      </div>
      <div style="font-size:11px; color:${BRAND.textSecondary}; text-align:center; font-family:${FONT};">
        Global &mdash; Este reporte es informativo y no constituye recomendacion de inversion.
        <br/>Para ver el seguimiento completo, <a href="${escapeHtml(data.platformUrl)}" style="color:${BRAND.azure}; text-decoration:underline;">ingresa a la plataforma</a>.
      </div>
    </div>`;
}

export function buildSeguimientoHTML(data: SeguimientoEmailData): string {
  const header = buildHeader(data);
  const summary = buildMonthlySummary(data);
  const composition = buildCompositionSection(data.composition, data.displayCurrency, data.ratesInitial || data.exchangeRates, data.ratesFinal || data.exchangeRates, data.returnsBasis, data.netCashFlowCLP);
  const periodReturns = buildPeriodReturnsSection(data.periodReturns);
  const benchmark = data.benchmarkComparison ? buildBenchmarkSection(data.benchmarkComparison) : "";
  const positions = buildPositionsSection(data.holdingReturns, data.attribution, data.returnsBasis);
  const narrative = data.narrative ? buildNarrativeSection(data.narrative) : "";
  const footer = buildFooter(data);

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Global — Seguimiento ${escapeHtml(data.clientName)}</title>
</head>
<body style="margin:0; padding:0; background:#F7F6F2; font-family:${FONT};">
  <div style="max-width:600px; margin:0 auto; background:#ffffff;">
    ${header}
    ${summary}
    ${composition}
    ${periodReturns}
    ${benchmark}
    ${positions}
    ${narrative}
    ${footer}
  </div>
</body>
</html>`;
}
