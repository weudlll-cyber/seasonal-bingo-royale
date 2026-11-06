# Morning sheet

What the night chain of 2026-11-06 (A decisions and cleanup, B standalone accounts, C audit-3 security leftovers, D My matches marker) did, what runs, what is open and what needs the owner's word. Regenerated after every finished piece.

## Done

- (nothing merged yet in this chain)

## Running

- A — decisions and cleanup (branch chore/decisions-1106): D51–D60 recorded in the decision list and the specs they touch; BACKLOG and OPEN aligned; `lobby.lateJoin` marked as never read; the unused `sessions.ip_prefix` dropped (migration 0018).

## Open

- B — standalone accounts (feat/standalone-accounts)
- C — audit-3 security leftovers (fix/audit3-security)
- D — My matches marker (feat/my-matches-marker)

## Needs the owner's word

- A: there is no host guide in the repository; the pause ("Draw next") is documented in the operator guide's new section "For hosts".
- A: `lobby.lateJoin` keeps its default value `true` in the stored defaults (defaults are changed only on request); it is marked as never read.
