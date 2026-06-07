// scripts/test-finra-historical-upsert.mjs
// Test historical fetch + upsert to bond_prices for 2 CUSIPs (30 days)
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BASE = "https://services-dynarep.ddwa.finra.org/public/reporting/v2/data/group/FixedIncomeMarket/name";
const DELAY_MS = 3000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeHeaders() {
  const token = crypto.randomUUID();
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    Origin: "https://www.finra.org",
    Referer: "https://www.finra.org/",
    "x-xsrf-token": token,
    Cookie: `XSRF-TOKEN=${token}`,
  };
}

const headers = makeHeaders();
const cusips = ["80282KBJ4", "097023CU7"]; // Santander, Boeing
const days = 30;
const endDate = new Date().toISOString().split("T")[0];
const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

let totalInserted = 0;

for (const cusip of cusips) {
  console.log(`\n=== ${cusip} ===`);

  // Lookup symbol
  const lookupBody = {
    fields: ["issueSymbolIdentifier", "issuerName", "cusip", "couponRate", "maturityDate"],
    compareFilters: [{ fieldName: "cusip", fieldValue: cusip, compareType: "EQUAL" }],
    sortFields: [], limit: 1, offset: 0,
    dateRangeFilters: [], domainFilters: [], multiFieldMatchFilters: [], orFilters: [],
  };

  const lookupRes = await fetch(`${BASE}/CorporateAndAgencySecurities`, {
    method: "POST", headers, body: JSON.stringify(lookupBody),
  });
  const lookupData = await lookupRes.json();
  const records = JSON.parse(lookupData.returnBody?.data || "[]");
  if (records.length === 0) { console.log("  Not found"); continue; }

  const sec = records[0];
  console.log(`  ${sec.issuerName} (${sec.issueSymbolIdentifier})`);
  await sleep(DELAY_MS);

  // Fetch trades
  const tradeBody = {
    fields: ["issueSymbolIdentifier", "issuerName", "tradeExecutionDate", "lastSalePrice", "lastSaleYield", "reportedTradeVolume"],
    compareFilters: [{ fieldName: "issueSymbolIdentifier", fieldValue: sec.issueSymbolIdentifier, compareType: "EQUAL" }],
    dateRangeFilters: [{ fieldName: "tradeExecutionDate", startDate, endDate }],
    sortFields: ["-tradeExecutionDate"], limit: 5000, offset: 0,
    domainFilters: [], multiFieldMatchFilters: [], orFilters: [],
  };

  const tradeRes = await fetch(`${BASE}/CorporateAndAgencyTradeHistory`, {
    method: "POST", headers, body: JSON.stringify(tradeBody),
  });
  const tradeData = await tradeRes.json();
  const trades = JSON.parse(tradeData.returnBody?.data || "[]");
  console.log(`  ${trades.length} trades`);

  // Aggregate daily prices
  const byDate = new Map();
  for (const t of trades) {
    const date = t.tradeExecutionDate;
    const existing = byDate.get(date) || { totalPriceVol: 0, totalVol: 0, yields: [], count: 0 };
    const vol = t.reportedTradeVolume || 1;
    existing.totalPriceVol += t.lastSalePrice * vol;
    existing.totalVol += vol;
    if (t.lastSaleYield != null) existing.yields.push(t.lastSaleYield);
    existing.count++;
    byDate.set(date, existing);
  }

  const rows = [];
  for (const [date, agg] of byDate) {
    rows.push({
      cusip,
      issuer: sec.issuerName,
      price_date: date,
      last_price: Math.round((agg.totalPriceVol / agg.totalVol) * 1000) / 1000,
      yield_to_maturity: agg.yields.length > 0
        ? Math.round((agg.yields.reduce((a, b) => a + b, 0) / agg.yields.length) * 1000) / 1000
        : null,
      volume: agg.totalVol,
      source: "finra",
      raw_data: { tradeCount: agg.count, totalVolume: agg.totalVol },
      fetched_at: new Date().toISOString(),
    });
  }

  console.log(`  ${rows.length} daily prices to upsert`);

  if (rows.length > 0) {
    const { error } = await supabase
      .from("bond_prices")
      .upsert(rows, { onConflict: "cusip,price_date,source" });

    if (error) {
      console.log(`  UPSERT ERROR: ${error.message}`);
    } else {
      console.log(`  Upserted ${rows.length} rows OK`);
      totalInserted += rows.length;
    }
  }

  await sleep(DELAY_MS);
}

console.log(`\nTotal inserted: ${totalInserted} daily prices`);

// Verify
const { data: check } = await supabase
  .from("bond_prices")
  .select("cusip, price_date, last_price, yield_to_maturity, volume")
  .in("cusip", cusips)
  .order("price_date", { ascending: false })
  .limit(10);

console.log("\nLatest in DB:");
for (const r of check || []) {
  console.log(`  ${r.cusip} ${r.price_date} price=${r.last_price} ytm=${r.yield_to_maturity} vol=${r.volume}`);
}
