import { useMemo } from "react";
import { inferInstrumentType } from "@/lib/instrument-type";
import { parseBondName } from "@/lib/bonds/parse-bond-name";
import type { Snapshot } from "../SeguimientoPage";
import { useHoldingQuotes } from "./useHoldingQuotes";

export interface HoldingData {
  fundName: string;
  securityId?: string | null;
  serie?: string;
  quantity?: number;
  marketPrice?: number;
  unitCost?: number;
  costBasis?: number;
  marketValue: number;
  marketValueCLP?: number;
  assetClass?: string;
  assetType?: string;
  currency?: string;
  market?: string;
  returnFromBase?: number;
  weight?: number;
  // Income fields (from cartola)
  estIncomeYield?: number | null;
  estAnnualIncome?: number | null;
  // Bond-specific
  couponRate?: number | null;
  maturityDate?: string | null;
  creditRating?: string | null;
  purchaseDate?: string | null;
  marketYield?: number | null;
}

interface FundMeta {
  fundName: string;
  run: string;
  serie: string;
  tac: number | null;
  quantity: number;
}

interface UseHoldingSummariesParams {
  snapshots: Snapshot[];
  returnMode: "cartola" | "compra";
  fundsMeta?: FundMeta[];
  usdRate?: number;
  ufRate?: number;
  pricesAtDateEndpoint?: string;
}

