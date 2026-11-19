import { type NextRequest, NextResponse } from "next/server";
import { SETUP_COOKIE } from "@/lib/page";

export function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/board", request.url));
  response.cookies.set(SETUP_COOKIE, "1", { httpOnly: true, secure: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  return response;
}
