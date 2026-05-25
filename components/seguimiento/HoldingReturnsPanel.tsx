"use client";

import React, { useState, useMemo, useEffect } from "react";
import { BarChart3, Loader } from "lucide-react";
import { formatNumber, formatPercent } from "@/lib/format";
import { calcBondPeriodReturn } from "@/lib/bonds/period-return";
import { calcYieldToMaturity } from "@/lib/bonds/yield";
import { calcModifiedDuration } from "@/lib/bonds/duration";
import { inferInstrumentType } from "@/lib/instrument-type";
import EquitySection, { type EquityHolding } from "./EquitySection";
import FixedIncomeSection, { type BondHoldingRow } from "./FixedIncomeSection";
import type { Snapshot } from "./SeguimientoPage";

interface HoldingData {
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
}

// inferAssetType removed — now using inferInstrumentType from @/lib/instrument-type

// Extract bond fields (coupon, maturity, rating) from fundName when missing
const COUPON_RE = /\b(\d{1,2}(?:\.\d{1,4})?)\s*%/;
const MATURITY_RE = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/;
const MATURITY_ISO_RE = /\b(\d{4})-(\d{2})-(\d{2})\b/;
const SP_RATING_RE = /\b(AAA|AA\+|AA-|AA|A\+|A-|BBB\+|BBB-|BBB|BB\+|BB-|BB|B\+|B-|CCC\+|CCC-|CCC|CC|D|NR)\b/i;
const MOODYS_RE = /\b(Aaa|Aa[123]|A[123]|Baa[123]|Ba[123]|B[123]|Caa[123]|Ca)\b/i;
const MOODYS_SP: Record<string, string> = {
  "AAA": "AAA", "AA1": "AA+", "AA2": "AA", "AA3": "AA-",
  "A1": "A+", "A2": "A", "A3": "A-",
  "BAA1": "BBB+", "BAA2": "BBB", "BAA3": "BBB-",
  "BA1": "BB+", "BA2": "BB", "BA3": "BB-",
  "B1": "B+", "B2": "B", "B3": "B-",
  "CAA1": "CCC+", "CAA2": "CCC", "CAA3": "CCC-", "CA": "CC",
};

function extractRating(text: string): string | null {
  const sp = text.match(SP_RATING_RE);
  if (sp) return sp[1].toUpperCase();
  const mo = text.match(MOODYS_RE);
  if (mo) return MOODYS_SP[mo[1].toUpperCase()] || mo[1].toUpperCase();
  return null;
}

