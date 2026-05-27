// app/api/comite/categories/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { COMITE_CATEGORIES } from "@/lib/comite-categories";

export async function GET(request: NextRequest) {
  const blocked = await applyRateLimit(request, "comite-categories", { limit: 30, windowSeconds: 60 });
  if (blocked) return blocked;

  const { error } = await requireAdvisor();
  if (error) return error;

  return NextResponse.json({
    success: true,
    categories: COMITE_CATEGORIES,
  });
}
