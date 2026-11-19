import type { NextRequest } from "next/server";
import { signIn } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const next = request.nextUrl.searchParams.get("next") ?? "/";
  await signIn("google", { redirectTo: next.startsWith("/") && !next.startsWith("//") ? next : "/" });
}
