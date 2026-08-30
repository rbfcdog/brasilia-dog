import { NextResponse, type NextRequest } from "next/server";

const protectedBuyerRoutes = ["/assistant", "/scheduled", "/history", "/support", "/profile"];

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const buyerProtected = protectedBuyerRoutes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  const merchantLogin = pathname === "/merchant/login";
  const merchantProtected = pathname.startsWith("/merchant/") && !merchantLogin;
  // The readable marker only controls navigation. Every API mutation still
  // requires the HttpOnly passkey session and verifies it in the backend.
  const buyerAuthenticated = Boolean(
    request.cookies.get("vero-auth-access")
    || request.cookies.get("vero-auth-refresh")
    || request.cookies.get("vero-passkey-authenticated"),
  );
  const merchantAuthenticated = Boolean(request.cookies.get("vero-auth-access") || request.cookies.get("vero-auth-refresh"));

  if ((buyerProtected && !buyerAuthenticated) || (merchantProtected && !merchantAuthenticated)) {
    const login = request.nextUrl.clone();
    login.pathname = merchantProtected ? "/merchant/login" : "/";
    login.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    if (buyerProtected) login.hash = "workspace-auth";
    return NextResponse.redirect(login);
  }

  if (merchantLogin && merchantAuthenticated) {
    return NextResponse.redirect(new URL("/merchant/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/assistant/:path*", "/scheduled/:path*", "/history/:path*", "/support/:path*", "/profile/:path*", "/merchant/:path*"],
};
