# Brand Assets — Manifest

Source assets. Build steps copy optimized versions into the apps; files here are never edited in place.

> **Licence note:** the Seasonal Tokens logo, season icons and the Luxora Grotesk font belong to the Seasonal Tokens project. This repository was made public on 2026-10-19 with these files included; the same files are already public in the Seasonal Entertainment website repository. They are not covered by this repository's AGPL licence. Operators can replace the branding in the admin panel (Appearance → Branding).

## Received (2026-10-19, copied from the Seasonal Entertainment website repository)

| File | Origin in the website repo | Used for |
|---|---|---|
| `seasons/spring.svg`, `summer.svg`, `autumn.svg`, `winter.svg` | `client/src/assets/seasons/` (optimized) | Season cells, effect badges, announcements |
| `seasons/source/*.svg` | `client/src/assets/seasons/source/` (originals) | Source for re-exports |
| `brand/logo.svg` | `client/src/assets/seasonal-tokens.svg` | Lobby header, loading screen |
| `brand/colors.md` | `client/src/styles/tokens.css` | The four season colours |
| `fonts/luxora-grotesk-*.woff2` (book, regular, bold, heavy, italic, light italic) | `client/src/assets/fonts/` | All UI text |

## Still missing (optional)

| Slot | Format | Notes |
|---|---|---|
| App icon | PNG 512×512, square | Until supplied, generated from `brand/logo.svg` |
| Sounds | OGG | draw, mark, pattern, season, season-complete, cut, win; the game ships silent until supplied |
