import { buildSeguimientoHTML, SeguimientoEmailData } from "../lib/seguimiento-email";
import { writeFileSync } from "fs";

const testData: SeguimientoEmailData = {
  clientName: "Juan Pérez Rodríguez",
  reportDate: "Junio 2026",
  perfilCliente: "moderado",
  totalValueCLP: 245000000,
  displayCurrency: "USD",
  exchangeRates: { usd: 920, uf: 38500 },
  composition: {
    equity: { initial: 85000000, final: 98000000, returnPct: 15.3 },
    fixedIncome: { initial: 110000000, final: 112000000, returnPct: 1.8 },
    alternatives: { initial: 20000000, final: 22000000, returnPct: 10.0 },
    cash: { initial: 12000000, final: 13000000, returnPct: 0.5 },
  },
  periodReturns: {
    "1M": { nominal: 2.1, real: 1.8, usd: 1.5 },
    "3M": { nominal: 5.4, real: 4.9, usd: 3.2 },
    "6M": { nominal: 8.7, real: 7.8, usd: 6.1 },
    YTD: { nominal: 12.3, real: 11.0, usd: 9.5 },
  },
  distribution: {
    byAssetType: [
      { label: "Renta Variable", pct: 40 },
      { label: "Renta Fija", pct: 45.7 },
      { label: "Alternativos", pct: 9 },
      { label: "Caja", pct: 5.3 },
    ],
    byCurrency: [
      { label: "CLP", pct: 45 },
      { label: "USD", pct: 50 },
      { label: "EUR", pct: 5 },
    ],
  },
  benchmarkComparison: {
    label: "UF + 2% anual",
    periods: {
      "1M": { portfolio: 2.1, benchmark: 0.5, diff: 1.6 },
      "3M": { portfolio: 5.4, benchmark: 1.5, diff: 3.9 },
      "6M": { portfolio: 8.7, benchmark: 3.0, diff: 5.7 },
      YTD: { portfolio: 12.3, benchmark: 5.0, diff: 7.3 },
    },
  },
  holdingReturns: [
    { name: "Fondo Mutuo Security Acciones USA", assetType: "equity", returnPct: 22.5 },
    { name: "DWS Invest Latin American Equities", assetType: "equity", returnPct: 18.3 },
    { name: "BNY Mellon Global High Yield Bond", assetType: "fixedIncome", returnPct: 8.2 },
    { name: "SPDR S&P 500 ETF Trust", assetType: "equity", returnPct: 15.1 },
    { name: "Fondo Mutuo BTG Renta Chilena", assetType: "fixedIncome", returnPct: 3.2 },
    { name: "iShares MSCI Emerging Markets ETF", assetType: "equity", returnPct: -2.4 },
  ],
  attribution: [
    { name: "Fondo Mutuo Security Acciones USA", instrumentType: "fund", contributionPp: 3.5 },
    { name: "DWS Invest Latin American Equities", instrumentType: "fund", contributionPp: 2.1 },
    { name: "BNY Mellon Global High Yield Bond", instrumentType: "fund", contributionPp: 1.8 },
    { name: "SPDR S&P 500 ETF Trust", instrumentType: "etf", contributionPp: 2.3 },
    { name: "Fondo Mutuo BTG Renta Chilena", instrumentType: "fund", contributionPp: 0.8 },
    { name: "iShares MSCI Emerging Markets ETF", instrumentType: "etf", contributionPp: -0.6 },
  ],
  monthlyReturn: 7.9,
  narrative: "El portafolio mostró un desempeño sólido durante junio, impulsado por la recuperación de los mercados de renta variable en EE.UU. y Latam. La posición en DWS Latin American fue el principal contribuyente positivo.\n\nLa renta fija se mantuvo estable, con un leve beneficio por la compresión de spreads en high yield. Recomendamos mantener la exposición actual y monitorear las señales de la Fed.",
  platformUrl: "https://app.globaladvisors.cl/seguimiento/abc123",
  returnsBasis: { fromDate: "01-Jun-2026", toDate: "30-Jun-2026", isMonthly: true },
};

const html = buildSeguimientoHTML(testData);
const outPath = process.env.USERPROFILE
  ? `${process.env.USERPROFILE}\\Downloads\\test-email-global.html`
  : "/tmp/test-email-global.html";
writeFileSync(outPath, html);
console.log(`Email saved to ${outPath}`);
