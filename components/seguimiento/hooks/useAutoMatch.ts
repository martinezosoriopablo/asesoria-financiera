import { useState, useEffect } from "react";

export interface Holding {
  fundName: string;
  securityId?: string | null;
  serie?: string;
  quantity?: number;
  unitCost?: number;
  costBasis?: number;
  marketPrice?: number;
  marketValue: number;
  unrealizedGainLoss?: number;
  assetClass?: string;
  assetType?: string;
  currency?: string;
  source?: string;
  isPrevisional?: boolean;
  couponRate?: number | null;
  maturityDate?: string | null;
  creditRating?: string | null;
  purchaseDate?: string | null;
  marketYield?: number | null;
}

export interface MatchSuggestion {
  index: number;
  matched: boolean;
  matchType?: "fund" | "stock";
  confidence: "high" | "medium" | "low";
  matchedName?: string;
  matchedId?: string;
  matchedSerie?: string;
  price?: number;
  currency?: string;
  source?: string;
  assetClass?: string;
  familiaEstudios?: string;
  applied?: boolean;
  dismissed?: boolean;
}

interface UseAutoMatchOptions {
  holdings: Holding[];
  setHoldings: React.Dispatch<React.SetStateAction<Holding[]>>;
  editMode: boolean;
  sources?: string[];
  fechaCartola: string;
}

