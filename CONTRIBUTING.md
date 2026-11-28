# Contributing

Everything in this repository is English: code, comments, commit messages and docs. The rules for Claude Code are in [CLAUDE.md](CLAUDE.md); they apply to human contributors too.

## Setup

Node 22 or newer (see `.nvmrc`) and pnpm (`corepack enable`, or `npm install -g pnpm`).

```sh
pnpm install   # also installs the git hooks (lefthook)
pnpm verify    # format check, lint, typecheck, tests
pnpm verify:quiet   # the same; the tests print only their failures (dot reporter)
```

Quiet runs (CLAUDE.md, "Working cheaply"): `pnpm test:quiet [files]` and `pnpm e2e:quiet [spec]` print failures in full and a dot per passing test; long logs go to `reports/logs/` (git-ignored).

## Run the game locally

```sh
docker compose --env-file ops/.env.dev.example -f ops/compose.dev.yml up -d   # PostgreSQL 5490, Mailpit 8490
pnpm dev                                                                       # server 3900, player client 5390
```

Open http://localhost:5390. Development builds have a "Dev sign-in" menu (host, players 1–3; one sign-in per browser window, use a private window for a second person) and the Quick Test (play against bots). The server's development features need `SBR_DEV=1`, which `apps/server/dev.env` sets; it refuses to run with a public address. Browser tests: `pnpm e2e` starts a server and client of its own on ports 3901 and 5392, on an empty database that is dropped afterwards, so a run never writes the development database and a running `pnpm dev` stays as it is. The load measurements (`load/`) run against the same test server: start it with `pnpm test-server` (Ctrl+C drops its database).

A filled leaderboard without playing: with `pnpm dev` running, `pnpm demo-league` creates the dev accounts `demo-01` … `demo-10` (e-mail confirmed) and has the server play three short royales among them (fast test rules, leaderboard switch on, no bots); it waits about 3 minutes until they have finished. The season and all-time boards, the profiles (`#/players/demo-01`) and the badges then show real data. Running it again plays three more matches with the same accounts. `pnpm demo-league --remove` removes the accounts with their league and badge rows; matches still running are aborted, finished ones stay in the event log without the accounts. Development only: the route behind it exists with `SBR_DEV=1` and is not in a production build.

## Look at website mode locally

The parts that exist only inside the website (the back link, the Discord step badges, the header, the shared call's slot) are looked at in the kit's local preview before a merge (kit `docs/OPERATIONS.md`, "The local website-mode preview"). It needs a second game server in website mode, on a database of its own, serving the built client. In PowerShell, from the repository's root, with the dev compose services running:

```powershell
# 1. An empty database for the preview (the development database is not used), and the client.
docker exec sbr-dev-postgres-1 createdb -U sbr sbr_preview
pnpm --filter @sbr/web build

# 2. First window: the game in website mode on port 3902. The secret is any 32 characters or
#    more, for this computer only, never the server's.
$env:SBR_WEBSITE_PROXY_SECRET = "preview-only-for-this-computer-0000"
$env:DATABASE_URL = "postgres://sbr:change-me-dev-only@127.0.0.1:5490/sbr_preview"
$env:SBR_DEV = "1"; $env:SBR_PORT = "3902"; $env:SBR_AUTH_MODE = "website"
$env:SBR_BASE_PATH = "/games/bingo/"; $env:SBR_PUBLIC_URL = "http://127.0.0.1:4490/games/bingo/"
$env:SBR_TRUSTED_PROXIES = "127.0.0.1"; $env:SBR_WEB_DIR = "../web/dist"
$env:SBR_DATA_DIR = "$env:TEMP\sbr-preview-data"
pnpm --filter @sbr/server start

# 3. Second window: the stand-in website in front of it. It prints the one address to open.
$env:SBR_WEBSITE_PROXY_SECRET = "preview-only-for-this-computer-0000"
pnpm exec sk-preview --slug bingo --app http://127.0.0.1:3902 --secret-header X-Sbr-Proxy-Secret --secret-env SBR_WEBSITE_PROXY_SECRET --can-host --port 4490
```

The preview listens on 4490 (the kit's default, 4400, may be another game's preview). The test member "Preview Member" has three step badges and may host. The client is the built one, so it has no development tools: `pnpm preview-matches` makes two test matches with bots, held between rounds ([docs/operator-guide.md](docs/operator-guide.md) §8b); other matches are played by people (each in a window of their own) or made through the API (`devTools: true`, then `/bots` and `/start`). The shared call is a stand-in; the real one is only on the website. Stop both with Ctrl+C and throw the database away: `docker exec sbr-dev-postgres-1 dropdb -U sbr --force sbr_preview`.

## Branching

- `master` is always releasable.
- One topic, one branch: create `feat/<topic>`, `fix/<topic>`, `docs/<topic>` or `chore/<topic>` from `master` and keep it until the topic is done; then it is merged once and deleted ([08 §2](docs/spec/08-devops-architecture.md)).
- Push after every commit, so the work is never only on one machine.
- Never force-push and never rewrite published history.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/): `feat(match): …`, `fix(chat): …`, `docs(spec): …`, `chore(repo): …`, `test(domain): …`. Small logical steps; code, header comments, docs, `docs/BACKLOG.md` and `docs/OPEN.md` change in the same commit ([10 §5](docs/spec/10-repository-structure.md)).

The pre-commit hook formats staged files with Prettier. Lint, typecheck and tests run in `pnpm verify` and CI.

Testing (CLAUDE.md, Testing): before a push run lint, typecheck, `pnpm verify` when the change can affect it, and the e2e and unit specs that read what you changed, in Chromium (`SBR_E2E_BROWSER=chromium pnpm e2e:quiet <spec>`). The full e2e suite in all three browsers runs in CI on the pull request (Chromium on three runners); run a single spec locally only to reproduce a CI failure.

## Pull requests and review

Every pull request goes through the [code review checklist](docs/code-review-checklist.md); the PR template links it. Run `pnpm verify` before asking for review.
