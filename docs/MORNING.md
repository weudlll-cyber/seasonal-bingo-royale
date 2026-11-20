# Morning sheet

What the night of 2026-11-20 (the admin-area concept, branch `docs/admin-concept`) did, what runs, what is open and what needs the owner's word. Regenerated after every finished piece. Documentation and mockups only: no product code changed.

## Done

- 1 — Inventory: [docs/concepts/admin-values.md](concepts/admin-values.md), 524 fixed values in four parts (rulesets and contracts 195, game engine 56, server 180, player client 93); per role: organizer per match 27, admin 229, server only 105, stays fixed 163. Seven open points found while listing.

- 2 — Concept: [docs/concepts/admin-area.md](concepts/admin-area.md) — the Organizer and Admin roles on the seeded roles (standalone and website), the Organizer's three-step "Start a match", seven Admin sections, what stays on the server, versions and undo on `settings_versions`, 13 differences from spec 11 and 15. PR #54 (open, not merged).

## Running

- 3 — Mockups and screenshots.

## Needs the owner's word

All in admin-area.md §8, each with the proposal the concept assumes and the alternative:

- (a) admin area inside the game ("Admin" menu item) — or the separate admin app of spec 02 §3;
- (b) changed values apply to matches created afterwards — or immediately;
- (c) technical values in a separate, warned section — or server only;
- (d) building starts after the move (D58) — or before;
- (e) the Technical section in website mode (no super admin there) — shown to website admins, or server only;
- (f) `security_admin` folded into `super_admin`, `moderator` dormant — or both kept;
- (g) the Organizer picks a preset and changes only title, start, size, speed — or also the preset's rules;
- (h) speed in words (relaxed / normal / quick) — or seconds;
- (i) client screen values as settings — or fixed in code;
- (j) no simulator and pattern editor in the first build — or with the presets;
- (k) undo changes settings for later matches only — listed for the record;
- (l) "stays fixed" values never become settings — or the owner names some;
- (m) client copies of server limits read from the server — or stay fixed;
- (n) the "within 24 hours" text follows the setting — or the window stays fixed;
- (o) bots stay development only — or a per-preset "bots allowed";
- (p) values read at server start become settings — or stay environment values;
- (q) development tools stay out of the admin area — or a hidden section.
