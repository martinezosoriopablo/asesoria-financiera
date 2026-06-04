export interface SeguimientoEmailData {
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
  if (val === null) return `<td style="padding:8px 12px; text-align:right; font-family:monospace; font-size:12px; color:#94a3b8;">&mdash;</td>`;
  const color = val >= 0 ? "#166534" : "#991b1b";
  const bg = val >= 0 ? "#f0fdf4" : "#fef2f2";
  const sign = val > 0 ? "+" : "";
  return `<td style="padding:8px 12px; text-align:right; font-family:monospace; font-size:12px; font-weight:600; color:${color}; background:${bg};">${sign}${val.toFixed(1)}%</td>`;
}

function buildHeader(data: SeguimientoEmailData): string {
  const profileLabel = PROFILE_LABELS[data.perfilCliente] || data.perfilCliente;
  const displayValue = formatValue(data.totalValueCLP, data.displayCurrency, data.exchangeRates);

  return `
    <div style="background:#1e293b; color:white; padding:24px 32px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div style="font-size:11px; text-transform:uppercase; letter-spacing:1.5px; color:#94a3b8; margin-bottom:4px; font-family:${FONT};">Greybark Advisors</div>
          <div style="font-size:20px; font-weight:600; font-family:${FONT};">Reporte de Seguimiento</div>
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
          <span style="color:#94a3b8;">Valor:</span> ${displayValue}
        </div>
      </div>
    </div>`;
}

