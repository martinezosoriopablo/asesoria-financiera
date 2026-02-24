// Mapping of mutual fund names to Yahoo Finance symbols
// These symbols have been verified to have 12 months of historical data

export interface YahooFundMapping {
  yahooSymbol: string;
  currency: string;
  fundName: string;
  keywords: string[]; // Keywords to match in fund names
}

export const YAHOO_FUND_MAPPINGS: YahooFundMapping[] = [
  {
    yahooSymbol: "0P00018JE8",
    currency: "USD",
    fundName: "Robeco Global Credits",
    keywords: ["robeco", "global credits", "robeco qp global"]
  },
  {
    yahooSymbol: "0P00009X6K",
    currency: "USD",
    fundName: "Ninety One GSF Global Strategic Managed",
    keywords: ["ninety one", "91", "global strategic", "gsf glb stratmgd"]
  },
  {
    yahooSymbol: "0P0001K4MB",
    currency: "USD",
    fundName: "Goldman Sachs US Dollar Credit",
    keywords: ["goldman sachs", "dollar credit", "gs us dollar", "gs usd credit"]
  },
  {
    yahooSymbol: "0P000019AY",
    currency: "USD",
    fundName: "JPMorgan US Value",
    keywords: ["jpmorgan", "jp morgan", "jpm", "us value"]
  },
  {
    yahooSymbol: "0P0000TF49.F",
    currency: "EUR",
    fundName: "FTGF Western Asset Global Multi Strategy",
    keywords: ["ftgf", "western asset", "global multi strategy", "franklin templeton"]
  },
  {
    yahooSymbol: "0P0001O24Q.TO",
    currency: "CAD",
    fundName: "Wellington Opportunistic Fixed Income",
    keywords: ["wellington", "opportunistic", "fixed income"]
  },
  {
    yahooSymbol: "0P0001DIK3",
    currency: "USD",
    fundName: "FTGF Western Asset Structured Opportunities",
    keywords: ["western asset structured", "structured opportunities"]
  },
  {
    yahooSymbol: "0P00014FAI.F",
    currency: "EUR",
    fundName: "FTGF Western Asset Macro Opportunities Bond",
    keywords: ["western asset macro", "macro opportunities"]
  },
  {
    yahooSymbol: "0P0001NKPG",
    currency: "USD",
    fundName: "Ninety One Global Strategic Managed J Acc",
    keywords: ["ninety one", "strategic managed j"]
  },
  {
    yahooSymbol: "0P0000KL1E",
    currency: "USD",
    fundName: "Ninety One Global Franchise",
    keywords: ["ninety one franchise", "global franchise"]
  },
  {
    yahooSymbol: "017S.MU",
    currency: "EUR",
    fundName: "Schroder Asian Opportunities",
    keywords: ["schroder", "asian opportunities", "schroder isf asian"]
  },
  // ETFs (for reference, Alpha Vantage is preferred)
  {
    yahooSymbol: "VOO",
    currency: "USD",
    fundName: "Vanguard S&P 500 ETF",
    keywords: ["voo", "vanguard s&p", "vanguard 500"]
  },
  {
    yahooSymbol: "VTI",
    currency: "USD",
    fundName: "Vanguard Total Stock Market ETF",
    keywords: ["vti", "vanguard total stock", "total market"]
  },
  {
    yahooSymbol: "BND",
    currency: "USD",
    fundName: "Vanguard Total Bond Market ETF",
    keywords: ["bnd", "vanguard bond", "total bond"]
  },
  {
    yahooSymbol: "VXUS",
    currency: "USD",
    fundName: "Vanguard Total International Stock ETF",
    keywords: ["vxus", "vanguard international", "total international"]
  }
];

/**
 * Find Yahoo Finance symbol for a given fund name
 */
export function findYahooSymbol(fundName: string): YahooFundMapping | null {
  const nameLower = fundName.toLowerCase();

  for (const mapping of YAHOO_FUND_MAPPINGS) {
    for (const keyword of mapping.keywords) {
      if (nameLower.includes(keyword.toLowerCase())) {
        return mapping;
      }
    }
  }

  return null;
}

/**
 * Check if a symbol is a Yahoo Finance OTC symbol (starts with 0P)
 */
export function isYahooOTCSymbol(symbol: string): boolean {
  return symbol.startsWith("0P") || symbol.includes(".F") || symbol.includes(".TO") || symbol.includes(".MU");
}

/**
 * Determine the best data source for a given fund
 */
export function getBestDataSource(fundName: string, ticker?: string): "alphavantage" | "yahoo" {
  // If ticker is an ETF (short symbol like VOO, VTI, BND), use Alpha Vantage
  if (ticker && /^[A-Z]{2,5}$/.test(ticker)) {
    return "alphavantage";
  }

  // If we have a Yahoo mapping, use Yahoo Finance
  const yahooMapping = findYahooSymbol(fundName);
  if (yahooMapping) {
    return "yahoo";
  }

  // Default to Alpha Vantage
  return "alphavantage";
}
