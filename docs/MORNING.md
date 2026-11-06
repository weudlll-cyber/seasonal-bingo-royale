# Morning sheet

What the chain after the night of 2026-11-06 (CHAT-EMBED, then FINAL-BEFORE-MOVE: A three follow-ups, B the move rehearsed against the real website installer) did, what runs, what is open and what needs the owner's word. Regenerated after every finished piece. The night chain of 2026-11-06 (A–D) is done: merges `fd5b8e6`, `1f10f54`, `c5ebcde`, `9de9af8` and the master fix `407629a`, all green.

## Done

- CHAT-EMBED — merged `3dba414` (PR #43): the website's chat room `bingo` beside the lobby, the match screens and the host console in website mode — "Chat" in the top bar, a side panel on wide screens, a one-tap drawer on phones, remembered per browser, the frame made on first opening and following the theme; `SBR_CHAT_PATH` / `SBR_CHAT_ROOM`; `frame-src 'self'`; nothing standalone. Screenshots `reports/screens/latest/chat-1440-*.jpg`, `chat-390-*.jpg`.

## Running

- A — follow-ups (branch fix/follow-ups-1106): mail through nodemailer 10.3.1 (MIT-0, now on the CI licence allow list; the game's own SMTP client removed); steps an asynchronous match's players watched live count as seen (the server writes them, at most once per 10 s per match), so "new" does not come back; `lobby.lateJoin` defaults to false. Pull request next.

## Open

- B — the move rehearsed against the real website installer (test/real-site), nginx and own Caddy.

## Needs the owner's word

- (none yet)
