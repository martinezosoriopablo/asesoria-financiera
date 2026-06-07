// Ejercicio: ¿Est Income Yield de la cartola = TIR de compra?
// Datos hipotéticos tipo Blackstone: cupón 6%, comprado a 95.97, maturity 2032-08-15

// --- Reimplementar YTM solver inline (no podemos importar TS) ---
function calcYTM(faceValue, couponRate, freq, maturityDate, price, asOfDate) {
  const coupon = faceValue * couponRate / freq;
  const monthsPerPeriod = 12 / freq;
  const maturity = new Date(maturityDate + "T00:00:00");
  const ref = new Date(asOfDate);
  ref.setHours(0, 0, 0, 0);
  if (maturity <= ref) return NaN;

  let d = new Date(maturity);
  let N = 0;
  while (d > ref) { N++; d.setMonth(d.getMonth() - monthsPerPeriod); }
  if (N === 0) return NaN;

  const marketPrice = price / 100 * faceValue;

  function priceFn(y) {
    let pv = 0;
    for (let i = 1; i <= N; i++) pv += coupon / Math.pow(1 + y, i);
    pv += faceValue / Math.pow(1 + y, N);
    return pv;
  }
  function dPriceFn(y) {
    let dpv = 0;
    for (let i = 1; i <= N; i++) dpv -= i * coupon / Math.pow(1 + y, i + 1);
    dpv -= N * faceValue / Math.pow(1 + y, N + 1);
    return dpv;
  }

  let y = couponRate / freq;
  for (let iter = 0; iter < 200; iter++) {
    const p = priceFn(y);
    const dp = dPriceFn(y);
    if (Math.abs(dp) < 1e-12) break;
    const diff = p - marketPrice;
    if (Math.abs(diff) < 0.0001) break;
    y -= diff / dp;
    if (y <= -1) y = 0.001;
  }
  return y * freq;
}

// === Bono ejemplo: Blackstone-like ===
const faceValue = 70000;
const couponRate = 0.06;    // 6%
const freq = 2;             // semi-annual
const maturityDate = "2032-08-15";
const purchasePrice = 95.97; // % of par
const currentPrice = 96.50;

console.log("╔══════════════════════════════════════════════════════╗");
console.log("║  EJERCICIO: TIR de compra vs Est Income Yield       ║");
console.log("╚══════════════════════════════════════════════════════╝");
console.log();
console.log(`Bono: Cupón ${couponRate*100}%, Semi-annual, Maturity ${maturityDate}`);
console.log(`Face value: $${faceValue.toLocaleString()}`);
console.log(`Precio de compra: ${purchasePrice}% of par ($${(faceValue * purchasePrice / 100).toFixed(2)})`);
console.log(`Precio actual: ${currentPrice}% of par`);
console.log();

// 1. Yield on cost simple = cupón / precio
const yieldOnCost = couponRate * 100 / purchasePrice;
console.log("1. Yield on cost simple (cupón/precio):");
console.log(`   ${couponRate*100}% × 100 / ${purchasePrice} = ${yieldOnCost.toFixed(4)}%`);
console.log();

// 2. TIR de compra a distintas fechas
console.log("2. TIR de compra (YTM al precio de compra) según fecha:");
console.log("   Fecha compra    │ Períodos │ YTM anual");
console.log("   ────────────────┼──────────┼──────────");

const testDates = [
  "2024-01-15", "2024-06-15", "2025-01-15", "2025-06-15", "2026-01-15"
];
for (const dt of testDates) {
  const ytm = calcYTM(faceValue, couponRate, freq, maturityDate, purchasePrice, dt);
  const maturity = new Date(maturityDate + "T00:00:00");
  const ref = new Date(dt);
  let d2 = new Date(maturity);
  let n = 0;
  while (d2 > ref) { n++; d2.setMonth(d2.getMonth() - 6); }
  console.log(`   ${dt}  │    ${String(n).padStart(2)}    │ ${(ytm * 100).toFixed(4)}%`);
}
console.log();

