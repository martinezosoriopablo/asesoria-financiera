export interface ParsedHolding {
  fundName: string;
  securityId: string;
  quantity: number;
  unitCost: number;
  costBasis: number;
  marketPrice: number;
  marketValue: number;
  unrealizedGainLoss: number;
}

export interface ClassifiedHolding extends ParsedHolding {
  assetClass: "Equity" | "Fixed Income" | "Cash";
  region: string;
  percentOfPortfolio: number;
}

export interface PortfolioComposition {
  totalValue: number;
  holdings: ClassifiedHolding[];
  byAssetClass: Record<string, { value: number; percent: number }>;
  byRegion: Record<string, { value: number; percent: number }>;
}

const FIXED_INCOME_KEYWORDS = [
  "bond",
  "fixed income",
  "credit",
  "aggregate",
  "income",
  "debt",
  "treasury",
  "sovereign",
  "high yield",
  "investment grade",
  "short duration",
  "short term",
  "money market",
  "renta fija",
];

const EQUITY_KEYWORDS = [
  "equity",
  "stock",
  "value",
  "growth",
  "select",
  "dividend",
  "capital appreciation",
  "index",
  "s&p",
  "nasdaq",
  "renta variable",
  "accion",
];

const REGION_PATTERNS: [RegExp, string][] = [
  [/latin\s*americ|latam|brazil|mexico|chile|andean/i, "Latin America"],
  [/emerg|em\b/i, "Emerging Markets"],
  [/asia|asian|pacific|china|japan|india/i, "Asia Pacific"],
  [/europ|euro\b/i, "Europe"],
  [/global|world|international|intl/i, "Global"],
  [/u\.?s\.?\b|america|usa|us\s/i, "United States"],
];

function classifyAssetClass(
  fundName: string
): "Equity" | "Fixed Income" | "Cash" {
  const lower = fundName.toLowerCase();

  if (
    lower.includes("cash") ||
    lower.includes("money market") ||
    lower.includes("liquidity")
  ) {
    return "Cash";
  }

  if (FIXED_INCOME_KEYWORDS.some((kw) => lower.includes(kw))) {
    return "Fixed Income";
  }

  if (EQUITY_KEYWORDS.some((kw) => lower.includes(kw))) {
    return "Equity";
  }

  return "Equity";
}

function classifyRegion(fundName: string): string {
  for (const [pattern, region] of REGION_PATTERNS) {
    if (pattern.test(fundName)) {
      return region;
    }
  }
  return "Global";
}

export function classifyPortfolio(
  holdings: ParsedHolding[],
  cashBalance: number = 0
): PortfolioComposition {
  const totalFromHoldings = holdings.reduce((s, h) => s + h.marketValue, 0);
  const totalValue = totalFromHoldings + cashBalance;

  const classified: ClassifiedHolding[] = holdings.map((h) => ({
    ...h,
    assetClass: classifyAssetClass(h.fundName),
    region: classifyRegion(h.fundName),
    percentOfPortfolio: totalValue > 0 ? (h.marketValue / totalValue) * 100 : 0,
  }));

  if (cashBalance > 0) {
    classified.push({
      fundName: "Cash Balance",
      securityId: "CASH",
      quantity: 1,
      unitCost: cashBalance,
      costBasis: cashBalance,
      marketPrice: cashBalance,
      marketValue: cashBalance,
      unrealizedGainLoss: 0,
      assetClass: "Cash",
      region: "N/A",
      percentOfPortfolio: (cashBalance / totalValue) * 100,
    });
  }

  const byAssetClass: Record<string, { value: number; percent: number }> = {};
  const byRegion: Record<string, { value: number; percent: number }> = {};

  for (const h of classified) {
    if (!byAssetClass[h.assetClass]) {
      byAssetClass[h.assetClass] = { value: 0, percent: 0 };
    }
    byAssetClass[h.assetClass].value += h.marketValue;

    if (!byRegion[h.region]) {
      byRegion[h.region] = { value: 0, percent: 0 };
    }
    byRegion[h.region].value += h.marketValue;
  }

  for (const key of Object.keys(byAssetClass)) {
    byAssetClass[key].percent =
      totalValue > 0 ? (byAssetClass[key].value / totalValue) * 100 : 0;
  }
  for (const key of Object.keys(byRegion)) {
    byRegion[key].percent =
      totalValue > 0 ? (byRegion[key].value / totalValue) * 100 : 0;
  }

  return { totalValue, holdings: classified, byAssetClass, byRegion };
}
