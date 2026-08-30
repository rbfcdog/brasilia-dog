import { NextResponse, type NextRequest } from "next/server";

const protectedBuyerRoutes = ["/assistant", "/scheduled", "/history", "/support", "/profile"];

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const buyerProtected = protectedBuyerRoutes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  const merchantLogin = pathname === "/merchant/login";
  const merchantProtected = pathname.startsWith("/merchant/") && !merchantLogin;
  const authenticated = Boolean(request.cookies.get("nomad-auth-access") || request.cookies.get("nomad-auth-refresh"));

  if ((buyerProtected || merchantProtected) && !authenticated) {
    const login = request.nextUrl.clone();
    login.pathname = merchantProtected ? "/merchant/login" : "/";
    login.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    if (buyerProtected) login.hash = "workspace-auth";
    return NextResponse.redirect(login);
  }

  if (merchantLogin && authenticated) {
    return NextResponse.redirect(new URL("/merchant/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/assistant/:path*", "/scheduled/:path*", "/history/:path*", "/support/:path*", "/profile/:path*", "/merchant/:path*"],
};
