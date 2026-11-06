# Morning sheet

What the night chain of 2026-11-06 (A decisions and cleanup, B standalone accounts, C audit-3 security leftovers, D My matches marker) did, what runs, what is open and what needs the owner's word. Regenerated after every finished piece.

## Done

- A — decisions and cleanup — merged `fd5b8e6` (PR #38): D51–D60 in the decision list and the specs they touch; BACKLOG and OPEN aligned; `lobby.lateJoin` marked as never read; `sessions.ip_prefix` dropped (0018). Master CI and CodeQL green.

## Running

- B — standalone accounts (branch feat/standalone-accounts): league points without a confirmed e-mail (D59); "Forgot password?" by e-mail (a small SMTP client of its own, apps/server/src/auth/smtp.ts; Mailpit locally and in CI); admin two-factor sign-in (TOTP, recovery codes, `sbr admin reset-2fa`; qrcode for the QR code); `SBR_FEATURE_TWO_FACTOR` removed; migration 0019. Pull request next.

## Open

- C — audit-3 security leftovers (fix/audit3-security)
- D — My matches marker (feat/my-matches-marker)

## Needs the owner's word

- A: there is no host guide in the repository; the pause ("Draw next") is documented in the operator guide's new section "For hosts".
- A: `lobby.lateJoin` keeps its default value `true` in the stored defaults (defaults are changed only on request); it is marked as never read.
- B: admin sessions of local accounts that exist when this version starts lose their rights until the admin sets up two-factor sign-in (the first sign-in after the update asks for it).
- B: no audit table exists, so `sbr admin reset-2fa` records the reset only in its printed line.
- B: mail goes through a small SMTP client of the game's own (`apps/server/src/auth/smtp.ts`, no dependency): nodemailer 6.x carries high advisories, and nodemailer 10 is licensed MIT-0, which the CI license allow list does not contain; widening that list was not done at night. Say if MIT-0 may be allowed and nodemailer used instead.
