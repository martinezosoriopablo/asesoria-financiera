// Cost basis tracking for portfolio holdings.
// Rules:
// - New position (no previous match): costBasis = cartola price
// - Same quantity between cartolas: inherit previous costBasis
// - Quantity changed: new costBasis from the new cartola price

export interface HoldingWithCostBasis {
  fundName: string;
  securityId?: string | null;
  quantity?: number;
  marketPrice?: number;
  marketValue: number;
  costBasis?: number;
  costBasisDate?: string;
  [key: string]: unknown;
}

/**
 * Match a current holding against previous holdings.
 * Priority: securityId exact match > fundName exact match.
 */
export function matchHolding(
  current: { fundName: string; securityId?: string | null; [key: string]: unknown },
  previousHoldings: HoldingWithCostBasis[]
): HoldingWithCostBasis | null {
  if (!previousHoldings || previousHoldings.length === 0) return null;

  // Try securityId first
  if (current.securityId) {
    const match = previousHoldings.find(
      (p) => p.securityId && p.securityId === current.securityId
    );
    if (match) return match;
  }

  // Fall back to fundName
  const nameMatch = previousHoldings.find(
    (p) => p.fundName === current.fundName
  );
  return nameMatch || null;
}

/**
 * Calculate cost basis for a single holding given its previous state.
 * Returns { costBasis, costBasisDate }.
 */
export function calculateCostBasis(
  current: { fundName: string; quantity?: number; marketPrice?: number; marketValue: number; [key: string]: unknown },
  previous: HoldingWithCostBasis | null,
  snapshotDate: string
): { costBasis: number; costBasisDate: string } {
  const cartolaPrice = current.marketPrice || (current.quantity ? current.marketValue / current.quantity : current.marketValue);

  // No previous match or legacy data without costBasis
  if (!previous || previous.costBasis == null || previous.costBasisDate == null) {
    return { costBasis: cartolaPrice, costBasisDate: snapshotDate };
  }

  // Same quantity → inherit
  const currentQty = current.quantity ?? 0;
  const previousQty = previous.quantity ?? 0;
  if (currentQty === previousQty) {
    return { costBasis: previous.costBasis, costBasisDate: previous.costBasisDate };
  }

  // Quantity changed → new cost basis
  return { costBasis: cartolaPrice, costBasisDate: snapshotDate };
}

/**
 * Enrich an array of holdings with cost basis data,
 * matching each against the previous snapshot's holdings.
 */
export function enrichHoldingsWithCostBasis(
  holdings: HoldingWithCostBasis[],
  previousHoldings: HoldingWithCostBasis[],
  snapshotDate: string
): HoldingWithCostBasis[] {
  return holdings.map((holding) => {
    const match = matchHolding(holding, previousHoldings);
    const { costBasis, costBasisDate } = calculateCostBasis(holding, match, snapshotDate);
    return { ...holding, costBasis, costBasisDate };
  });
}
