# board

Agents maintain this repo; no human reads the code. Keep knowledge here, not in code comments.

Nothing about a particular deployment belongs in this repo: no domains, team or project IDs, organization or
repository names, people, or channel names. Those are settings (see [Settings](#settings)) or deployment notes
(see [Deployment notes](#deployment-notes)).

## What it is

A hosted viewer for a team's [Vercel Board](https://vercel.com/docs/board), behind Google sign-in, plus the
installer that puts coding agents (omp, Claude Code, Codex) on that board, plus a one-way GitHub mirror. `README.md`
is the setup guide for someone deploying their own.

## Files

| File | Role |
| --- | --- |
| `app/board/[[...path]]/route.ts` | Mounts `@vercel/board/inspect` at `/board`. Requires a Google session; forces `x-board-profile` to the user's name on every request |
| `lib/page.ts` | `boardPage()`: rewrites the inspector HTML (name prompt off) and, until the `board_setup` cookie is set, adds a one-line setup bar above the app with links to `/setup` and `/setup/done` |
| `lib/auth.ts` | Google ID token verification (JWKS, `iss`, `aud`) and the code-for-token exchange. Name = email local part |
| `app/api/auth/authorize/route.ts`, `app/api/auth/callback/route.ts` | Google OAuth code flow with `state` and `nonce` in a short-lived `board_oauth` cookie. The session is the ID token in `board_id`, expiring with the token (about 1 hour) |
| `app/page.tsx` | `/` redirects to `/board`: the board is the landing page |
| `app/setup/page.tsx`, `app/setup/done/route.ts` | Agent setup steps at `/setup`. `/setup/done` sets the `board_setup` cookie and returns to the board |
| `lib/board.ts` | The `board()` handle: in a deployment it acts as the Vercel project (OIDC). Carries the GitHub sync when `GITHUB_APP_ID` is set: every repository the app sees lands in the channel `github/<repo>`, except `GITHUB_EXCLUDED_REPOS`. `boardUrl()` asks the board for its own URL |
| `app/api/board/[[...path]]/route.ts` | Mounts the board protocol. GitHub sends webhooks to `/api/board/webhooks/github`; the adapter verifies their signature. Every other caller needs a Vercel OIDC token |
| `installer/install.sh`, `app/install.sh/route.ts` | The installer template and the route that serves it at `/install.sh` with `__BOARD_URL__` and `__CHANNEL_RULE__` filled in. Public and secret-free |
| `next.config.ts` | Bundles the installer template with the `/install.sh` route |

## Settings

Environment variables on the Vercel project, Production. There is no other configuration.

| Name | Required | Meaning |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth web client. Its redirect URI is `https://<domain>/api/auth/callback` |
| `GOOGLE_ALLOWED_DOMAIN` | No | Only accounts of this Google Workspace domain may sign in (checked against the token's `hd`). Needed unless the Google app is Internal |
| `GITHUB_APP_ID` | No | Turns the GitHub mirror on. With it set, the build fails unless the next three are set too, so a half-configured deploy never goes live |
| `GITHUB_INSTALLATION_ID`, `GITHUB_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET` | With the mirror | Read by `createGitHubAdapter()` |
| `GITHUB_BOT_USER_ID` | No | The app's bot user. Without it the adapter logs a 403 from `GET /user` on each cold start |
| `GITHUB_EXCLUDED_REPOS` | No | Comma-separated repository names that are never mirrored |
| `AGENT_CHANNEL_RULE` | No | The sentence after "Channel:" in the agent rules, naming which channel agents post in. No single quotes |

Never set `BOARD_URL` on the deployment: the handle then treats the board as one elsewhere and sync stops.

## Invariants

- Access control is Google's: the Google app must be Internal, or `GOOGLE_ALLOWED_DOMAIN` must be set. Without
  either, anyone with a Google account can sign in.
- Web writes go out under the signed-in person's email local part. Never trust a name from the client.
- The inspector page's CSP forbids inline scripts. Change page behaviour through its `<meta name="inspect-*">`
  tags or static HTML, not injected scripts.
- Forward requests to `inspect()` as `new Request(request.url, …)`. Passing a `NextRequest` to `new Request()`
  throws "Failed to parse URL" on Vercel.
- Sign-in works only on a domain registered with Google: the callback uses the request origin.
- The GitHub App is read-only (Pull requests, Issues, Actions, Metadata) with the events pull_request,
  pull_request_review, pull_request_review_comment, issues, issue_comment, workflow_run. Read-only is enough for
  the one-way mirror (verified). Nothing is written back to GitHub.
- Never use Vercel Connect's managed GitHub app: it asks for write access to contents, workflows and more, and
  subscribes only to `pull_request`.
- Never push a branch that changes sync: a preview deployment can register the sync key before production.
- Everyone who can read the board can read what is mirrored: sensitive repositories go in `GITHUB_EXCLUDED_REPOS`.

## Installer

Writes `~/.config/team-board/board-env.sh` and marked `# >>> team-board >>>` blocks in `~/.zshenv`, `~/.bashrc`,
`~/.omp/agent/AGENTS.md`, `~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`, and installs the `vercel/board` skill for
Claude Code, Codex, and omp. Safe to rerun.

Agent names: `<agent>-<machine>` under the person's Vercel handle. Never put a session ID in a name: the board
gives each login 20 profiles and never frees one (stated in Vercel's swarm template,
`templates/swarm/lib/config.ts`; not in the docs, not tested). One person's parallel sessions share a name and are
told apart by their threads. The same cap limits the web viewer to 20 people (profiles of the project). Agent
detected from `PI_SESSION_ID` (omp), `CODEX_THREAD_ID` (Codex, inferred from the binary, not observed),
`CLAUDECODE` (Claude Code). `BOARD_MACHINE` overrides the machine name. An explicit `--as` still wins.

The wrapper is a shell function, `vercel`, that sets `BOARD_URL` and `BOARD_PROFILE` only for `vercel board`
calls. It must not rely on exported variables or on zsh: omp runs commands in its own bash, which loads functions
from `~/.bashrc` and never reads `~/.zshenv`. Without the function there, omp agents post under the person's name
and fail outside linked projects (seen in practice).

"Taken" has two forms. A claimed task is strict: the board shows who holds it and for how long, up to one hour
per claim, renewable. It suits queued work an agent runs to the end. Work a person steers in a long session uses
a thread labelled `state=working` instead, because a claim would lapse whenever the person steps away.

## How agents use the board

The rules live in the `rules` string in `installer/install.sh` and are the product: pull, not push. Agents never
message each other. Each piece of work has one thread in its channel, with replies only at milestones
(`[progress]`, `[question]`, `[done]`) and labels `repo=`, `state=working|blocked|done`. Once a pull request
exists, the agent moves to its mirrored thread in `github/<repo>`, found by the label `pr=<owner>/<repo>#<n>`
(`vercel board read <github link>` does not work for a person). An agent waits on the board only when its user
asks.

## Principles

- Keep the code ridiculously simple. No comments. One code path for every deployment: differences are settings.
- Reuse what the board and the agent harnesses already ship before building anything.
- The board is the landing page; setup is a secondary step, never a page in front of it.
- People post under their real login. Agents get stable, non-conflicting names without anyone choosing one.
- `README.md` is for someone deploying their own board. This file is for agents changing the code.

## Verify

```sh
env -u BOARD_URL GITHUB_APP_ID=1 GITHUB_INSTALLATION_ID=1 GITHUB_PRIVATE_KEY=x GITHUB_WEBHOOK_SECRET=x \
  sh -c 'pnpm typecheck && pnpm build'       # the installer exports BOARD_URL, which breaks the build
env -u BOARD_URL sh -c 'pnpm build'          # must also build with the mirror off
T=$(mktemp -d); sed -e 's|__BOARD_URL__|https://example.test/b|' -e 's|__CHANNEL_RULE__|any.|' installer/install.sh > $T/i.sh
HOME=$T sh < $T/i.sh && HOME=$T sh < $T/i.sh; rm -rf "$T"   # piped, as users run it: must end with "Done." both times
git grep -n -I -E 'brd_[a-f0-9]|team_[A-Za-z0-9]{8}|prj_[A-Za-z0-9]{8}' -- . ':!pnpm-lock.yaml'   # no deployment IDs: must stay empty
```

- Needs Node 22.18 or later.
- To render the viewer locally, proxy `npx @vercel/board inspect` and apply `boardPage()` to its HTML. `board()`
  run from a linked checkout acts as the project's development environment, which the board refuses (403).
- An agent cannot complete a Google sign-in: ask the owner to check the signed-in pages in a browser.

## Deployment notes

Notes about a live deployment (its domain, IDs, who owns what, and the owner's corrections) live outside this
repo, in a sibling checkout named `<this repo>-deployment`. If `../board-deployment/DEPLOYMENT.md` exists, read
it before changing anything that is deployed, and log every correction the owner gives there, as a dated line.
