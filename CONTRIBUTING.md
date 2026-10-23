# Contributing

Everything in this repository is English: code, comments, commit messages and docs. The rules for Claude Code are in [CLAUDE.md](CLAUDE.md); they apply to human contributors too.

## Setup

Node 22 or newer (see `.nvmrc`) and pnpm (`corepack enable`, or `npm install -g pnpm`).

```sh
pnpm install   # also installs the git hooks (lefthook)
pnpm verify    # format check, lint, typecheck, tests
```

## Run the game locally

```sh
docker compose --env-file ops/.env.dev.example -f ops/compose.dev.yml up -d   # PostgreSQL 5490, Mailpit 8490
pnpm dev                                                                       # server 3900, player client 5390
```

Open http://localhost:5390. Development builds have a "Dev sign-in" menu (host, players 1–3; one sign-in per browser window, use a private window for a second person) and the Quick Test (play against bots). The server's development features need `SBR_DEV=1`, which `apps/server/dev.env` sets; it refuses to run with a public address. Browser tests: `pnpm e2e` uses a running `pnpm dev` or starts its own server and client on the same ports (restart `pnpm dev` after pulling server changes, or the tests run against the old code).

## Branching

- `master` is always releasable.
- One topic, one branch: create `feat/<topic>`, `fix/<topic>`, `docs/<topic>` or `chore/<topic>` from `master` and keep it until the topic is done; then it is merged once and deleted ([08 §2](docs/spec/08-devops-architecture.md)).
- Push after every commit, so the work is never only on one machine.
- Never force-push and never rewrite published history.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/): `feat(match): …`, `fix(chat): …`, `docs(spec): …`, `chore(repo): …`, `test(domain): …`. Small logical steps; code, header comments, docs, `docs/BACKLOG.md` and `docs/OPEN.md` change in the same commit ([10 §5](docs/spec/10-repository-structure.md)).

The pre-commit hook formats staged files with Prettier. Lint, typecheck and tests run in `pnpm verify` and CI.

## Pull requests and review

Every pull request goes through the [code review checklist](docs/code-review-checklist.md); the PR template links it. Run `pnpm verify` before asking for review.
