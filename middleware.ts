import { updateSession } from "@/lib/supabase/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { resolveHostRoute } from "@/lib/site/host-routing";

export async function middleware(request: NextRequest) {
  const route = resolveHostRoute(request.headers.get("host"), request.nextUrl.pathname);

  if (route.kind === "redirect") {
    return NextResponse.redirect(route.url, 301);
  }

  if (route.kind === "rewrite") {
    const url = request.nextUrl.clone();
    url.pathname = route.path;
    return NextResponse.rewrite(url);
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|webm|mov|html|pdf)$).*)",
  ],
};
