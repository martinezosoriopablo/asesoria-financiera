"use client";

import { useMemo } from "react";
import { decomposeBondReturn } from "@/lib/bonds/period-return";
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
  couponFrequency?: number | null;
}

interface UseBondCalculationsParams {
  enrichedSummaries: EnrichedSummary[];
  previousSnapshotDate: string | null;
  snapshots: Snapshot[];
  bondPrices: Map<string, { price: number; ytm: number | null; date: string }>;
  ufRate?: number;
  ufRateInitial?: number;
  usdRate?: number;
  eurRate?: number;
}

export function useBondCalculations({
  enrichedSummaries,
  previousSnapshotDate,
  snapshots,
  bondPrices,
  ufRate,
  ufRateInitial,
  usdRate,
  eurRate,
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
        // CAMBIO 1: Read couponFrequency from holding, default 2 (semi-annual)
        const freq = h.couponFrequency || 2;
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

        // All bond calculations require purchaseDate — without it, show raw data only
        let devengoUSD = 0;
        let devengoPct = 0;
        let marketDeviationUSD = 0;
        let totalReturnPct = 0;
        let ytm = 0;
        let duration = 0;
        let marketYieldPct = 0;
        let marketValueCalc: number;
        let displayMarketPricePct: number;

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
          // Duration kept as risk metric only — NOT used for return calculation
          try { duration = calcModifiedDuration(bondParams); } catch { duration = 0; }

          if (isChileanBond) {
            // CAMBIO 3: Chilean — DCF exact reprice (no duration approximation)
            marketYieldPct = h.marketYield != null ? h.marketYield : ytm;
            const newYieldDecimal = marketYieldPct / 100;
            const purchaseYtmDecimal = ytm / 100;

            const result = decomposeBondReturn({
              faceValue,
              couponRate: couponRateDecimal,
              couponFrequency: freq,
              maturityDate: h.maturityDate,
              purchaseDate: h.purchaseDate,
              purchaseCleanPct: costBasisPricePct,
              evalDate: latestDate || previousSnapshotDate || h.purchaseDate,
              // If marketYield != purchaseYTM, reprice by DCF; otherwise no repricing
              newYield: Math.abs(newYieldDecimal - purchaseYtmDecimal) > 1e-8
                ? newYieldDecimal : undefined,
              isChilean: true,
            });

            devengoUSD = result.devengoUSD;
            devengoPct = result.costBasisDirty > 0 ? (devengoUSD / result.costBasisDirty) * 100 : 0;
            marketDeviationUSD = result.repricingUSD;
            marketValueCalc = result.marketValueDirty;
            displayMarketPricePct = faceValue > 0 ? (marketValueCalc / faceValue) * 100 : purchasePricePct;

          } else {
            // CAMBIO 2: International — MV with accrued + repricing from observed price
            if (finraPrice) {
              marketYieldPct = finraPrice.ytm != null ? finraPrice.ytm : ytm;

              const result = decomposeBondReturn({
                faceValue,
                couponRate: couponRateDecimal,
                couponFrequency: freq,
                maturityDate: h.maturityDate,
                purchaseDate: h.purchaseDate,
                purchaseCleanPct: costBasisPricePct,
                evalDate: latestDate || previousSnapshotDate || h.purchaseDate,
                observedCleanPct: finraPrice.price,
                isChilean: false,
              });

              devengoUSD = result.devengoUSD;
              devengoPct = result.costBasisDirty > 0 ? (devengoUSD / result.costBasisDirty) * 100 : 0;
              marketDeviationUSD = result.repricingUSD;
              // MV dirty = clean + accrued (from decompose)
              marketValueCalc = result.marketValueDirty;
              displayMarketPricePct = finraPrice.price; // display clean for table
            } else {
              // No FINRA price — fallback to cartola price, no repricing
              const result = decomposeBondReturn({
                faceValue,
                couponRate: couponRateDecimal,
                couponFrequency: freq,
                maturityDate: h.maturityDate,
                purchaseDate: h.purchaseDate,
                purchaseCleanPct: costBasisPricePct,
                evalDate: latestDate || previousSnapshotDate || h.purchaseDate,
                isChilean: false,
              });

              devengoUSD = result.devengoUSD;
              devengoPct = result.costBasisDirty > 0 ? (devengoUSD / result.costBasisDirty) * 100 : 0;
              marketDeviationUSD = 0;
              displayMarketPricePct = cartolaMarketPricePct;
              marketValueCalc = faceValue * displayMarketPricePct / 100;
            }
          }

          // Total return % — uses purchasePricePct (mode-dependent) for return base
          const returnBase = faceValue * purchasePricePct / 100;
          totalReturnPct = returnBase > 0
            ? ((devengoUSD + marketDeviationUSD) / returnBase) * 100
            : 0;
        } else {
          // No purchaseDate — raw data only
          if (isChileanBond) {
            const costBasisCalcForMV = faceValue * costBasisPricePct / 100;
            marketValueCalc = costBasisCalcForMV;
            displayMarketPricePct = faceValue > 0 ? (marketValueCalc / faceValue) * 100 : purchasePricePct;
          } else {
            const finraPriceForDisplay = finraPrice ? finraPrice.price : cartolaMarketPricePct;
            displayMarketPricePct = finraPriceForDisplay;
            marketValueCalc = faceValue * displayMarketPricePct / 100;
          }
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
        } else if (!isChileanBond && h.currency === "EUR" && eurRate) {
          marketValueCalc *= eurRate;
          actualCostBasis *= eurRate;
          devengoUSD *= eurRate;
          marketDeviationUSD *= eurRate;
        } else if (!isChileanBond && usdRate) {
          // USD and other currencies fallback
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
          currency: isChileanBond ? "UF" : (h.currency === "EUR" ? "EUR" : "USD"), // original denomination (value is CLP-converted)
        };
      });
  }, [enrichedSummaries, previousSnapshotDate, snapshots, bondPrices, ufRate, ufRateInitial, usdRate, eurRate]);

  return bondHoldings;
}
