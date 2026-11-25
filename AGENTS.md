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
| `lib/auth.ts` | Auth.js (`next-auth`) with the Google provider and a 30-day JWT session cookie. `signIn` refuses unverified emails and, when `ALLOWED_DOMAINS` is set, other domains. `boardName()` is the email local part |
| `proxy.ts` | Gates `/`, `/board` and `/setup`: signed-out pages go to `/signin`, signed-out API calls get 401. Running `auth()` here is also what renews the session cookie on every request, so an active user never signs in again |
| `app/signin/route.ts`, `app/api/auth/[...nextauth]/route.ts` | `/signin?next=` starts Google sign-in directly; the second mounts Auth.js's own routes |
| `app/page.tsx` | `/` redirects to `/board`: the board is the landing page |
| `app/setup/page.tsx`, `app/setup/done/route.ts` | Agent setup steps at `/setup`. `/setup/done` sets the `board_setup` cookie and returns to the board |
| `lib/board.ts` | The `board()` handle: in a deployment it acts as the Vercel project (OIDC). Carries the GitHub sync when `GITHUB_APP_ID` is set: every repository the app sees lands in the channel `github/<repo>`, except `GITHUB_EXCLUDED_REPOS`. With `HERMES_WEBHOOK_URL` and `HERMES_WEBHOOK_SECRET` set, a watcher (`--label board.task`) forwards `task.created` and `task.assigned` of still-ready tasks outside `github/` to a Hermes webhook route, signed as Hermes' generic HMAC V2 (`X-Webhook-Timestamp`, `X-Webhook-Signature-V2` over `<timestamp>.<body>`), with the event cursor as `X-Request-ID` for Hermes' dedupe. Keys: `event`, `event_type`, `channel`, `task_id`, `title`, `assignee`, `actor`, `url`. A 5xx or 429 is retried by the board. `boardUrl()` asks the board for its own URL |
| `app/api/board/[[...path]]/route.ts` | Mounts the board protocol. GitHub sends webhooks to `/api/board/webhooks/github`; the adapter verifies their signature. Every other caller needs a Vercel OIDC token |
| `installer/install.sh`, `app/install.sh/route.ts` | The installer template and the route that serves it at `/install.sh` with `__BOARD_URL__`, `__CHANNEL_RULE__`, `__WORK_SCOPE__`, `__ORIGIN__` and `__VERSION__` filled in. `/install.sh?version` answers only the version: a hash of the rendered script. Public and secret-free |
| `app/join.md/route.ts` | `/join.md`: the same setup written for an agent to follow from one link (CLI check, sign-in, installer, `whoami`, read its new rules). With `?thread=<message id>` it ends by reading that thread and posting the user's requests as replies. Public and secret-free |
| `next.config.ts` | Bundles the installer template with the `/install.sh` route |

## Settings

Environment variables on the Vercel project, Production. There is no other configuration.

| Name | Required | Meaning |
| --- | --- | --- |
| `AUTH_SECRET` | Yes | Signs the session cookie. Any long random value (`openssl rand -base64 32`) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth web client. Its redirect URI is `https://<domain>/api/auth/callback/google` |
| `ALLOWED_DOMAINS` | No | Comma-separated email domains that may sign in. Needed unless the Google app is Internal |
| `GITHUB_APP_ID` | No | Turns the GitHub mirror on. With it set, the build fails unless the next three are set too, so a half-configured deploy never goes live |
| `GITHUB_INSTALLATION_ID`, `GITHUB_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET` | With the mirror | Read by `createGitHubAdapter()` |
| `GITHUB_BOT_USER_ID` | No | The app's bot user. Without it the adapter logs a 403 from `GET /user` on each cold start |
| `GITHUB_EXCLUDED_REPOS` | No | Comma-separated repository names that are never mirrored |
| `HERMES_WEBHOOK_URL`, `HERMES_WEBHOOK_SECRET` | No | Both set: task events are forwarded to that Hermes webhook route, signed with that secret. Production only, so previews never register the watcher |
| `AGENT_CHANNEL_RULE` | No | The sentence after "Channel:" in the agent rules, naming which channel agents post in. No single quotes |
| `AGENT_WORK_SCOPE` | No | What belongs on the board, as a phrase that completes "Only … belongs on the board", such as `work on the website and the API`. Default: `work for the team that runs this board`. No quotes, `$`, backticks or backslashes |

Never set `BOARD_URL` on the deployment: the handle then treats the board as one elsewhere and sync stops.

## Invariants

- Access control is Google's: the Google app must be Internal, or `ALLOWED_DOMAINS` must be set. Without
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

Writes `~/.config/team-board/board` (the wrapper), `log`, `board-env.sh`, marked `# >>> team-board >>>` blocks in
`~/.zshenv`, `~/.bashrc`, `~/.omp/agent/AGENTS.md`, `~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`, a prompt hook for
each harness (below), and installs the `vercel/board` skill for Claude Code, Codex, and omp. Safe to rerun.

Agent names: `<agent>-<machine>` under the person's Vercel handle. One person's parallel sessions share a name
and are told apart by their threads. The board does not cap names per login: Vercel's swarm template said 20 on
2026-11-19, and vercel/board#768 (2026-11-20) states the hosted API "no longer caps profiles per caller". Names
stay per machine anyway, so the list of posters stays short and readable. Agent detected from `PI_SESSION_ID`
(omp), `CODEX_THREAD_ID` (Codex), `CLAUDECODE` (Claude Code), in that order: all three verified by running
the wrapper inside each harness. An agent started from inside another inherits the outer one's variables, so a
Claude Code launched from an omp shell is named `omp-…`. `BOARD_MACHINE` overrides the machine name. An explicit
`--as` still wins.

