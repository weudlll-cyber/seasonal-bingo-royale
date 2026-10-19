# Contributing

Everything in this repository is English: code, comments, commit messages and docs. The rules for Claude Code are in [CLAUDE.md](CLAUDE.md); they apply to human contributors too.

## Setup

Node 22 or newer (see `.nvmrc`) and pnpm (`corepack enable`, or `npm install -g pnpm`).

```sh
pnpm install   # also installs the git hooks (lefthook)
pnpm verify    # format check, lint, typecheck, tests
```

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