// 3. Tabla de desarrollo (cash flows desde 2025-01-15)
console.log("3. Tabla de desarrollo (cash flows desde compra 2025-01-15):");
const couponAmt = faceValue * couponRate / freq;
const mat = new Date(maturityDate + "T00:00:00");
const purchase = new Date("2025-01-15T00:00:00");
const dates = [];
let dd = new Date(mat);
while (dd > purchase) { dates.unshift(new Date(dd)); dd.setMonth(dd.getMonth() - 6); }

console.log("   Fecha       │ Tipo              │ Monto");
console.log("   ────────────┼───────────────────┼──────────");
let cumulative = 0;
dates.forEach((d, i) => {
  const isLast = i === dates.length - 1;
  const amount = isLast ? couponAmt + faceValue : couponAmt;
  cumulative += amount;
  const type = isLast ? "cupón+principal" : "cupón";
  console.log(`   ${d.toISOString().split("T")[0]} │ ${type.padEnd(17)} │ $${amount.toLocaleString("en", {minimumFractionDigits: 2})}`);
});
console.log(`   ${"".padEnd(10)} │ ${"TOTAL".padEnd(17)} │ $${cumulative.toLocaleString("en", {minimumFractionDigits: 2})}`);
console.log();

// 4. Comparación final
const purchaseYTM = calcYTM(faceValue, couponRate, freq, maturityDate, purchasePrice, "2025-01-15");
console.log("4. Comparación de tasas:");
console.log(`   Cupón nominal:         ${(couponRate * 100).toFixed(4)}%`);
console.log(`   Yield on cost simple:  ${yieldOnCost.toFixed(4)}%`);
console.log(`   TIR de compra (YTM):   ${(purchaseYTM * 100).toFixed(4)}%`);
console.log();
console.log("   Diferencia YTM vs YoC: " + ((purchaseYTM * 100 - yieldOnCost) > 0 ? "+" : "") +
  (purchaseYTM * 100 - yieldOnCost).toFixed(4) + "% (pull-to-par)");
console.log();

// 5. ¿Qué es el Est Income Yield de la cartola?
console.log("5. Hipótesis sobre Est Income Yield de la cartola:");
console.log(`   Si est_income_yield ≈ ${yieldOnCost.toFixed(2)}% → es yield on cost (cupón/precio)`);
console.log(`   Si est_income_yield ≈ ${(purchaseYTM * 100).toFixed(2)}% → es TIR de compra`);
console.log(`   Si est_income_yield = ${(couponRate * 100).toFixed(2)}% → es simplemente el cupón`);
console.log();

// 6. Deducir fecha de compra desde un est income yield dado
console.log("6. Ejercicio inverso: ¿podemos deducir fecha de compra?");
console.log("   La TIR depende de los períodos restantes, que dependen de la fecha.");
console.log("   Pero NUESTRO calcYTM solo cuenta períodos discretos (semi-annual).");
console.log("   Resultado: la TIR es constante dentro de cada semestre:");
console.log();

let prevYTM = null;
for (let m = 0; m < 24; m++) {
  const d = new Date("2024-01-01");
  d.setMonth(d.getMonth() + m);
  const dateStr = d.toISOString().split("T")[0];
  const ytm = calcYTM(faceValue, couponRate, freq, maturityDate, purchasePrice, dateStr);
  const ytmRounded = (ytm * 100).toFixed(4);
  if (ytmRounded !== prevYTM) {
    console.log(`   ${dateStr} → YTM: ${ytmRounded}%  ← cambio (nuevo período)`);
    prevYTM = ytmRounded;
  }
}
console.log();
console.log("   → Solo podemos deducir el SEMESTRE de compra, no la fecha exacta.");
console.log("   → Con fractional periods (día exacto dentro del semestre) se podría refinar.");
