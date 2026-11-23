import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { NextRequest } from "next/server";
import { boardUrl } from "@/lib/board";

const template = readFileSync(join(process.cwd(), "installer/install.sh"), "utf8");
const channelRule =
  process.env.AGENT_CHANNEL_RULE ??
  "the one for the product or area you work in (`vercel board channels` lists them), unless the user names another.";
const workScope = process.env.AGENT_WORK_SCOPE ?? "work for the team that runs this board";

export async function GET(request: NextRequest) {
  const unversioned = template
    .replace("__BOARD_URL__", (await boardUrl()).replace(/['"$`\\]/g, ""))
    .replace("__CHANNEL_RULE__", channelRule.replaceAll("'", ""))
    .replaceAll("__WORK_SCOPE__", workScope.replace(/['"$`\\]/g, ""))
    .replaceAll("__ORIGIN__", `https://${(request.headers.get("host") ?? "").replace(/[^A-Za-z0-9.:-]/g, "")}`);
  const version = createHash("sha256").update(unversioned).digest("hex").slice(0, 12);
  const body = request.nextUrl.searchParams.has("version") ? version : unversioned.replace("__VERSION__", version);
  return new Response(body, { headers: { "content-type": "text/x-shellscript; charset=utf-8", "cache-control": "no-store" } });
}