export function useAutoMatch(options: UseAutoMatchOptions) {
  const { holdings, setHoldings, editMode, sources, fechaCartola } = options;

  const [matchSuggestions, setMatchSuggestions] = useState<MatchSuggestion[]>([]);
  const [autoMatchLoading, setAutoMatchLoading] = useState(false);
  const [autoMatchComplete, setAutoMatchComplete] = useState(false);
  // Holdings that couldn't be matched (no price match, or not found at all)
  const [unmatchedIndices, setUnmatchedIndices] = useState<Set<number>>(new Set());
  // Count of auto-applied matches (for showing feedback even after auto-apply)
  const [autoAppliedCount, setAutoAppliedCount] = useState(0);
  // Index to auto-open search for (set after match completes, used once)
  const [pendingSearchIndex, setPendingSearchIndex] = useState<number | null>(null);

  // Auto-match holdings on mount (with abort controller to handle strict mode double-fire)
  // Skip in edit mode — holdings were already matched when snapshot was created
  useEffect(() => {
    const controller = new AbortController();

    async function autoMatchHoldings() {
      if (holdings.length === 0) return;
      if (editMode) {
        setAutoMatchComplete(true);
        return;
      }

      // Bonds and cash already have prices from the cartola — skip matching
      const matchableHoldings = holdings.map((h, i) => ({ ...h, _origIndex: i }))
        .filter((h) => h.assetType !== "bond" && h.assetType !== "cash");

      setAutoMatchLoading(true);
      try {
        const res = await fetch("/api/fondos/match-holdings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            holdings: matchableHoldings.map((h) => ({
              fundName: h.fundName,
              securityId: h.securityId,
              quantity: h.quantity,
              marketValue: h.marketValue,
              marketPrice: h.marketPrice,
            })),
            cartolaSource: sources,
            cartolaDate: fechaCartola,
          }),
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        const data = await res.json();
        console.log("[auto-match] API response:", JSON.stringify({
          success: data.success,
          matchCount: data.matches?.length,
          matches: data.matches?.map((m: MatchSuggestion) => ({
            idx: m.index,
            matched: m.matched,
            confidence: m.confidence,
            name: m.matchedName?.substring(0, 30),
            price: m.price,
            assetClass: m.assetClass,
          })),
        }));

        if (controller.signal.aborted) return;

        if (data.success && data.matches) {
          // Remap API indices (relative to matchable subset) back to original holdings indices
          const rawMatches = data.matches as MatchSuggestion[];
          const allMatches = rawMatches.map((m) => ({
            ...m,
            index: matchableHoldings[m.index]?._origIndex ?? m.index,
          }));

          // Show ALL matched results as suggestions
          const relevantMatches = allMatches.filter(
            (m) => m.matched && m.matchedName
          );

          // Track truly unmatched holdings (API returned matched: false)
          // Low confidence with matchedName ARE valid suggestions — don't mark as unmatched
          const unmatched = new Set<number>();
          for (const m of allMatches) {
            if (!m.matched) {
              unmatched.add(m.index);
            }
          }

          // Auto-apply high-confidence matches: update price, securityId, currency, AND assetClass
          const updated = [...holdings];
          let appliedCount = 0;
          for (const m of allMatches) {
            if (m.matched && m.confidence === "high" && updated[m.index]) {
              const h = updated[m.index];
              // For stocks/ETFs: keep cartola price (it's the price at statement date).
              // Yahoo/AV prices are today's prices — wrong for a historical snapshot.
              // Only update securityId, currency, assetClass.
              const isStock = m.matchType === "stock";
              updated[m.index] = {
                ...h,
                ...(!isStock && m.price ? { marketPrice: m.price } : {}),
                securityId: m.matchedId || h.securityId,
                serie: m.matchedSerie || h.serie,
                currency: m.currency || h.currency,
                ...(m.assetClass ? { assetClass: m.assetClass } : {}),
                ...(!isStock && h.quantity && h.quantity > 0 && m.price
                  ? { marketValue: h.quantity * m.price }
                  : {}),
              };
              appliedCount++;
            }
            // Also apply assetClass for medium confidence matches (DB classification is reliable)
            if (m.matched && m.confidence === "medium" && m.assetClass && updated[m.index]) {
              updated[m.index] = { ...updated[m.index], assetClass: m.assetClass };
            }
          }

          if (controller.signal.aborted) return;

          // Mark high-confidence as applied in the suggestions list
          const suggestionsWithStatus = relevantMatches.map(s =>
            s.confidence === "high" ? { ...s, applied: true } : s
          );

          // Batch all state updates together
          setMatchSuggestions(suggestionsWithStatus);
          setUnmatchedIndices(unmatched);
          setAutoAppliedCount(appliedCount);
          if (appliedCount > 0) setHoldings(updated);

          // Set pending search index for unmatched holdings (separate effect will open it)
          if (unmatched.size > 0) {
            const unmatchedArr = Array.from(unmatched).sort((a, b) => a - b);
            setPendingSearchIndex(unmatchedArr[0]);
          }

          console.log("[auto-match] Results:", {
            total: allMatches.length,
            matched: relevantMatches.length,
            autoApplied: appliedCount,
            unmatched: unmatched.size,
            pendingReview: suggestionsWithStatus.filter(s => !s.applied).length,
          });
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          console.error("Error auto-matching holdings:", err);
        }
      } finally {
        if (!controller.signal.aborted) {
          setAutoMatchLoading(false);
          setAutoMatchComplete(true);
        }
      }
    }

    autoMatchHoldings();
    return () => controller.abort();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply a match suggestion
  const applyMatchSuggestion = (suggestion: MatchSuggestion) => {
    const updated = [...holdings];
    const holding = updated[suggestion.index];

    updated[suggestion.index] = {
      ...holding,
      marketPrice: suggestion.price || holding.marketPrice,
      securityId: suggestion.matchedId || holding.securityId,
      serie: suggestion.matchedSerie || holding.serie,
      currency: suggestion.currency || holding.currency,
      // Set asset class from DB classification if available
      ...(suggestion.assetClass ? { assetClass: suggestion.assetClass } : {}),
    };

    // Recalculate market value if we have quantity and price
    if (holding.quantity && holding.quantity > 0 && suggestion.price) {
      updated[suggestion.index].marketValue = holding.quantity * suggestion.price;
    }

    setHoldings(updated);

    // Clear unmatched status if this was an unmatched holding
    setUnmatchedIndices(prev => {
      const next = new Set(prev);
      next.delete(suggestion.index);
      return next;
    });

    // Mark suggestion as applied
    setMatchSuggestions((prev) =>
      prev.map((s) =>
        s.index === suggestion.index ? { ...s, applied: true } : s
      )
    );
  };

  // Dismiss a match suggestion
  const dismissMatchSuggestion = (index: number) => {
    setMatchSuggestions((prev) =>
      prev.map((s) =>
        s.index === index ? { ...s, dismissed: true } : s
      )
    );
  };

  // Apply all high-confidence suggestions
  const applyAllSuggestions = () => {
    const toApply = matchSuggestions.filter(
      (s) => !s.applied && !s.dismissed && s.confidence === "high"
    );

    const updated = [...holdings];
    for (const suggestion of toApply) {
      const holding = updated[suggestion.index];
      updated[suggestion.index] = {
        ...holding,
        marketPrice: suggestion.price || holding.marketPrice,
        securityId: suggestion.matchedId || holding.securityId,
        currency: suggestion.currency || holding.currency,
        ...(suggestion.assetClass ? { assetClass: suggestion.assetClass } : {}),
      };

      if (holding.quantity && holding.quantity > 0 && suggestion.price) {
        updated[suggestion.index].marketValue = holding.quantity * suggestion.price;
      }
    }

    setHoldings(updated);
    setMatchSuggestions((prev) =>
      prev.map((s) =>
        toApply.some((t) => t.index === s.index) ? { ...s, applied: true } : s
      )
    );
  };

  return {
    matchSuggestions,
    autoMatchLoading,
    autoMatchComplete,
    unmatchedIndices,
    setUnmatchedIndices,
    autoAppliedCount,
    pendingSearchIndex,
    setPendingSearchIndex,
    applyMatchSuggestion,
    dismissMatchSuggestion,
    applyAllSuggestions,
  };
}
