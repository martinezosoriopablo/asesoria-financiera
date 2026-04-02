import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Handle PKCE code exchange (e.g. password recovery link)
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Recovery flow: redirect to reset-password
      const next = request.nextUrl.searchParams.get("next") || "/reset-password";
      const url = request.nextUrl.clone();
      url.pathname = next;
      url.searchParams.delete("code");
      url.searchParams.delete("next");
      return NextResponse.redirect(url, { headers: supabaseResponse.headers });
    }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // Determine active role: active_role > role (legacy) > null
  const meta = user?.user_metadata;
  const activeRole = (meta?.active_role as string) || (meta?.role as string) || null;

  // Public routes that don't require authentication
  const publicPaths = [
    "/login",
    "/forgot-password",
    "/reset-password",
    "/risk-profile",
    "/client/risk-profile",
    "/mi-perfil-inversor",
    "/api/save-risk-profile",
    "/portal/login",
    "/auth/callback",
  ];
  const isPublic = publicPaths.some((path) =>
    pathname.startsWith(path)
  ) || pathname === "/";
  const isApi = pathname.startsWith("/api/");
  const isProtected = !isPublic && !isApi;

  // Portal routes: only active clients
  if (pathname.startsWith("/portal") && pathname !== "/portal/login") {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/portal/login";
      return NextResponse.redirect(url);
    }
    if (activeRole !== "client") {
      // If user is an advisor trying to access portal, redirect to advisor
      const url = request.nextUrl.clone();
      url.pathname = "/advisor";
      return NextResponse.redirect(url);
    }
  }

  // Advisor routes: block active clients
  if (pathname.startsWith("/advisor") || pathname.startsWith("/clients") || pathname.startsWith("/portfolio-designer") || pathname.startsWith("/fund-center") || pathname.startsWith("/market-dashboard")) {
    if (user && activeRole === "client") {
      const url = request.nextUrl.clone();
      url.pathname = "/portal/dashboard";
      return NextResponse.redirect(url);
    }
  }

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // If logged in and visiting /login, redirect based on active role
  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = activeRole === "client" ? "/portal/dashboard" : "/advisor";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
