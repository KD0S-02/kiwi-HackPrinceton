import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const signedIn = request.cookies.get("fieldnote_session")?.value === "user";
  const isLogin = request.nextUrl.pathname === "/login";
  if (!signedIn && !isLogin) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
  if (signedIn && isLogin) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  const clubbed: Record<string, string> = {
    "/contacts": "/accounts",
    "/opportunities": "/pipeline",
    "/quotes": "/pipeline",
    "/approvals": "/pipeline",
    "/invoices": "/orders",
    "/shipments": "/orders",
    "/cases": "/orders",
    "/products": "/supply",
    "/price-books": "/supply",
    "/inventory": "/supply",
    "/warehouses": "/supply",
    "/suppliers": "/supply",
    "/purchase-orders": "/supply",
    "/people": "/company",
    "/reports": "/company",
  };
  const destination = clubbed[request.nextUrl.pathname];
  if (destination) {
    return NextResponse.redirect(new URL(destination, request.url));
  }
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