function parseBondName<T extends { fundName: string; couponRate?: number | null; maturityDate?: string | null; creditRating?: string | null }>(h: T): T {
  const name = h.fundName || "";
  if (!name) return h;

  let couponRate = h.couponRate || null;
  let maturityDate = h.maturityDate || null;
  let creditRating = h.creditRating || null;

  // Extract coupon
  if (!couponRate) {
    const m = name.match(COUPON_RE);
    if (m) couponRate = parseFloat(m[1]);
  }
  // Extract maturity
  if (!maturityDate) {
    const dm = name.match(MATURITY_RE);
    if (dm) {
      maturityDate = `${dm[3]}-${dm[1].padStart(2, "0")}-${dm[2].padStart(2, "0")}`;
    } else {
      const im = name.match(MATURITY_ISO_RE);
      if (im) maturityDate = `${im[1]}-${im[2]}-${im[3]}`;
    }
  }
  // Extract rating (S&P or Moody's → S&P)
  if (!creditRating) {
    creditRating = extractRating(name);
  } else {
    // Convert Moody's if stored as such
    const mo = String(creditRating).match(MOODYS_RE);
    if (mo) creditRating = MOODYS_SP[mo[1].toUpperCase()] || creditRating;
  }

  // Clean name: remove extracted data
  let cleanName = name;
  cleanName = cleanName.replace(/\s*\d{1,2}(?:\.\d{1,4})?\s*%/g, "");
  cleanName = cleanName.replace(/\s*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/g, "");
  cleanName = cleanName.replace(/\s*\d{4}-\d{2}-\d{2}/g, "");
  cleanName = cleanName.replace(SP_RATING_RE, "");
  cleanName = cleanName.replace(MOODYS_RE, "");
  cleanName = cleanName.replace(/Rating\s*Information\s*:?/gi, "");
  cleanName = cleanName.replace(/Moody'?s?\s*:\s*/gi, "");
  cleanName = cleanName.replace(/S&P\s*:\s*/gi, "");
  cleanName = cleanName.replace(/Fitch\s*:\s*/gi, "");
  cleanName = cleanName.replace(/[\s\/\-]+$/g, "").replace(/^[\s\/\-]+/g, "").replace(/\s{2,}/g, " ").trim();

  return {
    ...h,
    fundName: cleanName.length >= 3 ? cleanName : h.fundName,
    couponRate,
    maturityDate,
    creditRating,
  };
}

interface FundMeta {
  fundName: string;
  run: string;
  serie: string;
  tac: number | null;
  quantity: number;
}

interface FintualPrice {
  fundName: string;
  fintualId: string | null;
  fintualName: string | null;
  serieName: string | null;
  currentPrice: number | null;
  lastPriceDate: string | null;
  currency: string;
}

export interface HoldingReturnsData {
  equityHoldings: EquityHolding[];
  bondHoldings: BondHoldingRow[];
  cashValue: number;
  totalValue: number;
  portfolioReturn: number;
}

interface Props {
  snapshots: Snapshot[];
  clientId?: string;
  onCurrentValueUpdate?: (totalValue: number) => void;
  onPriceDateUpdate?: (date: string) => void;
  onHoldingReturnsReady?: (data: HoldingReturnsData) => void;
  fundsMeta?: FundMeta[];
  usdRate?: number;
}

interface YahooQuote {
  fundName: string;
  price: number;
  currency: string;
}

interface BondLookup {
  cusip: string;
  issuer: string;
  couponRate: number;
  maturityDate: string;
}

export default function HoldingReturnsPanel({ snapshots, clientId, onCurrentValueUpdate, onPriceDateUpdate, onHoldingReturnsReady, fundsMeta, usdRate }: Props) {
  const [fintualPrices, setFintualPrices] = useState<Map<string, FintualPrice>>(new Map());
  const [yahooPrices, setYahooPrices] = useState<Map<string, YahooQuote>>(new Map());
  const [bondLookups, setBondLookups] = useState<Map<string, BondLookup>>(new Map());
  const [bondPrices, setBondPrices] = useState<Map<string, { price: number; ytm: number | null; date: string }>>(new Map());
  const [loadingPrices, setLoadingPrices] = useState(false);

  // Extract unique holdings and their returns over time from snapshots
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

    // For each holding, find the purchase price from the FIRST cartola
    const basePrices = new Map<string, number>();
    const purchaseDates = new Map<string, string>();

    // Purchase price: unitCost first (what the client paid), then fallbacks
    const extractPurchasePrice = (h: HoldingData): number => {
      // 1. unitCost — actual purchase price per unit
      const uc = Number(h.unitCost);
      if (uc > 0 && isFinite(uc)) return uc;
      // 2. costBasis / quantity — total cost / shares
      const qty = Number(h.quantity);
      const cb = Number(h.costBasis);
      if (qty > 0 && cb > 0) return cb / qty;
      // 3. marketPrice — price at cartola date (fallback)
      const mp = Number(h.marketPrice);
      if (mp > 0 && isFinite(mp)) return mp;
      // 4. marketValue / quantity
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
        if (h.fundName && !basePrices.has(h.fundName)) {
          const price = extractPurchasePrice(h);
          if (price > 0) {
            basePrices.set(h.fundName, price);
            purchaseDates.set(h.fundName, cartola.snapshot_date);
          }
        }
      }
    }

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
            estIncomeYield: h.estIncomeYield,
            estAnnualIncome: h.estAnnualIncome,
            purchaseDate: h.purchaseDate,
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
  }, [snapshots]);

  // Fetch current prices from Fintual API (for funds only)
  useEffect(() => {
    if (holdingSummaries.length === 0) return;
    const fundsOnly = holdingSummaries.filter(h => h.assetType === "fund");
    if (fundsOnly.length === 0) return;

    const fetchPrices = async () => {
      setLoadingPrices(true);
      try {
        const holdingsToFetch = fundsOnly.map((h) => {
          const raw = (latestRawHoldings as HoldingData[])?.find((sh) => sh.fundName === h.fundName);
          return {
            fundName: h.fundName,
            securityId: raw?.securityId || null,
            serie: raw?.serie || null,
            currency: h.currency || "CLP",
            cartolaPrice: h.purchasePrice || 0,
          };
        });

        const res = await fetch("/api/portfolio/current-prices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ holdings: holdingsToFetch, clientId }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.success && data.prices) {
            const priceMap = new Map<string, FintualPrice>();
            for (const p of data.prices) {
              priceMap.set(p.fundName, p);
            }
            setFintualPrices(priceMap);
          }
        }
      } catch (err) {
        console.error("Error fetching Fintual prices:", err);
      } finally {
        setLoadingPrices(false);
      }
    };

    fetchPrices();
  }, [holdingSummaries, latestRawHoldings, clientId]);

  // Fetch current prices from Yahoo for stocks/ETFs
  useEffect(() => {
    if (holdingSummaries.length === 0) return;
    const stocksAndETFs = holdingSummaries.filter(h =>
      ["stock", "etf"].includes(h.assetType) && h.securityId
    );
    if (stocksAndETFs.length === 0) return;

    const fetchYahooPrices = async () => {
      const priceMap = new Map<string, YahooQuote>();

      await Promise.all(
        stocksAndETFs.map(async (h) => {
          try {
            const ticker = (h.securityId || "").trim();
            if (!ticker) return;
            const res = await fetch(`/api/securities/quote/${encodeURIComponent(ticker)}`);
            if (!res.ok) return;
            const data = await res.json();
            if (data.success && data.quote?.price > 0) {
              priceMap.set(h.fundName, {
                fundName: h.fundName,
                price: data.quote.price,
                currency: data.quote.currency || "USD",
              });
            }
          } catch {
            // Silently skip failed quotes
          }
        })
      );

      if (priceMap.size > 0) setYahooPrices(priceMap);
    };

    fetchYahooPrices();
  }, [holdingSummaries]);

  // Fetch bond details from FINRA for bonds missing coupon/maturity
  useEffect(() => {
    const bondsNeedingLookup = holdingSummaries.filter(h =>
      h.assetType === "bond" && h.securityId && (!h.couponRate || !h.maturityDate)
    );
    if (bondsNeedingLookup.length === 0) return;

    const fetchBondDetails = async () => {
      const lookupMap = new Map<string, BondLookup>();

      for (const h of bondsNeedingLookup) {
        try {
          const cusip = (h.securityId || "").trim();
          if (!cusip) continue;
          const res = await fetch(`/api/bonds/lookup/${encodeURIComponent(cusip)}`);
          if (!res.ok) continue;
          const data = await res.json();
          if (data.success && data.bond) {
            lookupMap.set(h.fundName, data.bond);
          }
        } catch {
          // Skip failed lookups
        }
      }

      if (lookupMap.size > 0) setBondLookups(lookupMap);
    };

    fetchBondDetails();
  }, [holdingSummaries]);

  // Fetch latest bond prices from FINRA (stored in bond_prices table)
  useEffect(() => {
    const bonds = holdingSummaries.filter(h => h.assetType === "bond" && h.securityId);
    if (bonds.length === 0) return;

    const cusips = bonds.map(h => (h.securityId || "").trim()).filter(Boolean);
    if (cusips.length === 0) return;

    const fetchBondPrices = async () => {
      try {
        const res = await fetch(`/api/bonds/latest-prices?cusips=${encodeURIComponent(cusips.join(","))}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.success && data.prices) {
          const map = new Map<string, { price: number; ytm: number | null; date: string }>();
          // Map by fundName for easy lookup
          for (const h of bonds) {
            const cusip = (h.securityId || "").trim();
            if (cusip && data.prices[cusip]) {
              map.set(h.fundName, data.prices[cusip]);
            }
          }
          if (map.size > 0) setBondPrices(map);
        }
      } catch {
        // Silently skip — bonds will use cartola prices
      }
    };

    fetchBondPrices();
  }, [holdingSummaries]);

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
    return holdingSummaries.map((h) => {
      const tac = tacByFundName.get(h.fundName) ?? null;

      // Enrich bonds with FINRA lookup data (coupon, maturity)
      let enriched = { ...h, tac };
      if (h.assetType === "bond") {
        const bl = bondLookups.get(h.fundName);
        if (bl) {
          if (!enriched.couponRate && bl.couponRate) enriched = { ...enriched, couponRate: bl.couponRate };
          if (!enriched.maturityDate && bl.maturityDate) enriched = { ...enriched, maturityDate: bl.maturityDate };
        }
      }

      // Try Yahoo prices for stocks/ETFs
      const yp = yahooPrices.get(h.fundName);
      if (yp && yp.price > 0 && ["stock", "etf"].includes(h.assetType)) {
        const yahooPrice = yp.price;
        const returnCalc = h.purchasePrice > 0
          ? ((yahooPrice / h.purchasePrice) - 1) * 100
          : 0;
        const newMarketValue = h.quantity > 0 && usdRate
          ? h.quantity * yahooPrice * usdRate
          : h.marketValue;

        return {
          ...enriched,
          currentPrice: yahooPrice,
          marketValue: newMarketValue,
          returnFromBase: Math.round(returnCalc * 100) / 100,
        };
      }

      // Try Fintual prices for funds
      const fp = fintualPrices.get(h.fundName);
      if (!fp || !fp.currentPrice || fp.currentPrice <= 0) {
        return enriched;
      }

      const fintualCurrentPrice = fp.currentPrice;
      const returnCalc = h.purchasePrice > 0
        ? ((fintualCurrentPrice / h.purchasePrice) - 1) * 100
        : 0;
      const holdingIsUSD = h.currency === "USD";
      const newMarketValue = holdingIsUSD
        ? (h.quantity > 0 && usdRate ? h.quantity * fintualCurrentPrice * usdRate : h.marketValue)
        : (h.quantity > 0 ? h.quantity * fintualCurrentPrice : h.marketValue);

      return {
        ...enriched,
        currentPrice: fintualCurrentPrice,
        marketValue: newMarketValue,
        returnFromBase: Math.round(returnCalc * 100) / 100,
      };
    });
  }, [holdingSummaries, fintualPrices, yahooPrices, bondLookups, tacByFundName, usdRate]);

  // Notify parent of updated total value and price date
  useEffect(() => {
    if (enrichedSummaries.length === 0) return;
    const total = enrichedSummaries.reduce((sum, h) => sum + (h.marketValue || 0), 0);
    if (total > 0 && onCurrentValueUpdate) onCurrentValueUpdate(total);

    if (onPriceDateUpdate) {
      const dates = enrichedSummaries
        .map((h) => (h as Record<string, unknown>).lastPriceDate as string | undefined)
        .filter(Boolean) as string[];
      if (dates.length > 0) {
        dates.sort();
        onPriceDateUpdate(dates[dates.length - 1]);
      }
    }
  }, [enrichedSummaries, onCurrentValueUpdate, onPriceDateUpdate]);

  // --- Detect composition ---
  const hasEquity = enrichedSummaries.some(h => ["fund", "etf", "stock"].includes(h.assetType));
  const hasBonds = enrichedSummaries.some(h => h.assetType === "bond");
  const hasStocksOrETFs = enrichedSummaries.some(h => ["etf", "stock"].includes(h.assetType));
  const hasCash = enrichedSummaries.some(h => h.assetType === "cash");

  const totalValue = enrichedSummaries.reduce((s, h) => s + h.marketValue, 0);

  // --- Build equity holdings ---
  const equityHoldings: EquityHolding[] = useMemo(() => {
    return enrichedSummaries
      .filter(h => ["fund", "etf", "stock"].includes(h.assetType))
      .map(h => ({
        fundName: h.fundName,
        assetType: h.assetType,
        weight: h.weight,
        purchasePrice: h.purchasePrice,
        currentPrice: h.currentPrice,
        marketValue: h.marketValue,
        currency: h.currency,
        returnPrice: h.returnFromBase,
        dividendAmount: h.estAnnualIncome || 0,
        dividendYield: h.estIncomeYield || 0,
        totalReturn: h.returnFromBase + (h.estIncomeYield || 0),
        contribution: h.weight > 0 ? (h.returnFromBase * h.weight) / 100 : 0,
        tac: h.tac,
      }));
  }, [enrichedSummaries]);

  // --- Build bond holdings ---
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
        const purchasePricePct = toBondPricePct(h.purchasePrice);
        const cartolaMarketPricePct = toBondPricePct(h.currentPrice);

        // Use FINRA price if available, otherwise cartola price
        const finraPrice = bondPrices.get(h.fundName);
        const marketPricePct = finraPrice ? finraPrice.price : cartolaMarketPricePct;

        const faceValue = h.quantity || (h.marketValue / (cartolaMarketPricePct / 100));
        const freq = 2; // semi-annual default

        // Market value in USD = faceValue × marketPrice% / 100
        const marketValueUSD = faceValue * marketPricePct / 100;

        // All bond calculations require purchaseDate — without it, show raw data only
        let devengoUSD = 0;
        let devengoPct = 0;
        let marketDeviationUSD = 0;
        let totalReturnPct = 0;
        let ytm = 0;
        let duration = 0;

        if (h.purchaseDate && h.maturityDate && couponRateDecimal > 0) {
          // TIR de compra: YTM solved at purchase price, not market price
          const bondParams = {
            faceValue,
            couponRate: couponRateDecimal,
            couponFrequency: freq,
            maturityDate: h.maturityDate,
            purchaseDate: h.purchaseDate,
            purchasePrice: purchasePricePct,
            currentPrice: purchasePricePct, // solve at purchase price → TIR de compra
          };

          try { ytm = calcYieldToMaturity(bondParams, new Date(h.purchaseDate + "T00:00:00")) * 100; } catch { ytm = 0; }
          try { duration = calcModifiedDuration(bondParams); } catch { duration = 0; }

          // Devengo uses the same purchase YTM internally
          const periodResult = calcBondPeriodReturn({
            faceValue,
            couponRate: couponRateDecimal,
            couponFrequency: freq,
            maturityDate: h.maturityDate,
            purchasePrice: purchasePricePct,
            currentPrice: marketPricePct,
            startDate: previousSnapshotDate || h.purchaseDate,
            endDate: latestDate || previousSnapshotDate || h.purchaseDate,
            purchaseDate: h.purchaseDate,
          });
          devengoUSD = periodResult.devengoUSD;
          devengoPct = periodResult.devengoPct;
          marketDeviationUSD = periodResult.marketDeviationUSD;
          totalReturnPct = periodResult.totalReturnPct;
        }

        // Prefer cartola's costBasis (real amount paid), fallback to calculated
        const calcCostBasis = faceValue * purchasePricePct / 100;
        const actualCostBasis = h.costBasis && h.costBasis > 0 ? h.costBasis : calcCostBasis;

        return {
          fundName: h.fundName,
          cusip: h.securityId || "",
          creditRating: h.creditRating || "NR",
          couponRate: couponRatePct,
          maturityDate: h.maturityDate || "",
          weight: h.weight,
          purchasePrice: purchasePricePct,
          costBasis: actualCostBasis,
          marketPrice: marketPricePct,
          ytm,
          duration,
          devengoUSD,
          devengoPct,
          marketDeviationUSD,
          totalReturn: totalReturnPct,
          contribution: h.weight > 0 ? (totalReturnPct * h.weight) / 100 : 0,
          marketValue: marketValueUSD,
        };
      });
  }, [enrichedSummaries, previousSnapshotDate, snapshots, bondPrices]);

  // Cash holdings
  const cashValue = enrichedSummaries
    .filter(h => h.assetType === "cash")
    .reduce((s, h) => s + h.marketValue, 0);

  // Portfolio-level return
  const equityContrib = equityHoldings.reduce((s, h) => s + h.contribution, 0);
  const bondContrib = bondHoldings.reduce((s, h) => s + h.contribution, 0);
  const portfolioReturn = equityContrib + bondContrib;

  // Expose computed holding returns to parent (for PerformanceAttribution)
  useEffect(() => {
    if (!onHoldingReturnsReady) return;
    const cv = enrichedSummaries
      .filter(h => h.assetType === "cash")
      .reduce((s, h) => s + h.marketValue, 0);
    const tv = enrichedSummaries.reduce((s, h) => s + (h.marketValue || 0), 0);
    onHoldingReturnsReady({ equityHoldings, bondHoldings, cashValue: cv, totalValue: tv, portfolioReturn });
  }, [equityHoldings, bondHoldings, onHoldingReturnsReady, enrichedSummaries, portfolioReturn]);

  if (holdingSummaries.length === 0) return null;

  const equityValue = equityHoldings.reduce((s, h) => s + h.marketValue, 0);
  const bondValue = bondHoldings.reduce((s, h) => s + h.marketValue, 0);
  const equityPct = totalValue > 0 ? (equityValue / totalValue) * 100 : 0;
  const bondPct = totalValue > 0 ? (bondValue / totalValue) * 100 : 0;

  return (
    <div className="bg-white rounded-lg border border-gb-border shadow-sm mb-6">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gb-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-blue-600" />
          <h2 className="text-base font-semibold text-gb-black">
            Rentabilidad por Activo
          </h2>
          {loadingPrices ? (
            <Loader className="w-4 h-4 text-blue-500 animate-spin ml-2" />
          ) : (
            <span className={`ml-2 text-sm font-semibold ${portfolioReturn >= 0 ? "text-green-600" : "text-red-600"}`}>
              Portafolio: {formatPercent(portfolioReturn)}
            </span>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="px-6 py-3 grid grid-cols-4 gap-3 border-b border-gb-border bg-slate-50/50">
        <SummaryCard label="Valor Total" value={`$${formatNumber(totalValue, 0)}`} />
        <SummaryCard
          label="Retorno Total"
          value={formatPercent(portfolioReturn)}
          color={portfolioReturn >= 0 ? "text-green-600" : "text-red-600"}
        />
        {hasEquity && (
          <SummaryCard label="Renta Variable" value={`${formatNumber(equityPct, 1)}%`} />
        )}
        {hasBonds && (
          <SummaryCard label="Renta Fija" value={`${formatNumber(bondPct, 1)}%`} />
        )}
      </div>

      {/* Sections */}
      <div className="py-4">
        {hasEquity && (
          <EquitySection
            holdings={equityHoldings}
            totalPortfolioValue={totalValue}
            showDividends={hasStocksOrETFs}
          />
        )}

        {hasBonds && (
          <FixedIncomeSection
            holdings={bondHoldings}
            totalPortfolioValue={totalValue}
          />
        )}

        {hasCash && cashValue > 0 && (
          <div className="mb-4 px-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-5 bg-gray-400 rounded" />
              <h3 className="text-sm font-semibold text-gb-black">Cash / Money Market</h3>
            </div>
            <div className="bg-slate-50 rounded-lg px-4 py-3 flex justify-between items-center">
              <span className="text-sm text-gb-gray">Cash Balance</span>
              <span className="text-sm font-semibold text-gb-black">
                ${formatNumber(cashValue, 0)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-white rounded-lg border border-gb-border px-3 py-2">
      <div className="text-[10px] text-gb-gray uppercase tracking-wide">{label}</div>
      <div className={`text-lg font-semibold ${color || "text-gb-black"}`}>{value}</div>
    </div>
  );
}
