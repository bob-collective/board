import crypto from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { CLIENT_ID } from "@/lib/auth";

export function GET(request: NextRequest) {
  const state = crypto.randomBytes(32).toString("base64url");
  const nonce = crypto.randomBytes(32).toString("base64url");
  const next = request.nextUrl.searchParams.get("next") ?? "/";

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: `${request.nextUrl.origin}/api/auth/callback`,
    response_type: "code",
    scope: "openid email",
    state,
    nonce,
  }).toString();

  const response = NextResponse.redirect(url);
  response.cookies.set("board_oauth", JSON.stringify({ state, nonce, next: next.startsWith("/") && !next.startsWith("//") ? next : "/" }), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
  });
  return response;
}
