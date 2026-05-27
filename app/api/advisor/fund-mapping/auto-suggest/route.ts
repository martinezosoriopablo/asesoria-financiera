// app/api/advisor/fund-mapping/auto-suggest/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { COMITE_CATEGORIES, PREFERRED_TO_COMITE } from "@/lib/comite-categories";

export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "fund-mapping-suggest", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  const { custodianType } = (await request.json()) as { custodianType: string };

  if (!custodianType || !["agf", "corredora", "internacional"].includes(custodianType)) {
    return NextResponse.json(
      { success: false, error: "custodianType debe ser agf, corredora, o internacional" },
      { status: 400 }
    );
  }

  // For internacional: return ETFs directly from comite, no fund mapping needed
  if (custodianType === "internacional") {
    const suggestions = COMITE_CATEGORIES.map((cat) => ({
      categoria: cat.id,
      categoriaLabel: cat.label,
      suggestedFund: null,
      suggestedFundId: null,
      etfDirect: cat.etfUS,
      etfUcits: cat.etfUCITS,
      confidence: "high" as const,
      alreadyMapped: false,
    }));
    return NextResponse.json({ success: true, suggestions, isInternacional: true });
  }

  // Load advisor's preferred funds for this custodian type
  const { data: preferredFunds } = await supabase
    .from("advisor_preferred_funds")
    .select("id, fund_name, fund_run, category, ticker, expense_ratio, custodian_type")
    .eq("advisor_id", advisor!.id)
    .eq("custodian_type", custodianType)
    .eq("active", true);

  // Load existing mappings to mark already-mapped categories
  const { data: existingMappings } = await supabase
    .from("model_fund_mapping")
    .select("categoria, preferred_fund_id")
    .eq("advisor_id", advisor!.id)
    .eq("custodian_type", custodianType);

  const existingMap = new Map(
    (existingMappings || []).map((m) => [m.categoria, m.preferred_fund_id])
  );

  const funds = preferredFunds || [];

  const suggestions = COMITE_CATEGORIES.map((cat) => {
    // If already mapped, return existing mapping
    if (existingMap.has(cat.id)) {
      const mappedFundId = existingMap.get(cat.id);
      const mappedFund = funds.find((f) => f.id === mappedFundId);
      return {
        categoria: cat.id,
        categoriaLabel: cat.label,
        suggestedFund: mappedFund?.fund_name || null,
        suggestedFundId: mappedFundId,
        etfDirect: null,
        etfUcits: null,
        confidence: "confirmed" as const,
        alreadyMapped: true,
      };
    }

    // Auto-suggest: find preferred fund whose category matches
    const matchingCategories = PREFERRED_TO_COMITE[cat.id] || [];
    const candidates = funds.filter((f) => matchingCategories.includes(f.category));

    if (candidates.length === 0) {
      return {
        categoria: cat.id,
        categoriaLabel: cat.label,
        suggestedFund: null,
        suggestedFundId: null,
        etfDirect: null,
        etfUcits: null,
        confidence: "none" as const,
        alreadyMapped: false,
      };
    }

    // Pick best: lowest expense_ratio, or first
    const best = candidates.reduce((a, b) => {
      if (a.expense_ratio != null && b.expense_ratio != null) {
        return a.expense_ratio < b.expense_ratio ? a : b;
      }
      return a;
    });

    return {
      categoria: cat.id,
      categoriaLabel: cat.label,
      suggestedFund: best.fund_name,
      suggestedFundId: best.id,
      etfDirect: null,
      etfUcits: null,
      confidence: candidates.length === 1 ? ("high" as const) : ("medium" as const),
      alreadyMapped: false,
    };
  });

  return NextResponse.json({ success: true, suggestions, isInternacional: false });
}
