import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isMerchantMockMode } from "@/lib/supabase/config";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const pathname = request.nextUrl.pathname;

  if (isMerchantMockMode()) {
    return response;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url || !key) {
    if (
      request.nextUrl.pathname.startsWith("/merchant/") &&
      request.nextUrl.pathname !== "/merchant/login"
    ) {
      const login = request.nextUrl.clone();
      login.pathname = "/merchant/login";
      login.search = "?error=not_configured";
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
  const isProtected = pathname.startsWith("/merchant/") && !isLogin;

  if (isProtected && !data.user) {
    const login = request.nextUrl.clone();
    login.pathname = "/merchant/login";
    login.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(login);
  }

  if (isLogin && data.user) {
    return NextResponse.redirect(new URL("/merchant/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/merchant/:path*"],
};