The wrapper `~/.config/team-board/board` is an executable script that sets `BOARD_URL` and `BOARD_PROFILE` and
runs `vercel board`. The rules tell agents to use it for every board command. It must stay a script, not a shell
function or exported variable: omp runs commands in its own embedded bash, which reads no rc file at all for a
zsh user, so anything in `~/.zshenv` or `~/.bashrc` never reaches an omp agent. Before the wrapper, omp agents
posted under the person's name and failed outside linked projects (seen in practice). `board-env.sh` only makes
plain `vercel board` go through the wrapper in shells that do load an rc file.

Work is logged as a board task the agent holds, so it shows in the viewer's Tasks view. Plain threads labelled
`state=working` were tried first and rejected: the owner looks at Tasks and saw nothing.

`~/.config/team-board/log` is how agents log, and it must never slow them down: every call forks the board
commands into the background and returns in under 0.1 s (measured; a board command itself takes 1 to 2 s). It
keeps one task per agent session in `~/.config/team-board/tasks/<session id>` (task ID, then its text), and a lock
directory beside it keeps one session's calls in order. `start <channel> <text>` closes the session's previous
task and creates a claimed one; `progress` and `question` reply (a question also blocks the task for a person);
`done` completes it; `remind` prints the reminder and renews the claim. Claims last an hour, so the renewal on
every user prompt is what keeps a task held; one left alone falls back to ready, which is the truth.

Rules reach a machine only when the installer runs there, so `log` checks once a day, in its background half,
whether `/install.sh?version` still matches the version it was installed with (`~/.config/team-board/version`).
If not, it leaves `~/.config/team-board/stale`, and `remind` then tells the agent to run the installer again.
Changing the rules or a setting therefore reaches every machine within a day of its next prompt. Installs from
before this check have to be rerun by hand once.

Written rules alone were not enough: in a trial omp knew the rule and skipped it. So each harness runs
`log remind` on every user prompt and adds its output to the context: omp through the extension
`~/.omp/agent/extensions/team-board.ts` (`before_agent_start`), Claude Code and Codex through a
`UserPromptSubmit` hook in `~/.claude/settings.json` and `~/.codex/hooks.json`. Vercel shipped and later removed
a turn-end reminder hook of its own (0.21, reason not public): keep ours to one short line and no blocking.

`log` starts its background half in a new session (`perl … setsid`), because Codex kills a command's process
group when the command ends, even without a sandbox. Verified by a trial job with no mention of the board: omp
and Claude Code logged and completed a task on their own, and Codex did with its sandbox off. Inside Codex's
sandbox nothing works: `~/.config` is read-only and the network is closed, so neither the state file, the CLI's
claim store (`~/.config/board/claims`) nor the board is reachable. Opening that is the owner's decision
(`sandbox_workspace_write.writable_roots` and `network_access` in `~/.codex/config.toml`); the installer does
not touch it.

## How agents use the board

The rules live in the `rules` string in `installer/install.sh` and are the product: pull, not push. Agents never
message each other. What goes on the board is decided by topic, by the agent: only `AGENT_WORK_SCOPE` that
teammates could pick up or need to know about. Never: anything personal, people matters, company finances, legal
matters, unfixed security problems, secrets or access, or anything meant for only part of the team (the test:
may everyone in the company read this line?). Unsure means no log. A short form of the same is in the per-prompt
reminder. It is the agent's judgment, not a gate, so everything an agent writes is a short neutral line (what,
repo, branch), never the user's words: a wrong call then leaks little. That matters because the board cannot
take it back: deleting a root leaves a tombstone, and a completed task keeps its result even then (no API clears
it). A gate by folder or repository was designed and rejected by the owner as too complicated. Before changing
the rule text, rerun the trial: fresh agents given in-scope and restricted jobs on a scratch board (`BOARD_URL`
in their environment), with no mention of the board. Each piece of work is one task in its channel, logged with `log start` and updated only at
milestones (`progress`, `question`, `done`). Pull requests and issues are mirrored into `github/<repo>` on their
own. An agent reads what others hold only when asked or before long work, and waits on the board only when its
user asks. Waiting is `wait <thread id> --after <newest message id>`: without `--after`, `wait` on a thread
returns replies that are already there (seen in a trial), so a listener would loop on old messages.

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

## Changes and releases

- Every change goes through a pull request. Once its checks pass and no blocking finding is open, merge it: `main`
  deploys. Do not leave finished pull requests open.
- Cut a release only when the owner asks. Bump `version` in `package.json` in its own pull request, merge it, then tag
  that commit on `main` as `v<version>` and publish a GitHub release whose notes list what changed since the last
  tag: `gh release create v<version> --target main --title v<version> --notes-file <notes>`.

## Deployment notes

Notes about a live deployment (its domain, IDs, who owns what, and the owner's corrections) live outside this
repo, in a sibling checkout named `<this repo>-deployment`. If `../board-deployment/DEPLOYMENT.md` exists, read
it before changing anything that is deployed, and log every correction the owner gives there, as a dated line.
