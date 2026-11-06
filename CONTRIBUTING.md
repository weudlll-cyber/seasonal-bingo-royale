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

Open http://localhost:5390. Development builds have a "Dev sign-in" menu (host, players 1–3; one sign-in per browser window, use a private window for a second person) and the Quick Test (play against bots). The server's development features need `SBR_DEV=1`, which `apps/server/dev.env` sets; it refuses to run with a public address. Browser tests: `pnpm e2e` uses a running `pnpm dev` or starts its own server and client on the same ports (restart `pnpm dev` after pulling server changes, or the tests run against the old code).

A filled leaderboard without playing: with `pnpm dev` running, `pnpm demo-league` creates the dev accounts `demo-01` … `demo-10` (e-mail confirmed) and has the server play three short royales among them (fast test rules, leaderboard switch on, no bots); it waits about 3 minutes until they have finished. The season and all-time boards, the profiles (`#/players/demo-01`) and the badges then show real data. Running it again plays three more matches with the same accounts. `pnpm demo-league --remove` removes the accounts with their league and badge rows; matches still running are aborted, finished ones stay in the event log without the accounts. Development only: the route behind it exists with `SBR_DEV=1` and is not in a production build.

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
