import { NextResponse } from "next/server";

function loggedOut(request: Request) {
  const response = NextResponse.redirect(new URL("/login", request.url), 303);
  response.cookies.set("fieldnote_session", "", { path: "/", maxAge: 0 });
  return response;
}

export async function POST(request: Request) {
  return loggedOut(request);
}

export async function GET(request: Request) {
  return loggedOut(request);
}