export function useHoldingSummaries({
  snapshots,
  returnMode,
  fundsMeta,
  usdRate,
  ufRate,
  pricesAtDateEndpoint = "/api/portfolio/prices-at-date",
}: UseHoldingSummariesParams) {
  // Extract unique holdings and their returns over time from snapshots
  // Note: usdRate/ufRate used to convert non-CLP holdings to CLP at build time
  const { holdingSummaries, latestRawHoldings, previousSnapshotDate } = useMemo(() => {
    const snapshotsWithHoldings = snapshots
      .filter((s) => s.holdings && Array.isArray(s.holdings) && s.holdings.length > 0)
      .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));

    if (snapshotsWithHoldings.length === 0) {
      return { holdingSummaries: [] as ReturnType<typeof buildSummaries>, latestRawHoldings: [] as HoldingData[], previousSnapshotDate: null as string | null };
    }

    // Find previous snapshot date for period calculations
    const cartolas = snapshotsWithHoldings.filter(
      (s) => s.source === "statement" || s.source === "manual" || s.source === "excel"
    );
    const prevSnapDate = cartolas.length >= 2
      ? cartolas[cartolas.length - 2].snapshot_date
      : cartolas.length === 1
        ? cartolas[0].snapshot_date
        : snapshotsWithHoldings[0].snapshot_date;

    // For each holding, find the base price from the FIRST cartola
    const cartolaBasePrices = new Map<string, number>(); // market price at cartola date
    const compraBasePrices = new Map<string, number>();   // cost basis (purchase price)
    const purchaseDates = new Map<string, string>();

    // Purchase price: costBasis first (set by enrichHoldingsWithCostBasis), then legacy fallbacks
    const extractPurchasePrice = (h: HoldingData): number => {
      // 1. costBasis — set by enrichHoldingsWithCostBasis on save (per-unit acquisition price)
      const cb2 = Number(h.costBasis);
      if (cb2 > 0 && isFinite(cb2)) return cb2;
      // 2. unitCost — actual purchase price per unit (legacy)
      const uc = Number(h.unitCost);
      if (uc > 0 && isFinite(uc)) return uc;
      // 3. marketPrice — price at cartola date (fallback)
      const mp = Number(h.marketPrice);
      if (mp > 0 && isFinite(mp)) return mp;
      // 4. marketValue / quantity
      const qty = Number(h.quantity);
      const mv = Number(h.marketValue);
      if (qty > 0 && mv > 0) return mv / qty;
      const mvCLP = Number(h.marketValueCLP);
      if (qty > 0 && mvCLP > 0) return mvCLP / qty;
      return 0;
    };

    // Current market price: marketPrice first, then marketValue/quantity
    const extractMarketPrice = (h: HoldingData): number => {
      const mp = Number(h.marketPrice);
      if (mp > 0 && isFinite(mp)) return mp;
      const qty = Number(h.quantity);
      const mv = Number(h.marketValue);
      if (qty > 0 && mv > 0) return mv / qty;
      const mvCLP = Number(h.marketValueCLP);
      if (qty > 0 && mvCLP > 0) return mvCLP / qty;
      // Last resort: unitCost
      const uc = Number(h.unitCost);
      if (uc > 0 && isFinite(uc)) return uc;
      return 0;
    };

    for (const cartola of cartolas) {
      if (!cartola.holdings) continue;
      for (const h of cartola.holdings as HoldingData[]) {
        if (h.fundName && !cartolaBasePrices.has(h.fundName)) {
          const mktPrice = extractMarketPrice(h);
          if (mktPrice > 0) {
            cartolaBasePrices.set(h.fundName, mktPrice);
            purchaseDates.set(h.fundName, cartola.snapshot_date);
          }
          const purchasePrice = extractPurchasePrice(h);
          if (purchasePrice > 0) {
            compraBasePrices.set(h.fundName, purchasePrice);
          }
        }
      }
    }

    // Select base prices according to returnMode
    const basePrices = returnMode === "compra" ? compraBasePrices : cartolaBasePrices;

    // Build summary from latest snapshot
    const apiPricesSnaps = snapshotsWithHoldings.filter(s => s.source === "api-prices");
    const latestSnap = apiPricesSnaps.length > 0
      ? apiPricesSnaps[apiPricesSnaps.length - 1]
      : snapshotsWithHoldings[snapshotsWithHoldings.length - 1];
    const latestHoldings = latestSnap.holdings as HoldingData[];
    const latestTotal = latestSnap.total_value || latestHoldings.reduce((s, h) => s + (h.marketValue || 0), 0);

    // Build a map of bond-specific fields from the original cartola (statement/manual)
    // because api-prices snapshots don't carry couponRate, maturityDate, creditRating, etc.
    const cartolaFieldsByName = new Map<string, Partial<HoldingData>>();
    for (const cartola of cartolas) {
      if (!cartola.holdings) continue;
      for (const h of cartola.holdings as HoldingData[]) {
        if (!h.fundName) continue;
        // Only overwrite if this cartola has more data
        const existing = cartolaFieldsByName.get(h.fundName);
        if (!existing || (!existing.couponRate && h.couponRate) || (!existing.creditRating && h.creditRating)) {
          cartolaFieldsByName.set(h.fundName, {
            assetType: h.assetType,
            assetClass: h.assetClass,
            couponRate: h.couponRate,
            maturityDate: h.maturityDate,
            creditRating: h.creditRating,
            unitCost: h.unitCost,
            costBasis: h.costBasis,
            currency: h.currency,
            market: h.market,
            estIncomeYield: h.estIncomeYield,
            estAnnualIncome: h.estAnnualIncome,
            purchaseDate: h.purchaseDate,
            marketYield: h.marketYield,
          });
        }
      }
    }

    function buildSummaries() {
      return latestHoldings
        .filter((h) => h.fundName && h.marketValue > 0)
        .map((h) => {
          // Merge with cartola fields (api-prices snapshots lose bond data)
          const cf = cartolaFieldsByName.get(h.fundName);
          const currentPrice = extractMarketPrice(h);
          const purchasePrice = basePrices.get(h.fundName) || currentPrice;
          const returnCalc = purchasePrice > 0 ? ((currentPrice / purchasePrice) - 1) * 100 : 0;

          const merged = cf ? { ...h, ...Object.fromEntries(Object.entries(cf).filter(([, v]) => v != null && v !== undefined)) } : h;
          const assetType = inferInstrumentType(merged);
          const base = {
            fundName: h.fundName,
            marketValue: h.marketValue,
            currentPrice,
            purchasePrice,
            purchaseDate: merged.purchaseDate || purchaseDates.get(h.fundName) || null,
            quantity: h.quantity || 0,
            weight: h.weight || (latestTotal > 0 ? Math.round((h.marketValue / latestTotal) * 10000) / 100 : 0),
            returnFromBase: Math.round(returnCalc * 100) / 100,
            assetClass: merged.assetClass || "equity",
            assetType,
            currency: merged.currency || "CLP",
            market: merged.market || h.market || null,
            // Bond fields — prefer cartola data over api-prices
            couponRate: merged.couponRate || null,
            maturityDate: merged.maturityDate || null,
            creditRating: merged.creditRating || null,
            unitCost: merged.unitCost || null,
            costBasis: merged.costBasis || null,
            securityId: h.securityId || null,
            serie: h.serie || null,
            estIncomeYield: merged.estIncomeYield || null,
            estAnnualIncome: merged.estAnnualIncome || null,
            marketYield: merged.marketYield ?? null,
          };

          // For bonds, extract coupon/maturity/rating from fundName if missing
          if (assetType === "bond") {
            return parseBondName(base);
          }
          return base;
        })
        .sort((a, b) => (b.weight || 0) - (a.weight || 0));
    }

    return {
      holdingSummaries: buildSummaries(),
      latestRawHoldings: latestHoldings,
      previousSnapshotDate: prevSnapDate,
    };
  }, [snapshots, returnMode]);

  // Fetch market prices, bond lookups, and bond prices via unified hook
  const { marketPrices, bondLookups, bondPrices, loadingPrices } = useHoldingQuotes(holdingSummaries, pricesAtDateEndpoint);

  // Build TAC map from fundsMeta
  const tacByFundName = useMemo(() => {
    const map = new Map<string, number | null>();
    if (!fundsMeta || fundsMeta.length === 0 || !latestRawHoldings) return map;
    for (const raw of latestRawHoldings as HoldingData[]) {
      const secId = (raw.securityId || "").trim();
      const serie = (raw.serie || "").trim();
      if (!secId || !serie) continue;
      const meta = fundsMeta.find((m) => m.run === secId && m.serie.toUpperCase() === serie.toUpperCase());
      if (meta && raw.fundName) map.set(raw.fundName, meta.tac);
    }
    return map;
  }, [fundsMeta, latestRawHoldings]);

  // Merge prices and bond lookups into summaries
  const enrichedSummaries = useMemo(() => {
    const mapped = holdingSummaries.map((h) => {
      const tac = tacByFundName.get(h.fundName) ?? null;

      // Enrich bonds with FINRA lookup data (coupon, maturity)
      let enriched = { ...h, tac };
      if (h.assetType === "bond") {
        const bl = bondLookups.get(h.fundName);
        if (bl) {
          if (!enriched.couponRate && bl.couponRate) enriched = { ...enriched, couponRate: bl.couponRate };
          if (!enriched.maturityDate && bl.maturityDate) enriched = { ...enriched, maturityDate: bl.maturityDate };
        }
        return enriched; // bonds use their own pricing logic (FINRA)
      }

      // Unified market price from prices-at-date
      const mp = marketPrices.get(h.fundName);
      if (mp && mp.price > 0) {
        const returnCalc = h.purchasePrice > 0
          ? ((mp.price / h.purchasePrice) - 1) * 100
          : 0;
        const priceIsCLP = mp.currency === "CLP";
        const priceIsUF = mp.currency === "UF";
        let newMarketValue = h.marketValue;
        if (h.quantity > 0) {
          if (priceIsCLP) {
            newMarketValue = h.quantity * mp.price;
          } else if (priceIsUF && ufRate) {
            newMarketValue = h.quantity * mp.price * ufRate;
          } else if (usdRate) {
            newMarketValue = h.quantity * mp.price * usdRate;
          }
        }

        return {
          ...enriched,
          currentPrice: mp.price,
          marketValue: newMarketValue,
          currency: priceIsCLP ? "CLP" : enriched.currency,
          returnFromBase: Math.round(returnCalc * 100) / 100,
        };
      }

      // No market price update — convert non-CLP marketValue to CLP
      if (enriched.currency === "USD" && usdRate && enriched.marketValue > 0) {
        return { ...enriched, marketValue: enriched.marketValue * usdRate };
      }
      if (enriched.currency === "UF" && ufRate && enriched.marketValue > 0) {
        return { ...enriched, marketValue: enriched.marketValue * ufRate };
      }
      return enriched;
    });
    // Weights will be recalculated after totalValue is known (includes bonds)
    return mapped;
  }, [holdingSummaries, marketPrices, bondLookups, tacByFundName, usdRate, ufRate]);

  return { holdingSummaries, latestRawHoldings, enrichedSummaries, previousSnapshotDate, bondPrices, loadingPrices };
}
