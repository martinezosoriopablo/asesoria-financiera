// lib/finra/historical.ts
// Fetch historical bond trade data from FINRA public API
// NO authentication needed — only a self-matching XSRF token (any UUID)
//
// Flow:
// 1. CUSIP → lookup productSymbol via CorporateAndAgencySecurities
// 2. productSymbol → fetch trades via CorporateAndAgencyTradeHistory
// 3. Aggregate trades into daily prices (volume-weighted average)
//
// Rate limiting: 3s delay between requests to avoid blocks

const BASE =
  "https://services-dynarep.ddwa.finra.org/public/reporting/v2/data/group/FixedIncomeMarket/name";

const DELAY_MS = 3000;

export function makeHeaders(): Record<string, string> {
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface BondSecurity {
  cusip: string;
  issueSymbolIdentifier: string;
  issuerName: string;
  couponRate: number;
  maturityDate: string;
}

export interface DailyPrice {
  cusip: string;
  issuer: string;
  date: string; // YYYY-MM-DD
  price: number; // volume-weighted average
  yield: number | null;
  totalVolume: number;
  tradeCount: number;
}

export interface HistoricalResult {
  success: boolean;
  cusip: string;
  symbol?: string;
  issuer?: string;
  couponRate?: number;
  maturityDate?: string;
  prices: DailyPrice[];
  error?: string;
}

/**
 * Lookup productSymbol for a CUSIP via the Securities dataset
 */
export async function lookupSymbol(
  cusip: string,
  headers: Record<string, string>
): Promise<BondSecurity | null> {
  const body = {
    fields: [
      "issueSymbolIdentifier",
      "issuerName",
      "cusip",
      "couponRate",
      "maturityDate",
    ],
    compareFilters: [
      { fieldName: "cusip", fieldValue: cusip, compareType: "EQUAL" },
    ],
    sortFields: [],
    limit: 1,
    offset: 0,
    dateRangeFilters: [],
    domainFilters: [],
    multiFieldMatchFilters: [],
    orFilters: [],
  };

  const res = await fetch(`${BASE}/CorporateAndAgencySecurities`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) return null;

  const data = await res.json();
  const records = JSON.parse(data.returnBody?.data || "[]");
  if (records.length === 0) return null;

  return records[0] as BondSecurity;
}

/**
 * Fetch trade history for a bond symbol within a date range
 */
async function fetchTrades(
  symbol: string,
  startDate: string,
  endDate: string,
  headers: Record<string, string>
): Promise<
  Array<{
    tradeExecutionDate: string;
    lastSalePrice: number;
    lastSaleYield: number | null;
    reportedTradeVolume: number;
  }>
> {
  const allTrades: Array<{
    tradeExecutionDate: string;
    lastSalePrice: number;
    lastSaleYield: number | null;
    reportedTradeVolume: number;
  }> = [];
  let offset = 0;
  const limit = 5000; // max allowed

  // Paginate if needed (most bonds won't need this)
  while (true) {
    const body = {
      fields: [
        "issueSymbolIdentifier",
        "issuerName",
        "tradeExecutionDate",
        "lastSalePrice",
        "lastSaleYield",
        "reportedTradeVolume",
      ],
      compareFilters: [
        {
          fieldName: "issueSymbolIdentifier",
          fieldValue: symbol,
          compareType: "EQUAL",
        },
      ],
      dateRangeFilters: [
        {
          fieldName: "tradeExecutionDate",
          startDate,
          endDate,
        },
      ],
      sortFields: ["-tradeExecutionDate"],
      limit,
      offset,
      domainFilters: [],
      multiFieldMatchFilters: [],
      orFilters: [],
    };

    const res = await fetch(`${BASE}/CorporateAndAgencyTradeHistory`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) break;

    const data = await res.json();
    const records = JSON.parse(data.returnBody?.data || "[]");
    allTrades.push(...records);

    const total = parseInt(
      data.returnBody?.headers?.["Record-Total"]?.[0] || "0"
    );
    offset += records.length;

    if (offset >= total || records.length === 0) break;

    // Rate limit between pagination requests
    await sleep(DELAY_MS);
  }

  return allTrades;
}

/**
 * Aggregate individual trades into daily volume-weighted average prices
 */
function aggregateDailyPrices(
  cusip: string,
  issuer: string,
  trades: Array<{
    tradeExecutionDate: string;
    lastSalePrice: number;
    lastSaleYield: number | null;
    reportedTradeVolume: number;
  }>
): DailyPrice[] {
  const byDate = new Map<
    string,
    { totalPriceVol: number; totalVol: number; yields: number[]; count: number }
  >();

  for (const t of trades) {
    const date = t.tradeExecutionDate;
    const existing = byDate.get(date) || {
      totalPriceVol: 0,
      totalVol: 0,
      yields: [],
      count: 0,
    };

    const vol = t.reportedTradeVolume || 1;
    existing.totalPriceVol += t.lastSalePrice * vol;
    existing.totalVol += vol;
    if (t.lastSaleYield != null) existing.yields.push(t.lastSaleYield);
    existing.count++;

    byDate.set(date, existing);
  }

  const prices: DailyPrice[] = [];
  for (const [date, agg] of byDate) {
    prices.push({
      cusip,
      issuer,
      date,
      price: Math.round((agg.totalPriceVol / agg.totalVol) * 1000) / 1000,
      yield:
        agg.yields.length > 0
          ? Math.round(
              (agg.yields.reduce((a, b) => a + b, 0) / agg.yields.length) *
                1000
            ) / 1000
          : null,
      totalVolume: agg.totalVol,
      tradeCount: agg.count,
    });
  }

  return prices.sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Fetch historical daily prices for a list of CUSIPs
 * @param cusips - Array of CUSIP identifiers
 * @param days - How many days of history (default 90)
 * @param onProgress - Optional callback for progress updates
 */
export async function fetchHistoricalPrices(
  cusips: string[],
  days = 90,
  onProgress?: (cusip: string, index: number, total: number) => void
): Promise<HistoricalResult[]> {
  const headers = makeHeaders();
  const endDate = new Date().toISOString().split("T")[0];
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const results: HistoricalResult[] = [];

  for (let i = 0; i < cusips.length; i++) {
    const cusip = cusips[i];
    onProgress?.(cusip, i, cusips.length);
    console.log(
      `[FINRA hist] ${cusip} (${i + 1}/${cusips.length})...`
    );

    try {
      // Step 1: Lookup symbol
      const security = await lookupSymbol(cusip, headers);
      if (!security) {
        results.push({
          success: false,
          cusip,
          prices: [],
          error: "CUSIP not found in FINRA",
        });
        await sleep(DELAY_MS);
        continue;
      }

      await sleep(DELAY_MS);

      // Step 2: Fetch trades
      const trades = await fetchTrades(
        security.issueSymbolIdentifier,
        startDate,
        endDate,
        headers
      );

      // Step 3: Aggregate daily prices
      const prices = aggregateDailyPrices(
        cusip,
        security.issuerName,
        trades
      );

      console.log(
        `[FINRA hist]   ${security.issuerName}: ${prices.length} days, ${trades.length} trades`
      );

      results.push({
        success: true,
        cusip,
        symbol: security.issueSymbolIdentifier,
        issuer: security.issuerName,
        couponRate: security.couponRate,
        maturityDate: security.maturityDate,
        prices,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(`[FINRA hist]   Error: ${msg}`);
      results.push({ success: false, cusip, prices: [], error: msg });
    }

    // Rate limit between bonds
    if (i < cusips.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  return results;
}
