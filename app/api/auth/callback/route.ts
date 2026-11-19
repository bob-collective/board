import { decodeJwt } from "jose";
import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, idTokenFor, username } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const pending = JSON.parse(request.cookies.get("board_oauth")?.value ?? "{}");
  const code = request.nextUrl.searchParams.get("code");
  if (!code || !pending.state || request.nextUrl.searchParams.get("state") !== pending.state)
    return new Response("Sign-in expired. Open / again.", { status: 400 });

  const idToken = await idTokenFor(code, `${request.nextUrl.origin}/api/auth/callback`);
  const claims = decodeJwt(idToken);
  if (claims.nonce !== pending.nonce || !(await username(idToken)))
    return new Response("Sign-in didn't check out. Open / again.", { status: 400 });

  const response = NextResponse.redirect(new URL(pending.next, request.url));
  response.cookies.set(SESSION_COOKIE, idToken, { httpOnly: true, secure: true, sameSite: "lax", expires: new Date((claims.exp ?? 0) * 1000) });
  response.cookies.delete("board_oauth");
  return response;
}
