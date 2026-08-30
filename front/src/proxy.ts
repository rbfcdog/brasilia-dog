import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isMerchantMockMode } from "@/lib/supabase/config";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const pathname = request.nextUrl.pathname;
  const buyerProtected = ["/assistant", "/scheduled", "/history", "/support", "/profile"]
    .some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  const merchantProtected = pathname.startsWith("/merchant/") && pathname !== "/merchant/login";
  const protectedRoute = buyerProtected || merchantProtected;

  if (isMerchantMockMode() && pathname.startsWith("/merchant")) {
    return response;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url || !key) {
    if (protectedRoute) {
      const login = request.nextUrl.clone();
      login.pathname = merchantProtected ? "/merchant/login" : "/";
      login.search = merchantProtected ? "?error=not_configured" : "?error=not_configured#workspace-auth";
      return NextResponse.redirect(login);
    }
    return response;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const isLogin = pathname === "/merchant/login";
  const isProtected = protectedRoute;

  if (isProtected && !data.user) {
    const login = request.nextUrl.clone();
    login.pathname = merchantProtected ? "/merchant/login" : "/";
    login.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    if (buyerProtected) login.hash = "workspace-auth";
    return NextResponse.redirect(login);
  }

  if (isLogin && data.user) {
    return NextResponse.redirect(new URL("/merchant/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/assistant/:path*", "/scheduled/:path*", "/history/:path*", "/support/:path*", "/profile/:path*", "/merchant/:path*"],
};
