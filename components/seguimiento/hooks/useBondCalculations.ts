"use client";

import { useMemo } from "react";
import { calcBondPeriodReturn } from "@/lib/bonds/period-return";
import { calcYieldToMaturity } from "@/lib/bonds/yield";
import { calcModifiedDuration } from "@/lib/bonds/duration";
import type { BondHoldingRow } from "../FixedIncomeSection";
import type { Snapshot } from "../SeguimientoPage";

interface HoldingData {
  fundName: string;
  marketValue: number;
}

interface EnrichedSummary {
  fundName: string;
  assetType: string;
  securityId: string | null;
  couponRate: number | null;
  maturityDate: string | null;
  creditRating: string | null;
  purchasePrice: number;
  currentPrice: number;
  purchaseDate: string | null;
  marketValue: number;
  weight: number;
  quantity: number;
  currency: string;
  costBasis: number | null;
  unitCost: number | null;
  marketYield: number | null;
}

interface UseBondCalculationsParams {
  enrichedSummaries: EnrichedSummary[];
  previousSnapshotDate: string | null;
  snapshots: Snapshot[];
  bondPrices: Map<string, { price: number; ytm: number | null; date: string }>;
  ufRate?: number;
  ufRateInitial?: number;
  usdRate?: number;
}

export function useBondCalculations({
  enrichedSummaries,
  previousSnapshotDate,
  snapshots,
  bondPrices,
  ufRate,
  ufRateInitial,
  usdRate,
}: UseBondCalculationsParams): BondHoldingRow[] {
  const bondHoldings: BondHoldingRow[] = useMemo(() => {
    const latestDate = snapshots
      .filter(s => s.holdings && (s.holdings as HoldingData[]).length > 0)
      .sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date))[0]?.snapshot_date;

    // Bond prices from Stonex cartolas are stored as decimals (1.0375 = 103.75% of par)
    // Convert to % of par if the price looks like a decimal ratio
    const toBondPricePct = (price: number): number => {
      if (price > 0 && price < 3) return price * 100; // 1.0375 → 103.75
      return price; // already in % of par (e.g., 103.75)
    };

    return enrichedSummaries
      .filter(h => h.assetType === "bond")
      .map(h => {
        const couponRatePct = h.couponRate || 0;
        const couponRateDecimal = couponRatePct / 100;
        // purchasePrice changes with returnMode toggle — used for return calculation
        const purchasePricePct = toBondPricePct(h.purchasePrice);
        const cartolaMarketPricePct = toBondPricePct(h.currentPrice);
        // costBasisPricePct is always the actual cost basis — used for market value calc
        const costBasisPricePct = toBondPricePct(h.costBasis || h.unitCost || h.purchasePrice);

        // Chilean bond = no valid CUSIP (9-char alphanumeric) and no FINRA price
        const secId = (h.securityId || "").trim();
        const hasValidCusip = /^[A-Z0-9]{9}$/i.test(secId);
        const finraPrice = bondPrices.get(h.fundName);
        const isChileanBond = !hasValidCusip && !finraPrice;

        const faceValue = h.quantity || (cartolaMarketPricePct > 0 ? h.marketValue / (cartolaMarketPricePct / 100) : 0);
        const freq = 2; // semi-annual default

        // All bond calculations require purchaseDate — without it, show raw data only
        let devengoUSD = 0;
        let devengoPct = 0;
        let marketDeviationUSD = 0;
        let totalReturnPct = 0;
        let ytm = 0;
        let duration = 0;
        let marketYieldPct = 0;

        if (h.purchaseDate && h.maturityDate && couponRateDecimal > 0) {
          // Bond model always uses actual cost basis for YTM, devengo, duration
          const bondParams = {
            faceValue,
            couponRate: couponRateDecimal,
            couponFrequency: freq,
            maturityDate: h.maturityDate,
            purchaseDate: h.purchaseDate,
            purchasePrice: costBasisPricePct,
            currentPrice: costBasisPricePct, // solve at cost basis → TIR de compra
          };

          try { ytm = calcYieldToMaturity(bondParams, new Date(h.purchaseDate + "T00:00:00")) * 100; } catch { ytm = 0; }
          try { duration = calcModifiedDuration(bondParams); } catch { duration = 0; }

          // --- Unified model for ALL bonds (Chilean + international) ---
          // Devengo: linear accrual at purchase YTM (independent of market)
          const periodResult = calcBondPeriodReturn({
            faceValue,
            couponRate: couponRateDecimal,
            couponFrequency: freq,
            maturityDate: h.maturityDate,
            purchasePrice: costBasisPricePct,
            currentPrice: costBasisPricePct, // devengo only — same as purchase
            startDate: previousSnapshotDate || h.purchaseDate,
            endDate: latestDate || previousSnapshotDate || h.purchaseDate,
            purchaseDate: h.purchaseDate,
          });
          devengoUSD = periodResult.devengoUSD;
          devengoPct = periodResult.devengoPct;

          // Market deviation via duration × Δyield
          // Chilean: marketYield from advisor (default = purchaseYTM → deviation = 0)
          // International: marketYield from FINRA
          if (isChileanBond) {
            marketYieldPct = h.marketYield != null ? h.marketYield : ytm;
          } else {
            marketYieldPct = finraPrice?.ytm != null ? finraPrice.ytm : ytm;
          }
          const yieldDeltaDecimal = (marketYieldPct - ytm) / 100;
          marketDeviationUSD = -duration * yieldDeltaDecimal * faceValue;

          // Total return = devengo + market deviation (duration approx)
          // Uses purchasePricePct (mode-dependent) for return, costBasisPricePct for MV
          const returnBase = faceValue * purchasePricePct / 100;
          totalReturnPct = returnBase > 0
            ? ((devengoUSD + marketDeviationUSD) / returnBase) * 100
            : 0;
        }

        // Market value today:
        // International bonds: use actual FINRA price
        // Chilean bonds: costBasis + devengo + marketDeviation (valued at purchaseYTM,
        //   adjusted by duration × Δyield if advisor provided a different marketYield)
        // Always uses costBasisPricePct — MV is independent of returnMode toggle
        let marketValueCalc: number;
        let displayMarketPricePct: number;
        if (isChileanBond) {
          const costBasisCalcForMV = faceValue * costBasisPricePct / 100;
          marketValueCalc = costBasisCalcForMV + devengoUSD + marketDeviationUSD;
          // Back-derive display price as % of par for the table
          displayMarketPricePct = faceValue > 0 ? (marketValueCalc / faceValue) * 100 : purchasePricePct;
        } else {
          const finraPriceForDisplay = finraPrice ? finraPrice.price : cartolaMarketPricePct;
          displayMarketPricePct = finraPriceForDisplay;
          marketValueCalc = faceValue * displayMarketPricePct / 100;
        }

        // costBasis from cartola may be price-as-%-of-par (e.g. 87.825) rather than total amount.
        // Use calculated costBasis (faceValue × costBasisPrice%) which is always in the right units.
        const calcCostBasis = faceValue * costBasisPricePct / 100;
        let actualCostBasis = calcCostBasis;

        // Convert to CLP based on currency
        if (isChileanBond && ufRate) {
          // Chilean bonds are in UF
          marketValueCalc *= ufRate;
          actualCostBasis *= (ufRateInitial || ufRate);
          devengoUSD *= ufRate;
          marketDeviationUSD *= ufRate;
        } else if (!isChileanBond && usdRate) {
          // International bonds are in USD
          marketValueCalc *= usdRate;
          actualCostBasis *= usdRate;
          devengoUSD *= usdRate;
          marketDeviationUSD *= usdRate;
        }

        return {
          fundName: h.fundName,
          cusip: h.securityId || "",
          creditRating: h.creditRating || "NR",
          couponRate: couponRatePct,
          maturityDate: h.maturityDate || "",
          weight: 0, // recalculated below after totalValue is known
          purchasePrice: purchasePricePct,
          costBasis: actualCostBasis,
          marketPrice: displayMarketPricePct,
          ytm,
          marketYield: marketYieldPct,
          duration,
          devengoUSD,
          devengoPct,
          marketDeviationUSD,
          totalReturn: totalReturnPct,
          contribution: h.weight > 0 ? (totalReturnPct * h.weight) / 100 : 0,
          marketValue: marketValueCalc,
          currency: isChileanBond ? "UF" : "USD", // original denomination (value is CLP-converted)
        };
      });
  }, [enrichedSummaries, previousSnapshotDate, snapshots, bondPrices, ufRate, ufRateInitial, usdRate]);

  return bondHoldings;
}