function buildCompositionSection(composition: SeguimientoEmailData["composition"]): string {
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
        <tr style="border-bottom:1px solid #f1f5f9;">
          <td style="padding:10px 12px; border-left:4px solid ${color}; font-weight:500; font-size:13px; color:#1e293b; font-family:${FONT};">${label}</td>
          <td style="padding:10px 12px; text-align:right; font-family:monospace; font-size:12px; color:#475569;">${formatCLP(c.initial)}</td>
          <td style="padding:10px 12px; text-align:right; font-family:monospace; font-size:12px; font-weight:600; color:#1e293b;">${formatCLP(c.final)}</td>
          <td style="padding:10px 12px; text-align:right; font-family:monospace; font-size:12px; font-weight:600; color:${retColor}; background:${retBg};">${sign}${c.returnPct.toFixed(1)}%</td>
        </tr>`;
    })
    .join("");

  return `
    <div style="padding:24px 32px; border-bottom:1px solid #e2e8f0;">
      <div style="font-size:14px; font-weight:600; color:#1e293b; margin-bottom:12px; font-family:${FONT};">Composicion</div>
      <table style="width:100%; border-collapse:collapse; font-size:12px;">
        <tr style="border-bottom:1px solid #e2e8f0;">
          <th style="text-align:left; padding:6px 12px; color:#94a3b8; font-weight:500; font-family:${FONT};">Clase</th>
          <th style="text-align:right; padding:6px 12px; color:#94a3b8; font-weight:500; font-family:${FONT};">Inicio</th>
          <th style="text-align:right; padding:6px 12px; color:#94a3b8; font-weight:500; font-family:${FONT};">Final</th>
          <th style="text-align:right; padding:6px 12px; color:#94a3b8; font-weight:500; font-family:${FONT};">Retorno</th>
        </tr>
        ${rows}
      </table>
    </div>`;
}

function buildPeriodReturnsSection(periodReturns: SeguimientoEmailData["periodReturns"]): string {
  const periodOrder = ["1M", "3M", "6M", "1Y", "YTD"];
  const periods = periodOrder.filter((p) => p in periodReturns);

  const rows = periods
    .map((p) => {
      const r = periodReturns[p];
      return `
        <tr style="border-bottom:1px solid #f1f5f9;">
          <td style="padding:8px 12px; font-weight:500; font-size:13px; color:#1e293b; font-family:${FONT};">${escapeHtml(p)}</td>
          ${returnCell(r.nominal)}
          ${returnCell(r.real)}
          ${returnCell(r.usd)}
        </tr>`;
    })
    .join("");

  return `
    <div style="padding:24px 32px; border-bottom:1px solid #e2e8f0;">
      <div style="font-size:14px; font-weight:600; color:#1e293b; margin-bottom:12px; font-family:${FONT};">Rentabilidad por Periodo</div>
      <table style="width:100%; border-collapse:collapse; font-size:12px;">
        <tr style="border-bottom:1px solid #e2e8f0;">
          <th style="text-align:left; padding:6px 12px; color:#94a3b8; font-weight:500; font-family:${FONT};">Periodo</th>
          <th style="text-align:right; padding:6px 12px; color:#94a3b8; font-weight:500; font-family:${FONT};">Nominal</th>
          <th style="text-align:right; padding:6px 12px; color:#94a3b8; font-weight:500; font-family:${FONT};">Real (UF)</th>
          <th style="text-align:right; padding:6px 12px; color:#94a3b8; font-weight:500; font-family:${FONT};">USD</th>
        </tr>
        ${rows}
      </table>
    </div>`;
}

function buildDistributionSection(distribution: SeguimientoEmailData["distribution"]): string {
  function miniTable(title: string, items: Array<{ label: string; pct: number }>): string {
    const rows = items
      .map((item) => {
        const barWidth = Math.min(item.pct, 100).toFixed(0);
        return `
          <tr>
            <td style="padding:4px 8px; font-size:12px; color:#1e293b; font-family:${FONT}; white-space:nowrap;">${escapeHtml(item.label)}</td>
            <td style="padding:4px 8px; width:60%;">
              <div style="height:10px; background:#f1f5f9; border-radius:5px; overflow:hidden;">
                <div style="width:${barWidth}%; height:100%; background:#3b82f6; border-radius:5px;"></div>
              </div>
            </td>
            <td style="padding:4px 8px; text-align:right; font-family:monospace; font-size:11px; color:#475569; white-space:nowrap;">${item.pct.toFixed(1)}%</td>
          </tr>`;
      })
      .join("");

    return `
      <div style="flex:1; min-width:200px;">
        <div style="font-size:12px; font-weight:600; color:#64748b; margin-bottom:8px; font-family:${FONT};">${escapeHtml(title)}</div>
        <table style="width:100%; border-collapse:collapse;">
          ${rows}
        </table>
      </div>`;
  }

  const byAsset = miniTable("Por Tipo de Activo", distribution.byAssetType);
  const byCurrency = miniTable("Por Moneda", distribution.byCurrency);

  return `
    <div style="padding:24px 32px; border-bottom:1px solid #e2e8f0;">
      <div style="font-size:14px; font-weight:600; color:#1e293b; margin-bottom:12px; font-family:${FONT};">Distribucion</div>
      <div style="display:flex; gap:24px; flex-wrap:wrap;">
        ${byAsset}
        ${byCurrency}
      </div>
    </div>`;
}

function buildBenchmarkSection(bm: NonNullable<SeguimientoEmailData["benchmarkComparison"]>): string {
  const periodOrder = ["1M", "3M", "6M", "1Y", "YTD"];
  const periods = periodOrder.filter((p) => p in bm.periods);

  const rows = periods
    .map((p) => {
      const d = bm.periods[p];
      return `
        <tr style="border-bottom:1px solid #f1f5f9;">
          <td style="padding:8px 12px; font-weight:500; font-size:13px; color:#1e293b; font-family:${FONT};">${escapeHtml(p)}</td>
          ${returnCell(d.portfolio)}
          ${returnCell(d.benchmark)}
          ${returnCell(d.diff)}
        </tr>`;
    })
    .join("");

  return `
    <div style="padding:24px 32px; border-bottom:1px solid #e2e8f0;">
      <div style="font-size:14px; font-weight:600; color:#1e293b; margin-bottom:4px; font-family:${FONT};">Benchmark</div>
      <div style="font-size:12px; color:#64748b; margin-bottom:12px; font-family:${FONT};">${escapeHtml(bm.label)}</div>
      <table style="width:100%; border-collapse:collapse; font-size:12px;">
        <tr style="border-bottom:1px solid #e2e8f0;">
          <th style="text-align:left; padding:6px 12px; color:#94a3b8; font-weight:500; font-family:${FONT};">Periodo</th>
          <th style="text-align:right; padding:6px 12px; color:#94a3b8; font-weight:500; font-family:${FONT};">Portafolio</th>
          <th style="text-align:right; padding:6px 12px; color:#94a3b8; font-weight:500; font-family:${FONT};">Benchmark</th>
          <th style="text-align:right; padding:6px 12px; color:#94a3b8; font-weight:500; font-family:${FONT};">Diferencia</th>
        </tr>
        ${rows}
      </table>
    </div>`;
}

function buildHoldingReturnsSection(holdings: SeguimientoEmailData["holdingReturns"]): string {
  const sorted = [...holdings].sort((a, b) => b.returnPct - a.returnPct);
  const top = sorted.slice(0, 20);
  const maxAbs = Math.max(...top.map((h) => Math.abs(h.returnPct)), 1);

  const rows = top
    .map((h) => {
      const barColor = h.returnPct >= 0 ? "#22c55e" : "#ef4444";
      const barWidth = Math.min((Math.abs(h.returnPct) / maxAbs) * 100, 100).toFixed(0);
      const retColor = h.returnPct >= 0 ? "#166534" : "#991b1b";
      const retBg = h.returnPct >= 0 ? "#f0fdf4" : "#fef2f2";
      const sign = h.returnPct > 0 ? "+" : "";
      return `
        <tr style="border-bottom:1px solid #f1f5f9;">
          <td style="padding:6px 12px; font-size:12px; font-weight:500; color:#1e293b; font-family:${FONT}; max-width:180px; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(h.name)}</td>
          <td style="padding:6px 8px; font-size:11px; color:#64748b; font-family:${FONT};">${escapeHtml(h.assetType)}</td>
          <td style="padding:6px 8px; width:30%;">
            <div style="height:8px; background:#f1f5f9; border-radius:4px; overflow:hidden;">
              <div style="width:${barWidth}%; height:100%; background:${barColor}; border-radius:4px;"></div>
            </div>
          </td>
          <td style="padding:6px 12px; text-align:right; font-family:monospace; font-size:12px; font-weight:600; color:${retColor}; background:${retBg};">${sign}${h.returnPct.toFixed(1)}%</td>
        </tr>`;
    })
    .join("");

  return `
    <div style="padding:24px 32px; border-bottom:1px solid #e2e8f0;">
      <div style="font-size:14px; font-weight:600; color:#1e293b; margin-bottom:12px; font-family:${FONT};">Rentabilidad por Posicion</div>
      <table style="width:100%; border-collapse:collapse;">
        <tr style="border-bottom:1px solid #e2e8f0;">
          <th style="text-align:left; padding:6px 12px; color:#94a3b8; font-weight:500; font-size:11px; font-family:${FONT};">Instrumento</th>
          <th style="text-align:left; padding:6px 8px; color:#94a3b8; font-weight:500; font-size:11px; font-family:${FONT};">Tipo</th>
          <th style="padding:6px 8px;"></th>
          <th style="text-align:right; padding:6px 12px; color:#94a3b8; font-weight:500; font-size:11px; font-family:${FONT};">Retorno</th>
        </tr>
        ${rows}
      </table>
    </div>`;
}

function buildAttributionSection(attribution: SeguimientoEmailData["attribution"]): string {
  const sorted = [...attribution].sort((a, b) => b.contributionPp - a.contributionPp);
  const top = sorted.slice(0, 15);
  const maxAbs = Math.max(...top.map((a) => Math.abs(a.contributionPp)), 0.1);
  const total = top.reduce((sum, a) => sum + a.contributionPp, 0);

  const rows = top
    .map((a) => {
      const barColor = a.contributionPp >= 0 ? "#22c55e" : "#ef4444";
      const barWidth = Math.min((Math.abs(a.contributionPp) / maxAbs) * 100, 100).toFixed(0);
      const color = a.contributionPp >= 0 ? "#166534" : "#991b1b";
      const sign = a.contributionPp > 0 ? "+" : "";
      return `
        <tr style="border-bottom:1px solid #f1f5f9;">
          <td style="padding:6px 12px; font-size:12px; font-weight:500; color:#1e293b; font-family:${FONT}; max-width:180px; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(a.name)}</td>
          <td style="padding:6px 8px; font-size:11px; color:#64748b; font-family:${FONT};">${escapeHtml(a.instrumentType)}</td>
          <td style="padding:6px 8px; width:30%;">
            <div style="height:8px; background:#f1f5f9; border-radius:4px; overflow:hidden;">
              <div style="width:${barWidth}%; height:100%; background:${barColor}; border-radius:4px;"></div>
            </div>
          </td>
          <td style="padding:6px 12px; text-align:right; font-family:monospace; font-size:12px; font-weight:600; color:${color};">${sign}${a.contributionPp.toFixed(2)}pp</td>
        </tr>`;
    })
    .join("");

  const totalColor = total >= 0 ? "#166534" : "#991b1b";
  const totalBg = total >= 0 ? "#f0fdf4" : "#fef2f2";
  const totalSign = total > 0 ? "+" : "";

  return `
    <div style="padding:24px 32px; border-bottom:1px solid #e2e8f0;">
      <div style="font-size:14px; font-weight:600; color:#1e293b; margin-bottom:12px; font-family:${FONT};">Atribucion</div>
      <table style="width:100%; border-collapse:collapse;">
        <tr style="border-bottom:1px solid #e2e8f0;">
          <th style="text-align:left; padding:6px 12px; color:#94a3b8; font-weight:500; font-size:11px; font-family:${FONT};">Instrumento</th>
          <th style="text-align:left; padding:6px 8px; color:#94a3b8; font-weight:500; font-size:11px; font-family:${FONT};">Tipo</th>
          <th style="padding:6px 8px;"></th>
          <th style="text-align:right; padding:6px 12px; color:#94a3b8; font-weight:500; font-size:11px; font-family:${FONT};">Contribucion</th>
        </tr>
        ${rows}
        <tr style="border-top:2px solid #e2e8f0;">
          <td colspan="3" style="padding:8px 12px; font-size:12px; font-weight:700; color:#1e293b; font-family:${FONT};">TOTAL</td>
          <td style="padding:8px 12px; text-align:right; font-family:monospace; font-size:12px; font-weight:700; color:${totalColor}; background:${totalBg};">${totalSign}${total.toFixed(2)}pp</td>
        </tr>
      </table>
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
      <div style="font-size:14px; font-weight:600; color:#1e293b; margin-bottom:12px; font-family:${FONT};">Explicacion de Resultados</div>
      ${paragraphs}
    </div>`;
}

function buildFooter(data: SeguimientoEmailData): string {
  return `
    <div style="padding:20px 32px; background:#f8fafc;">
      <div style="font-size:11px; color:#94a3b8; margin-bottom:8px; text-align:center; font-family:${FONT};">
        TC: USD $${data.exchangeRates.usd.toLocaleString("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} &middot; UF $${data.exchangeRates.uf.toLocaleString("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
      </div>
      <div style="font-size:11px; color:#94a3b8; text-align:center; font-family:${FONT};">
        Greybark Advisors &mdash; Este reporte es informativo y no constituye recomendacion de inversion.
        <br/>Para ver el seguimiento completo, <a href="${escapeHtml(data.platformUrl)}" style="color:#3b82f6; text-decoration:underline;">ingresa a la plataforma</a>.
      </div>
    </div>`;
}

export function buildSeguimientoHTML(data: SeguimientoEmailData): string {
  const header = buildHeader(data);
  const composition = buildCompositionSection(data.composition);
  const periodReturns = buildPeriodReturnsSection(data.periodReturns);
  const distribution = buildDistributionSection(data.distribution);
  const benchmark = data.benchmarkComparison ? buildBenchmarkSection(data.benchmarkComparison) : "";
  const holdingReturns = buildHoldingReturnsSection(data.holdingReturns);
  const attribution = buildAttributionSection(data.attribution);
  const narrative = data.narrative ? buildNarrativeSection(data.narrative) : "";
  const footer = buildFooter(data);

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Seguimiento — ${escapeHtml(data.clientName)}</title>
</head>
<body style="margin:0; padding:0; background:#f1f5f9; font-family:${FONT};">
  <div style="max-width:600px; margin:0 auto; background:#ffffff;">
    ${header}
    ${composition}
    ${periodReturns}
    ${distribution}
    ${benchmark}
    ${holdingReturns}
    ${attribution}
    ${narrative}
    ${footer}
  </div>
</body>
</html>`;
}
