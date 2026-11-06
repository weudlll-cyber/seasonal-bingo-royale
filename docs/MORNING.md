# Morning sheet

What the chain after the night of 2026-11-06 (CHAT-EMBED, then FINAL-BEFORE-MOVE: A three follow-ups, B the move rehearsed against the real website installer) did, what runs, what is open and what needs the owner's word. Regenerated after every finished piece. The night chain of 2026-11-06 (A–D) is done: merges `fd5b8e6`, `1f10f54`, `c5ebcde`, `9de9af8` and the master fix `407629a`, all green.

## Done

- CHAT-EMBED — merged `3dba414` (PR #43): the website's chat room `bingo` beside the lobby, the match screens and the host console in website mode; nothing standalone. Master CI and CodeQL green.
- A — follow-ups — merged `fde292b` (PR #44): nodemailer 10.3.1 (MIT-0 allowed in CI; the game's own SMTP client removed); steps watched live count as seen, so "new" does not come back; `lobby.lateJoin` false. Master CI and CodeQL green.

## Running

- B — the move rehearsed against the real website installer (branch test/real-site): both modes passed every check (nginx 58, own Caddy 48; website d71b111 and dbcf0ed). Three bingo faults found and fixed: SMTP questions in a website install, an install without mail that did not start, the authorize check without the method header. Pull request next.

## Open

- The final report; the dev server on master with the demo league.

## Needs the owner's word

- (none yet)
