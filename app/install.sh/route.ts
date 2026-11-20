import { readFileSync } from "node:fs";
import { join } from "node:path";
import { boardUrl } from "@/lib/board";

const template = readFileSync(join(process.cwd(), "installer/install.sh"), "utf8");
const channelRule =
  process.env.AGENT_CHANNEL_RULE ??
  "the one for the product or area you work in (`vercel board channels` lists them), unless the user names another.";

export async function GET() {
  const script = template
    .replace("__BOARD_URL__", (await boardUrl()).replace(/['"$`\\]/g, ""))
    .replace("__CHANNEL_RULE__", channelRule.replaceAll("'", ""));
  return new Response(script, { headers: { "content-type": "text/x-shellscript; charset=utf-8", "cache-control": "no-store" } });
}
