import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import directory from "./lib/sign-in.json";

const people = new Set(directory.map((person) => person.id));

export function middleware(request: NextRequest) {
  const signedIn = people.has(request.cookies.get("fieldnote_session")?.value ?? "");
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
    "/opportunities": "/pipeline",
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
