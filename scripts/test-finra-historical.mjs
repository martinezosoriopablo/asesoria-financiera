// scripts/test-finra-historical.mjs
// Quick test of the historical fetch module with 2 CUSIPs

const BASE =
  "https://services-dynarep.ddwa.finra.org/public/reporting/v2/data/group/FixedIncomeMarket/name";

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const headers = makeHeaders();
const testCusips = ["80282KBJ4", "097023CU7"]; // Santander, Boeing

for (const cusip of testCusips) {
  console.log(`\n=== Testing CUSIP: ${cusip} ===`);

  // Step 1: Lookup symbol
  const lookupBody = {
    fields: ["issueSymbolIdentifier", "issuerName", "cusip", "couponRate", "maturityDate"],
    compareFilters: [{ fieldName: "cusip", fieldValue: cusip, compareType: "EQUAL" }],
    sortFields: [], limit: 1, offset: 0,
    dateRangeFilters: [], domainFilters: [], multiFieldMatchFilters: [], orFilters: [],
  };

  const lookupRes = await fetch(`${BASE}/CorporateAndAgencySecurities`, {
    method: "POST", headers, body: JSON.stringify(lookupBody),
  });

  if (!lookupRes.ok) { console.log(`  Lookup FAILED: ${lookupRes.status}`); continue; }

  const lookupData = await lookupRes.json();
  const records = JSON.parse(lookupData.returnBody?.data || "[]");
  if (records.length === 0) { console.log("  Not found"); continue; }

  const sec = records[0];
  console.log(`  Found: ${sec.issuerName} (${sec.issueSymbolIdentifier}), coupon=${sec.couponRate}, maturity=${sec.maturityDate}`);

  await sleep(3000);

  // Step 2: Fetch trades (last 30 days)
  const endDate = new Date().toISOString().split("T")[0];
  const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const tradeBody = {
    fields: ["issueSymbolIdentifier", "issuerName", "tradeExecutionDate", "lastSalePrice", "lastSaleYield", "reportedTradeVolume"],
    compareFilters: [{ fieldName: "issueSymbolIdentifier", fieldValue: sec.issueSymbolIdentifier, compareType: "EQUAL" }],
    dateRangeFilters: [{ fieldName: "tradeExecutionDate", startDate, endDate }],
    sortFields: ["-tradeExecutionDate"],
    limit: 100, offset: 0,
    domainFilters: [], multiFieldMatchFilters: [], orFilters: [],
  };

  const tradeRes = await fetch(`${BASE}/CorporateAndAgencyTradeHistory`, {
    method: "POST", headers, body: JSON.stringify(tradeBody),
  });

  if (!tradeRes.ok) { console.log(`  Trades FAILED: ${tradeRes.status}`); continue; }

  const tradeData = await tradeRes.json();
  const trades = JSON.parse(tradeData.returnBody?.data || "[]");
  const total = tradeData.returnBody?.headers?.["Record-Total"]?.[0] || "?";
  console.log(`  Trades: ${trades.length} returned, ${total} total`);

  if (trades.length > 0) {
    const t = trades[0];
    console.log(`  Latest: date=${t.tradeExecutionDate}, price=${t.lastSalePrice}, yield=${t.lastSaleYield}, vol=${t.reportedTradeVolume}`);
  }

  await sleep(3000);
}

console.log("\nDone!");
