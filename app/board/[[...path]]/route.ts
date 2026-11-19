import { inspector } from "@vercel/board/inspect";
import type { NextRequest } from "next/server";
import { auth, boardName } from "@/lib/auth";
import { team } from "@/lib/board";
import { SETUP_COOKIE, boardPage } from "@/lib/page";

export const maxDuration = 300;

const inspect = inspector({ board: team.as(null), basePath: "/board" });

async function handle(request: NextRequest): Promise<Response> {
  const me = boardName((await auth())?.user?.email);
  if (!me) return new Response("Signed out: reload the page.", { status: 401 });

  const headers = new Headers(request.headers);
  headers.set("x-board-profile", me);
  const reading = request.method === "GET" || request.method === "HEAD";
  const forwarded = new Request(request.url, { method: request.method, headers, body: reading ? null : await request.arrayBuffer() });
  const response = await inspect(forwarded);
  if (!response.headers.get("content-type")?.startsWith("text/html")) return response;

  const html = boardPage(await response.text(), !request.cookies.get(SETUP_COOKIE));
  const page = new Headers(response.headers);
  page.delete("content-length");
  return new Response(html, { status: response.status, headers: page });
}

export const GET = handle, POST = handle, PATCH = handle, PUT = handle, DELETE = handle;
