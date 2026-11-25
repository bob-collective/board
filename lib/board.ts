import { createHmac } from "node:crypto";
import { createGitHubAdapter } from "@chat-adapter/github";
import { board } from "@vercel/board";
import { github } from "@vercel/board/sync-github";

const excludedRepos = (process.env.GITHUB_EXCLUDED_REPOS ?? "").split(",").map((repo) => repo.trim());
const { HERMES_WEBHOOK_URL: hermesUrl, HERMES_WEBHOOK_SECRET: hermesSecret, VERCEL_PROJECT_PRODUCTION_URL: domain } =
  process.env;

export const team = board({
  watch:
    hermesUrl && hermesSecret
      ? {
          hermes: {
            tail: "--label board.task",
            run: async ({ event }) => {
              const task = event.message;
              if (event.type !== "task.created" && event.type !== "task.assigned") return;
              if (!task || task.channel.startsWith("github/") || task.labels["board.task"] !== "ready") return;
              const payload = event.payload as { for?: string | null; by?: { actor?: string } };
              const body = JSON.stringify({
                event: event.type,
                event_type: event.type,
                channel: task.channel,
                task_id: task.id,
                title: task.text,
                assignee: payload.for ?? null,
                actor: payload.by?.actor ?? null,
                url: `https://${domain}/board?thread=${task.id}`,
              });
              const timestamp = String(Math.floor(Date.now() / 1000));
              const response = await fetch(hermesUrl, {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                  "x-request-id": event.cursor,
                  "x-webhook-timestamp": timestamp,
                  "x-webhook-signature-v2": createHmac("sha256", hermesSecret).update(`${timestamp}.${body}`).digest("hex"),
                },
                body,
              });
              if (response.status >= 500 || response.status === 429) throw new Error(`hermes answered ${response.status}`);
            },
          },
        }
      : {},
  sync: process.env.GITHUB_APP_ID
    ? {
        github: github({ adapter: createGitHubAdapter() }, async (sync) => {
          if (sync.direction !== "in") return;
          const repo = sync.channel.split(":")[0].split("/")[1];
          if (!repo || excludedRepos.includes(repo)) return;
          await sync.import(`github/${repo.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "")}`);
        }),
      }
    : {},
});

let url: Promise<string> | undefined;

export function boardUrl(): Promise<string> {
  url ??= team
    .request("/whoami")
    .then((response) => response.json())
    .then((body: unknown) => {
      if (body && typeof body === "object" && "url" in body && typeof body.url === "string") return body.url;
      throw new Error("the board did not say its URL");
    });
  url.catch(() => (url = undefined));
  return url;
}
