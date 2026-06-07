// Test fetching long TRACE history (1-2 years) for a single CUSIP
// to see how far back FINRA public API goes

const BASE = "https://services-dynarep.ddwa.finra.org/public/reporting/v2/data/group/FixedIncomeMarket/name";

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

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function lookupSymbol(cusip, headers) {
  const body = {
    fields: ["issueSymbolIdentifier", "issuerName", "cusip", "couponRate", "maturityDate"],
    compareFilters: [{ fieldName: "cusip", fieldValue: cusip, compareType: "EQUAL" }],
    sortFields: [], limit: 1, offset: 0,
    dateRangeFilters: [], domainFilters: [], multiFieldMatchFilters: [], orFilters: [],
  };
  const res = await fetch(`${BASE}/CorporateAndAgencySecurities`, { method: "POST", headers, body: JSON.stringify(body) });
  if (!res.ok) return null;
  const data = await res.json();
  const records = JSON.parse(data.returnBody?.data || "[]");
  return records.length > 0 ? records[0] : null;
}

async function fetchTrades(symbol, startDate, endDate, headers) {
  const allTrades = [];
  let offset = 0;
  const limit = 5000;

  while (true) {
    const body = {
      fields: ["issueSymbolIdentifier", "issuerName", "tradeExecutionDate", "lastSalePrice", "lastSaleYield", "reportedTradeVolume"],
      compareFilters: [{ fieldName: "issueSymbolIdentifier", fieldValue: symbol, compareType: "EQUAL" }],
      dateRangeFilters: [{ fieldName: "tradeExecutionDate", startDate, endDate }],
      sortFields: ["-tradeExecutionDate"],
      limit, offset,
      domainFilters: [], multiFieldMatchFilters: [], orFilters: [],
    };

    console.log(`  Fetching trades offset=${offset}...`);
    const res = await fetch(`${BASE}/CorporateAndAgencyTradeHistory`, { method: "POST", headers, body: JSON.stringify(body) });
    if (!res.ok) {
      console.log(`  HTTP ${res.status}`);
      break;
    }

    const data = await res.json();
    const records = JSON.parse(data.returnBody?.data || "[]");
    allTrades.push(...records);

    const total = parseInt(data.returnBody?.headers?.["Record-Total"]?.[0] || "0");
    console.log(`  Got ${records.length} trades (total: ${total})`);
    offset += records.length;

    if (offset >= total || records.length === 0) break;
    await sleep(3000);
  }

  return allTrades;
}

// Test CUSIPs: Suzano (needs more history) + Blackstone (as control)
const TEST_CUSIPS = [
  { cusip: "86960YAA0", name: "Suzano", unitCost: 101.3884 },
  { cusip: "09261HBW6", name: "Blackstone", unitCost: 95.97 },
];

async function main() {
  const headers = makeHeaders();
  const endDate = "2026-05-20";

  // Try different history lengths
  const historyDays = [180, 365, 730];

  for (const bond of TEST_CUSIPS) {
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`${bond.name} (${bond.cusip}) — unitCost: ${bond.unitCost}%`);
    console.log('═'.repeat(70));

    // Lookup symbol
    const sec = await lookupSymbol(bond.cusip, headers);
    if (!sec) { console.log("CUSIP not found"); continue; }
    console.log(`Symbol: ${sec.issueSymbolIdentifier} | ${sec.issuerName}`);
    await sleep(3000);

    for (const days of historyDays) {
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      console.log(`\n--- ${days} days (${startDate} → ${endDate}) ---`);

      const trades = await fetchTrades(sec.issueSymbolIdentifier, startDate, endDate, headers);

      if (trades.length === 0) {
        console.log("  No trades found");
        await sleep(3000);
        continue;
      }

      // Aggregate daily
      const byDate = {};
      for (const t of trades) {
        const d = t.tradeExecutionDate;
        if (!byDate[d]) byDate[d] = { totalPV: 0, totalV: 0, count: 0 };
        const vol = t.reportedTradeVolume || 1;
        byDate[d].totalPV += t.lastSalePrice * vol;
        byDate[d].totalV += vol;
        byDate[d].count++;
      }

      const dailyPrices = Object.entries(byDate)
        .map(([date, agg]) => ({ date, price: Math.round(agg.totalPV / agg.totalV * 1000) / 1000 }))
        .sort((a, b) => a.date.localeCompare(b.date));

      console.log(`  ${trades.length} trades → ${dailyPrices.length} daily prices`);
      console.log(`  Range: ${dailyPrices[0].date} → ${dailyPrices[dailyPrices.length - 1].date}`);
      console.log(`  Price range: ${Math.min(...dailyPrices.map(p => p.price))} → ${Math.max(...dailyPrices.map(p => p.price))}`);

      // Find best match to unitCost
      let best = null;
      let bestDiff = Infinity;
      for (const p of dailyPrices) {
        const diff = Math.abs(p.price - bond.unitCost);
        if (diff < bestDiff) { bestDiff = diff; best = p; }
      }
      console.log(`  Best match: ${best.date} @ ${best.price}% (diff: ${bestDiff.toFixed(4)})`);

      // If we got enough, skip longer requests
      if (bestDiff < 0.05) {
        console.log(`  ✓ Good enough match, skipping longer history`);
        break;
      }

      await sleep(3000);
    }

    await sleep(3000);
  }
}

main().catch(console.error);
