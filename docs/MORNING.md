# Morning sheet

What the night chain of 2026-11-06 (A decisions and cleanup, B standalone accounts, C audit-3 security leftovers, D My matches marker) did, what runs, what is open and what needs the owner's word. Regenerated after every finished piece.

## Done

- A — decisions and cleanup — merged `fd5b8e6` (PR #38). Master CI and CodeQL green.
- B — standalone accounts — merged `1f10f54` (PR #39): league points without a confirmed e-mail (D59); "Forgot password?" by e-mail (SMTP client of its own); admin two-factor sign-in (TOTP, recovery codes, `sbr admin reset-2fa`); migration 0019. Master CI and CodeQL green.

## Running

- C — audit-3 security leftovers (branch fix/audit3-security): S4 socket Origin at the handshake and caps per address/session; S5 token format before the database; G9 id port; T2 timing; H5 duplicates merged. T4 and H3 listed in BACKLOG (time rule). Pull request next.

## Open

- D — My matches marker (feat/my-matches-marker)

## Needs the owner's word

- A: there is no host guide in the repository; the pause ("Draw next") is documented in the operator guide's new section "For hosts".
- A: `lobby.lateJoin` keeps its default value `true` in the stored defaults (defaults are changed only on request); it is marked as never read.
- B: admin sessions of local accounts that exist when this version starts lose their rights until the admin sets up two-factor sign-in (the first sign-in after the update asks for it).
- B: no audit table exists, so `sbr admin reset-2fa` records the reset only in its printed line.
- B: mail goes through a small SMTP client of the game's own (`apps/server/src/auth/smtp.ts`, no dependency): nodemailer 6.x carries high advisories, and nodemailer 10 is licensed MIT-0, which the CI license allow list does not contain; widening that list was not done at night. Say if MIT-0 may be allowed and nodemailer used instead.
- C: H3 (34 long header blocks) was left for later under the night's time rule; T4's journeys are listed (the e-mail verification flow is not built; axe needs a new dependency and more than an hour).
