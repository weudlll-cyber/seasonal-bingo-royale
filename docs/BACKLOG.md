# Backlog

The authoritative list. `OPEN.md` is the short page over it and is aligned after every change here.

## Part one — open

### Implementation

- WP-08 … WP-30 (docs/spec/15-implementation-plan.md) — not started
- Realtime classic rounds: rule for players still tapping when a prize is decided on a draw (to be decided with the owner before WP-12)
- WP-09 remainder: e-mail verification flow (tokens, Mailpit), TOTP 2FA and recovery codes, password reset, session list and revoke (`/me/sessions`), the bundled top-100k breached-password list, admin session lifetimes; flags `SBR_FEATURE_EMAIL_VERIFICATION` / `SBR_FEATURE_TWO_FACTOR` stay off until then
- Realtime server: store `missed_numbers` / `auto_mark_delay_ms` per match and schedule `AutoMarkMissed` after the delay (D9, docs/spec/01-game-design.md §6, 06 §5) — with WP-12/WP-15; the domain rule and the Quick Test are done

### Needed from the website repository (Phase 6 only)

- Handoff endpoint that signs a 60-second token for the logged-in website user, plus a published public key (docs/spec/07-integration-architecture.md §4)
- Chat room `bingo` created by a website admin (§6)
- Embeddable call view at a predictable URL per call, so the game can render it next to a match when the match carries `host_call_ref` (docs/spec/01-game-design.md §12a, docs/spec/07-integration-architecture.md §6a; consumed by WP-25b)

### Optional inputs

- App icon (PNG 512×512) and sounds (assets/README.md)

## Part two — closed

| Item                                                                                                                 | Closed by                                            | Date       |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ---------- |
| Specification 01–15                                                                                                  | Initial spec                                         | 2026-10-19 |
| D1–D6 owner decisions (license, Seasonal Tokens icons, website login, embed allowlist, chat on the website, address) | docs/spec/README.md §4                               | 2026-10-19 |
| Brand assets (season icons, logo, colours, font)                                                                     | Copied from the website repository, assets/README.md | 2026-10-19 |
| WP-01 Monorepo and tooling                                                                                           | Branch feat/wp-01-tooling                            | 2026-10-19 |
| WP-02 CI pipeline and container                                                                                      | Branch feat/wp-02-ci                                 | 2026-10-20 |
| PERMS-1 permission list                                                                                              | Branch chore/perms-1                                 | 2026-10-20 |
| SPEC-MODES-1 game types, prizes, live call, local dev ports                                                          | Branch docs/spec-modes-1                             | 2026-10-20 |
| WP-03 Server skeleton and database                                                                                   | Branch feat/wp-03-server                             | 2026-10-20 |
| WP-04 Contracts: ruleset schema and defaults                                                                         | Branch feat/wp-04-contracts                          | 2026-10-20 |
| WP-05 Domain: cards, draws, patterns, commitment                                                                     | Branch feat/wp-05-domain-core                        | 2026-10-20 |
| WP-06 Domain: scoring and seasons                                                                                    | Branch feat/wp-06-scoring                            | 2026-10-20 |
| WP-07 Domain: royale structure AND classic round flow (first pass)                                                   | Branch feat/wp-07-match-flow                         | 2026-10-20 |
| WP-07 Domain: match lifecycle, round-end conditions, score carry and full-match tests                                | Branch feat/wp-07b-match-lifecycle                   | 2026-10-20 |
| D9 missed-number rule (spec, domain, Quick Test) and per-player marking: bots score in manual mode                   | Branch feat/wp-08-quicktest                          | 2026-10-20 |
| D10 last number tappable inside its window, classic prizes decided at window close; D11 royale multiplier 1          | Branch feat/wp-08-quicktest                          | 2026-10-21 |
| Quick Test: live standings active first; seasons and effects from the server only; acceptance play-through green     | Branch feat/wp-08-quicktest                          | 2026-10-21 |
