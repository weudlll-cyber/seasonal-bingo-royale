# Morning sheet

What the night chain of 2026-11-06 (A decisions and cleanup, B standalone accounts, C audit-3 security leftovers, D My matches marker) did, what runs, what is open and what needs the owner's word. Regenerated after every finished piece.

## Done

- A — decisions and cleanup — merged `fd5b8e6` (PR #38). Master CI and CodeQL green.
- B — standalone accounts — merged `1f10f54` (PR #39): league points without a confirmed e-mail (D59); "Forgot password?" by e-mail (SMTP client of its own); admin two-factor sign-in (TOTP, recovery codes, `sbr admin reset-2fa`); migration 0019. Master CI and CodeQL green.
- C — audit-3 security leftovers — merged `c5ebcde` (PR #40): S4 socket Origin at the Engine.IO handshake and caps of 50 per address / 5 per session (load check accounts exempt per address), refusals counted and logged; S5 token format before the database; G9 match id from a port; T2 missedNumbers timing; H5 duplicates merged. Master CI and CodeQL green.
- D — My matches marker — merged `9de9af8` (PR #41): a dot and "new" next to an asynchronous match with events the player has not seen; the server sends `news` in `mine` from the same one query; opening the match clears it. Master CodeQL green; master CI failed once in the live steps test (gap count, unrelated) — fixed on branch fix/live-steps-gap-count (PR #42, test only).
- End of the chain: on master, standalone: registration, "Forgot password?" through Mailpit, an admin's two-factor enrolment and a sign-in with a code, a fast royale of 8 humans without confirmed e-mails (all 8 "counted", 27–112 points). Website mode with the stub website: 9 website users, one royale, points only for the verified ones, forged headers refused. The dev server runs on master with the demo league.

## Needs the owner's word

- A: there is no host guide in the repository; the pause ("Draw next") is documented in the operator guide's new section "For hosts".
- A: `lobby.lateJoin` keeps its default value `true` in the stored defaults (defaults are changed only on request); it is marked as never read.
- B: admin sessions of local accounts that exist when this version starts lose their rights until the admin sets up two-factor sign-in (the first sign-in after the update asks for it).
- B: no audit table exists, so `sbr admin reset-2fa` records the reset only in its printed line.
- C: the per-address cap counts the address behind the trusted proxies (`SBR_TRUSTED_PROXIES`); an install behind a proxy that is not listed there sees every player at the proxy's address and should list it (or raise `SBR_SOCKETS_PER_ADDRESS`).
- End: the test page always adds at least one bot (and a match with bots never counts, D29), so the 8-human royale was created from the host's form with "Short royale rounds" instead.
- B: mail goes through a small SMTP client of the game's own (`apps/server/src/auth/smtp.ts`, no dependency): nodemailer 6.x carries high advisories, and nodemailer 10 is licensed MIT-0, which the CI license allow list does not contain; widening that list was not done at night. Say if MIT-0 may be allowed and nodemailer used instead.
- C: H3 (34 long header blocks) was left for later under the night's time rule; T4's journeys are listed (the e-mail verification flow is not built; axe needs a new dependency and more than an hour).
- D: the marker follows the task literally: "events after the player's last seen seq", cleared by opening the match (the away summary's fetch). Draws the player watched live after opening are not acknowledged by the socket (`presence.ping` is not built), so back in the lobby the match can say "new" again until it is opened. Say if the live screen should acknowledge as it goes.
