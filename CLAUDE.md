# CLAUDE.md — Working rules for this repository

## Language

Everything in this repository is English: code, comments, commit messages, docs, UI strings.

## Source of truth

- The specification in `docs/spec/` governs behaviour. Read the sections a task names before changing code, and cite them in the report.
- If the spec is silent or contradictory on a point you need, do not invent a rule: implement the rest, and list the question in the report.
- Configuration defaults live in `packages/contracts/src/config/defaults/`. Do not change a default unless the task says so.

## Architecture rules

- Layers: `domain` ← `application` ← `apps/server`. `domain` has no I/O, no clock, no randomness except injected ports. `contracts` holds every shape shared across the wire.
- Client code never computes scores, patterns or rankings. The server decides; the client renders.
- File ≤ 300 lines (test files have no file limit), function ≤ 60 lines (tests included), complexity ≤ 12. Split by responsibility, not by line count.
- Every source file starts with the standard header (docs/spec/10-repository-structure.md §3). Important blocks get inline comments.

## Hygiene in every task

- Before writing a helper, search for an existing one; name reused helpers in the report.
- No dead code, no unused variables or exports in the area you touched; things noticed elsewhere are reported, not changed.
- Update header comments, inline comments, docs and line references in the same commit as the code.
- When a task closes an item, move it in `docs/BACKLOG.md` from part one to part two in the same commit, then align `docs/OPEN.md`.
- New dependencies: name each one and the reason in the report.

## How we check

The Seasonal projects' one rule (kit HANDBOOK "How we check"; owner decisions of 2026-11-06, 2026-11-23, 2026-11-25 and 2026-11-27, kit K82 and K110). "Done" for a piece means built, pushed and quick-checked.

### A small task

- Locally, before each push: the typecheck, the lint of the touched files and the fast tests of the changed files; when the change touches what a browser spec checks (a UI text, test id, route or event wording: `rg` over `e2e/` and `**/*.test.*`), that one spec in one browser, never the whole browser suite.
- The full checks run on GitHub through the draft pull request. Do not wait for CI between the pieces of a chain; look at the latest run once at the end and before every merge, and fix a red run on the same branch. `pnpm verify` is not run locally.

### A big move (a kit adoption, a migration, a task of many known changes)

- Build all changes first. Between them: typecheck, lint of the touched files, unit tests of the touched package.
- Then one round of the real checks, each once: the browser specs that cover the changes, the sweep (once, at the end), a rehearsal where ops changed (only what the change can have altered: list it first), the draft pull request's CI.
- A fault is fixed and only what the fix can have changed is checked again: a colour, the contrast check of the screens concerned; a size or spacing of a shared part, the screens that show it; anything else, the one screen. No further full run. No walks or measurements between the pieces.
- The report says how many full runs there were and why. An exemption names its reason: a kit part (`file:line`) or an owner decision. Anything else is fixed.
- Line counts once, at the hand-over, for the whole branch against `master`. One written report (`docs/MORNING.md`); the final message gives only the pushed commits, the CI result, the open questions with a proposal, new kit findings and the report's path.

### Every task

- Each new test fails once before its fix. Never re-run a check on an unchanged tree.
- The full browser suite runs nightly and on demand (`browsers.yml`), not on every pull request; a pull request runs the unit tests, the static checks and the browser specs of what it changed. A red nightly run is fixed before the next merge.
- After a merge, check the master run of the merge commit before the next merge and before the final report; if it is red, stop and fix master first.
- Your own play-throughs (acceptance, screenshots) use the fast test rules / "Short royale rounds", except one realtime royale at full length per task that changes the game screens or rules.

## Working cheaply

Owner decision of 2026-11-06: spend fewer tokens without testing or checking less.

Owner decision of 2026-11-23: these saving rules apply to every Seasonal project.

- Test runs print failures only: `pnpm test:quiet`, `pnpm verify:quiet`, `pnpm e2e:quiet` (dot reporters, failures in full); never read a passing run's full output.
- Long logs (install/Ubuntu tests, the real-site rehearsal, loadcheck, CI job logs) go to a file under `reports/logs/` (git-ignored); read only the failing part (grep/tail), never the whole log.
- Screenshots are taken for the owner, not for checking: check with assertions; open an image yourself only when an assertion cannot decide it.
- Screenshots and other check images are never committed (`reports/screens/` and `reports/logs/` are git-ignored) and are deleted once checked; only the final review set of a piece stays in `reports/screens/latest/` (owner decision of 2026-11-21).
- Wait for CI with one blocking command (`gh run watch <id> --exit-status`, output to a file), not by polling.
- Read large files by searching first and reading only the lines needed.
- A flaky test is fixed at its cause the first time it flakes, not re-run.

## Git

- Work on the branch the task names. Push after every finished piece of work.
- Merge only when the task explicitly allows it. After a merge, check CI for the merge commit (`gh run list --branch master`) as the Testing rules say (before the next merge and before the final report) and report it.
- Never force-push or reset. After a branch is merged, delete it on origin and locally; if the master run of its merge commit turns red, fix master on a new branch.
- Accounts created for a test are removed by that test; matches it created are aborted, never deleted (the event log is append-only, docs/spec/04-database-design.md §3.3).
- Never disable a trigger, constraint or other protection. If a task needs that, list it under the owner's questions in the report and continue without it.
- Run commands one at a time. Do not chain them with `&&`, `;` or `|` unless a single tool needs a pipe; chained commands do not match the permission rules and make the owner approve them by hand.

## Before reporting

Check as "How we check" says. Report: lines before/after per touched file, what was removed, what was extracted, what was reused, what was noticed but left alone, test results, and for visible changes what the owner should look at (Quick Test seed when available).
