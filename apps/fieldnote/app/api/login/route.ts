import { NextResponse } from "next/server";
import { personByEmail } from "../../../lib/people";

function signedIn(personId: string, request: Request, nextPath: string) {
  const response = NextResponse.redirect(new URL(nextPath, request.url), 303);
  response.cookies.set("fieldnote_session", personId, { path: "/", httpOnly: false });
  return response;
}

function rejected(request: Request, error: string, nextPath: string) {
  const back = new URL("/login", request.url);
  back.searchParams.set("error", error);
  if (nextPath) back.searchParams.set("next", nextPath);
  return NextResponse.redirect(back, 303);
}

export async function POST(request: Request) {
  const form = await request.formData();
  const nextPath = String(form.get("next") || "/");
  const found = personByEmail(String(form.get("email") ?? ""));
  if ("error" in found) return rejected(request, found.error, nextPath);
  return signedIn(found.person.id, request, nextPath);
}

// Kiwi opens this in Chrome so the CRM cookie matches the person signed in on the panel.
export async function GET(request: Request) {
  const email = new URL(request.url).searchParams.get("email") ?? "";
  const found = personByEmail(email);
  if ("error" in found) return rejected(request, found.error, "/");
  return signedIn(found.person.id, request, "/");
}
