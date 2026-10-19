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
- File ≤ 300 lines, function ≤ 60 lines, complexity ≤ 12. Split by responsibility, not by line count.
- Every source file starts with the standard header (docs/spec/10-repository-structure.md §3). Important blocks get inline comments.

## Hygiene in every task

- Before writing a helper, search for an existing one; name reused helpers in the report.
- No dead code, no unused variables or exports in the area you touched; things noticed elsewhere are reported, not changed.
- Update header comments, inline comments, docs and line references in the same commit as the code.
- When a task closes an item, move it in `docs/BACKLOG.md` from part one to part two in the same commit, then align `docs/OPEN.md`.
- New dependencies: name each one and the reason in the report.

## Git

- Work on the branch the task names. Push after every finished piece of work.
- Merge only when the task explicitly allows it. After a merge, check CI for the merge commit (`gh run list --branch master`) and report it.
- Never force-push, reset, or delete branches unless the task says so.
- Data and accounts created for a test are removed by that test.

## Before reporting

Run `pnpm verify`. Report: lines before/after per touched file, what was removed, what was extracted, what was reused, what was noticed but left alone, test results, and for visible changes what the owner should look at (Quick Test seed when available).
