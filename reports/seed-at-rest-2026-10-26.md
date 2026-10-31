# SEED-AT-REST-1 — 2026-10-26

Branch `fix/seed-at-rest`, merged into master as `4907bcc` (pull request #3) when its CI was fully green. Written afterwards, on 2026-10-31 (AUDIT-2), from the branch's three commits; the sheet was missing.

## DONE

| Item                         | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Match secrets sealed at rest | `apps/server/src/match/codec.ts`, encoding version 2: every seed and every round's `drawSequence` is stored as `{ "$sealed": base64 }` (AES-256-GCM with `SBR_SEED_KEY`) in the event log (`sbr.match_events`) and the snapshots; the domain, replay, scheduler recovery and verification read them unchanged. Payloads stored before version 2 still decode; a version-2 payload holding a plain secret is refused; no error names a secret (`815460c`)                                                                                                                                                      |
| A wrong key stops the server | `PgMatchStore.checkKey` opens the newest sealed seed at startup, so a wrong `SBR_SEED_KEY` stops the server instead of failing at the first match it loads; the integration harness uses one key per database                                                                                                                                                                                                                                                                                                                                                                                                 |
| Tests                        | `codec.test.ts` (sealing, old payloads, a plain secret refused, a wrong key refused); `seedAtRest.integration.test.ts`: the raw `lobbyOpened` and `roundStarted` rows and the snapshots of a running match hold neither the seed nor the undrawn part of the draw order in any plain form (hex, base64, both JSON list spellings), a second server on the same database draws the round's next number, another key refuses to start. The first CI run failed because numbers already drawn are public; the check now looks for the next twelve undrawn numbers, red with the draw orders unsealed (`6c63a3b`) |
| Decisions of 2026-10-26      | Spec 12 §2: the domain's branch target is 85 % (the uncovered branches are unreachable guards; lines target unchanged). Spec 09 §4: the maintenance page replaces the lobby and the create form; sign-in stays reachable. BACKLOG: "Verify this match" recomputed in the browser as a later item; match secrets at rest closed; OPEN aligned (`f6efac7`)                                                                                                                                                                                                                                                      |
| Specs                        | 03 §9 (secrets at rest), 04 §3.3 (event encoding versions)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

## Later changes

- AUDIT-2 (2026-10-31) binds every new seal to its match id (AES-GCM additional data, encoding version 3, `sbr.matches.seed_enc_version`) and decodes strictly (an unknown `$v` or an extra field next to `$sealed` is refused); versions 1 and 2 stay readable. Backups carry the seed key, and the restore drill opens one sealed seed with it.

## NOT DONE

- Nothing of the task.

## NEEDS THE OWNER'S WORD

- Nothing open from this task.

## FOR THE OWNER

Nothing to look at on screen: the change is in how the server stores a match. A player sees the seed only after the match ends, on "Verify this match", as before.
