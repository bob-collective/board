import { createGitHubAdapter } from "@chat-adapter/github";
import { board } from "@vercel/board";
import { github } from "@vercel/board/sync-github";

const excludedRepos = (process.env.GITHUB_EXCLUDED_REPOS ?? "").split(",").map((repo) => repo.trim());

export const team = board({
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
