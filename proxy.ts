import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export default auth((request) => {
  if (request.auth?.user?.email) return;
  const { pathname, search } = request.nextUrl;
  if (request.method !== "GET" || pathname.startsWith("/board/board")) return new NextResponse("Signed out: reload the page.", { status: 401 });
  return NextResponse.redirect(new URL(`/signin?next=${encodeURIComponent(pathname + search)}`, request.nextUrl));
});

export const config = { matcher: ["/", "/board/:path*", "/setup/:path*"] };
