/**
 * Portfolio classification utilities.
 * Extracted from ReviewSnapshotModal — pure functions, no React dependencies.
 */

export function detectCurrencyFromName(fundName: string): string {
  const name = fundName.toLowerCase();
  if (name.includes("usd") || name.includes("dollar") || name.includes("dolar") ||
      name.includes("us ") || name.includes("(us)") || name.includes("eeuu") ||
      name.includes("usa") || name.includes("global") || name.includes("international")) {
    return "USD";
  }
  if (name.includes("eur") || name.includes("euro") || name.includes("europa") ||
      name.includes("european")) {
    return "EUR";
  }
  if (name.includes(" uf") || name.includes("(uf)") || name.includes("uf ")) {
    return "UF";
  }
  if (name.includes("clp") || name.includes("peso") || name.includes("chile") ||
      name.includes("local") || name.includes("nacional")) {
    return "CLP";
  }
  return "USD";
}

export function assetTypeToClass(assetType?: string): string | null {
  if (!assetType) return null;
  switch (assetType) {
    case "bond": return "fixedIncome";
    case "cash": return "cash";
    case "etf":
    case "stock": return "equity";
    default: return null; // fund/other — fall through to classifyFund
  }
}

export function classifyFund(fundName: string): string {
  const name = fundName.toLowerCase();
  if (name.includes("money market") || name.includes("mm ") || name.includes("liquidez") ||
      name.includes("efectivo") || name.includes("cash") || name.includes("disponible")) {
    return "cash";
  }
  if (name.includes("renta fija") || name.includes("fixed income") || name.includes("bond") ||
      name.includes("bono") || name.includes("deuda") || name.includes("corporate") ||
      name.includes("soberan") || name.includes("high yield") || name.includes("investment grade") ||
      name.includes("ig ") || name.includes("hy ") || name.includes("rf ") ||
      name.includes("deposito") || name.includes("depósito") || name.includes("pacto")) {
    return "fixedIncome";
  }
  if (name.includes("balanced") || name.includes("balanceado") || name.includes("mixto") ||
      name.includes("multi-asset") || name.includes("multiactivo") || name.includes("allocation") ||
      name.includes("moderate") || name.includes("moderado")) {
    return "balanced";
  }
  if (name.includes("alternativ") || name.includes("real estate") || name.includes("inmobiliario") ||
      name.includes("private equity") || name.includes("hedge") || name.includes("commodity") ||
      name.includes("infraestruct") || name.includes("real asset")) {
    return "alternatives";
  }
  return "equity";
}
