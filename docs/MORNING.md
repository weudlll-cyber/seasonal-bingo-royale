# Morning sheet

What the admin-area concept (branch `docs/admin-concept`, PR #54) did, what runs, what is open and what needs the owner's word. Regenerated after every finished piece. Documentation and mockups only: no product code changed.

## Done

- 1 — Inventory: [docs/concepts/admin-values.md](concepts/admin-values.md), 524 fixed values in four parts (rulesets and contracts 195, game engine 56, server 180, player client 93); per role: organizer per match 27, admin 229, server only 105, stays fixed 163. Eight open points found while listing.
- 2 — Concept: [docs/concepts/admin-area.md](concepts/admin-area.md) — the Organizer and Admin roles on the seeded roles (standalone and website), the Organizer's three-step "Start a match", seven Admin sections, what stays on the server, versions and undo on `settings_versions`, 14 differences from spec 11 and 15.
- 3 — Mockups: [docs/concepts/admin-mockups/](concepts/admin-mockups/) — organizer "Start a match", admin overview, one preset's "Draws and timing" (descriptions, min/max, a warning), the history. On the game's own styles; open the `.html` files in a browser. Screenshots (not committed) in `reports/screens/latest/admin-concept-*.jpg`.
- Decided (owner decision of 2026-11-20): admin-area.md §8 (a)–(r); the admin area is built before the move to the VPS. D58 changed and D63 added in docs/spec/README.md; spec 11 and 15 point to the concept.
- Build order: admin-area.md §9 — 0 limits from the server, 0b the flaky live-match test, 1 Admin menu and Overview, 2 settings store and History, 3 presets, 4 Start a match, 5 League, 6 Screens and texts, 7 Technical, 8 Players and accounts. BACKLOG Part one and OPEN list it.

## Running

- Nothing.

## Open

- Building the admin area, piece by piece in the order of admin-area.md §9; piece 0 first.

## Needs the owner's word

- Nothing for the admin area.
