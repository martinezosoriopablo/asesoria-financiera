// Step-by-step Ecopetrol YTM & Devengo calculation
// Run with: npx tsx scripts/ecopetrol-ytm-walkthrough.mjs

import { calcYieldToMaturity } from "../lib/bonds/yield.ts";
import { calcBondPeriodReturn } from "../lib/bonds/period-return.ts";

// === DATOS ECOPETROL desde la cartola manual (2026-04-30) ===
const faceValue = 25000;
const couponRatePct = 8.375;
const couponRateDecimal = 8.375 / 100;
const couponFrequency = 2;
const maturityDate = "2036-01-19";
const purchaseDate = "2025-08-29";
const unitCost = 102.7905;         // % of par
const marketPrice = 103.75;        // % of par

const purchasePricePct = unitCost;
const marketPricePct = marketPrice;
const costBasis = faceValue * purchasePricePct / 100;
const couponSemiAnnual = faceValue * couponRateDecimal / 2;

console.log("=== PASO 1: DATOS DEL BONO ===");
console.log("Emisor:          Ecopetrol SA");
console.log("CUSIP:           279158AV1");
console.log("Face Value:      USD " + faceValue.toLocaleString());
console.log("Cupon anual:     " + couponRatePct + "%");
console.log("Cupon semi-anual: USD " + couponSemiAnnual.toFixed(2));
console.log("Vencimiento:     " + maturityDate);
console.log("Fecha compra:    " + purchaseDate);
console.log("Precio compra:   " + purchasePricePct.toFixed(4) + "% del par");
console.log("Precio mercado:  " + marketPricePct.toFixed(4) + "% del par");
console.log("Cost basis:      USD " + costBasis.toFixed(2));
console.log("");

// === PASO 2: TIR DE COMPRA ===
console.log("=== PASO 2: TIR DE COMPRA (Newton-Raphson) ===");
console.log("Resolvemos: Precio = sum(CF_i / (1 + y)^i)");
console.log("Donde Precio = USD " + costBasis.toFixed(2) + " (lo que pagamos)");
console.log("");

const bondParams = {
  faceValue,
  couponRate: couponRateDecimal,
  couponFrequency,
  maturityDate,
  purchaseDate,
  purchasePrice: purchasePricePct,
  currentPrice: purchasePricePct,  // <-- CLAVE: resolvemos al precio de COMPRA
};
const refDate = new Date(purchaseDate + "T00:00:00");
const ytm = calcYieldToMaturity(bondParams, refDate);

// Count periods
const mat = new Date(maturityDate + "T00:00:00");
let d = new Date(mat);
let N = 0;
while (d > refDate) { N++; d = new Date(d); d.setMonth(d.getMonth() - 6); }

console.log("Periodos semi-anuales restantes desde compra: " + N);
console.log("(desde " + purchaseDate + " hasta " + maturityDate + ")");
console.log("");
console.log("Iteracion Newton-Raphson:");
console.log("  P(y) = sum(CF/(1+y)^i) + FaceValue/(1+y)^N = Precio pagado");
console.log("  Guess inicial: y = couponRate/freq = " + (couponRateDecimal / 2 * 100).toFixed(3) + "% por periodo");
console.log("");
console.log(">>> TIR anual resuelta: " + (ytm * 100).toFixed(4) + "%");
console.log(">>> TIR semi-anual:     " + (ytm / 2 * 100).toFixed(4) + "%");
console.log("");

// === PASO 3: VERIFICACION ===
console.log("=== PASO 3: VERIFICACION (reconstruir precio con la TIR) ===");
const y = ytm / 2;
let pvCheck = 0;
for (let i = 1; i <= N; i++) {
  const cf = i === N ? couponSemiAnnual + faceValue : couponSemiAnnual;
  const pv = cf / Math.pow(1 + y, i);
  pvCheck += pv;
  if (i <= 3 || i >= N - 1) {
    console.log("  Per " + String(i).padStart(2) + ": CF=$" + cf.toFixed(2) + " / (1+" + (y * 100).toFixed(3) + "%)^" + i + " = $" + pv.toFixed(2));
  }
  if (i === 3 && N > 5) console.log("  ... (" + (N - 5) + " periodos intermedios) ...");
}
console.log("");
console.log("Suma PV flujos: USD " + pvCheck.toFixed(2));
console.log("Precio pagado:  USD " + costBasis.toFixed(2));
console.log("Diferencia:     USD " + (pvCheck - costBasis).toFixed(4) + " (debe ser ~0)");
console.log("");

// === PASO 4: DEVENGO ===
console.log("=== PASO 4: DEVENGO (desde compra hasta 2026-05-22) ===");

function days30_360(d1str, d2str) {
  const d1 = new Date(d1str + "T00:00:00");
  const d2 = new Date(d2str + "T00:00:00");
  const y1 = d1.getFullYear(), m1 = d1.getMonth() + 1, dd1 = Math.min(d1.getDate(), 30);
  const y2 = d2.getFullYear(), m2 = d2.getMonth() + 1;
  let dd2 = Math.min(d2.getDate(), 30);
  if (dd1 >= 30) dd2 = Math.min(dd2, 30);
  return (y2 - y1) * 360 + (m2 - m1) * 30 + (dd2 - dd1);
}

const days = days30_360(purchaseDate, "2026-05-22");
const result = calcBondPeriodReturn({
  faceValue,
  couponRate: couponRateDecimal,
  couponFrequency,
  maturityDate,
  purchasePrice: purchasePricePct,
  currentPrice: marketPricePct,
  startDate: "2026-04-30",
  endDate: "2026-05-22",
  purchaseDate,
});

console.log("Dias 30/360 desde " + purchaseDate + " a 2026-05-22: " + days);
console.log("TIR compra (anual): " + (result.purchaseYTM * 100).toFixed(4) + "%");
console.log("Cost basis: USD " + costBasis.toFixed(2));
console.log("");
console.log("Formula: Devengo = TIR_compra * costBasis * dias / 360");
console.log("       = " + (result.purchaseYTM * 100).toFixed(4) + "% * " + costBasis.toFixed(2) + " * " + days + " / 360");
console.log("       = USD " + result.devengoUSD.toFixed(2));
console.log("       = " + result.devengoPct.toFixed(4) + "% del costo");
console.log("");

// === PASO 5: DESVIACION DE MERCADO ===
console.log("=== PASO 5: DESVIACION DE MERCADO ===");
const mktValue = faceValue * marketPricePct / 100;
const theoretical = costBasis + result.devengoUSD;
console.log("Valor mercado:   USD " + mktValue.toFixed(2) + " (" + marketPricePct + "% * " + faceValue + ")");
console.log("Valor teorico:   USD " + theoretical.toFixed(2) + " (costo + devengo)");
console.log("Desviacion:      USD " + result.marketDeviationUSD.toFixed(2));
if (result.marketDeviationUSD >= 0) {
  console.log("  → El mercado valora el bono MEJOR que la trayectoria de la TIR");
} else {
  console.log("  → El mercado valora el bono PEOR que la trayectoria de la TIR");
}
console.log("");

// === PASO 6: RETORNO TOTAL ===
console.log("=== PASO 6: RETORNO TOTAL ===");
console.log("Retorno = Devengo + Desviacion");
console.log("        = " + result.devengoUSD.toFixed(2) + " + (" + result.marketDeviationUSD.toFixed(2) + ")");
console.log("        = USD " + result.totalReturnUSD.toFixed(2));
console.log("        = " + result.totalReturnPct.toFixed(4) + "% sobre cost basis");
