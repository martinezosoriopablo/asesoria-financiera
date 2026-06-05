import { NextRequest, NextResponse } from "next/server";
import { requireClient } from "@/lib/auth/require-client";
import { applyRateLimit } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/api-response";

export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "portal-radiografia", { limit: 5, windowSeconds: 60 });
  if (blocked) return blocked;
  const { client, error: authError } = await requireClient();
  if (authError) return authError;
  return handleApiError("portal-radiografia-post", async () => {
    const body = await request.json();
    const internalUrl = new URL("/api/portfolio/radiografia", request.url);
    const res = await fetch(internalUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: request.headers.get("cookie") || "" },
      body: JSON.stringify({ ...body, clientId: client!.id }),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  });
}
