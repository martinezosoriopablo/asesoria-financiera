"use client";

import { useState, useEffect } from "react";

interface HoldingSummary {
  fundName: string;
  securityId: string | null;
  serie: string | null;
  quantity: number;
  assetType: string;
  assetClass: string;
  currency: string;
  market: string | null;
  currentPrice: number;
  couponRate: number | null;
  maturityDate: string | null;
}

interface BondLookup {
  cusip: string;
  issuer: string;
  couponRate: number;
  maturityDate: string;
}

interface UseHoldingQuotesResult {
  marketPrices: Map<string, { price: number; currency: string }>;
  bondLookups: Map<string, BondLookup>;
  bondPrices: Map<string, { price: number; ytm: number | null; date: string }>;
  loadingPrices: boolean;
}

export function useHoldingQuotes(
  holdingSummaries: HoldingSummary[],
  pricesAtDateEndpoint: string = "/api/portfolio/prices-at-date"
): UseHoldingQuotesResult {
  const [marketPrices, setMarketPrices] = useState<Map<string, { price: number; currency: string }>>(new Map());
  const [bondLookups, setBondLookups] = useState<Map<string, BondLookup>>(new Map());
  const [bondPrices, setBondPrices] = useState<Map<string, { price: number; ytm: number | null; date: string }>>(new Map());
  const [loadingPrices, setLoadingPrices] = useState(false);

  // Fetch current market prices for all non-bond, non-cash holdings via unified price service
  useEffect(() => {
    if (holdingSummaries.length === 0) return;

    // Only funds, stocks, ETFs (not bonds — they use FINRA, not cash)
    const needsPricing = holdingSummaries.filter(h =>
      h.assetType !== "bond" && h.assetType !== "cash"
    );
    if (needsPricing.length === 0) return;

    const today = new Date().toISOString().split("T")[0];
    // Use yesterday as startDate to get "today's" price
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

    const fetchPrices = async () => {
      setLoadingPrices(true);
      try {
        const res = await fetch(pricesAtDateEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            holdings: needsPricing.map(h => ({
              fundName: h.fundName,
              securityId: h.securityId || null,
              serie: h.serie || null,
              quantity: h.quantity,
              assetClass: h.assetClass,
              currency: h.currency || null,
              market: h.market || null,
              cartolaPrice: h.currentPrice || null,
            })),
            startDate: yesterday,
            endDate: today,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.success && data.results) {
            const priceMap = new Map<string, { price: number; currency: string }>();
            for (const r of data.results) {
              if (r.endPrice && r.endPrice > 0) {
                priceMap.set(r.fundName, { price: r.endPrice, currency: r.currency || "CLP" });
              }
            }
            setMarketPrices(priceMap);
          }
        }
      } catch (err) {
        console.error("Error fetching market prices:", err);
      } finally {
        setLoadingPrices(false);
      }
    };

    fetchPrices();
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

  return { marketPrices, bondLookups, bondPrices, loadingPrices };
}
