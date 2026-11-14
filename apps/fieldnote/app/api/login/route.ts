import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const form = await request.formData();
  const nextPath = String(form.get("next") || "/");
  const response = NextResponse.redirect(new URL(nextPath, request.url), 303);
  response.cookies.set("fieldnote_session", "user", { path: "/", httpOnly: false });
  return response;
}
