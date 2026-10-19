# Brand Assets — Manifest

Source assets. Build steps copy optimized versions into the apps; files here are never edited in place.

> **Licence note:** the Seasonal Tokens logo and season icons belong to the Seasonal Tokens project. They must not be shipped in a public, downloadable repository (decided 2026-10-19). This repository is therefore private. Before the repository or a release image is ever made public, `assets/seasons/`, `assets/brand/logo.svg` and `assets/fonts/` have to be removed from it, and the build must fall back to neutral placeholders that every operator replaces in the admin panel (Appearance → Branding).

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
