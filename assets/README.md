# Brand Assets — Manifest

Source assets. Build steps copy optimized versions into the apps; files here are never edited in place.

> **Licence note:** the Seasonal Tokens logo, season icons and the Luxora Grotesk font belong to the Seasonal Tokens project. This repository was made public on 2026-10-19 with these files included; the same files are already public in the Seasonal Entertainment website repository. They are not covered by this repository's AGPL licence. Operators can replace the branding in the admin panel (Appearance → Branding).

## Received (2026-10-19, copied from the Seasonal Entertainment website repository)

| File | Origin in the website repo | Used for |
|---|---|---|
| `seasons/source/*.svg` | `client/src/assets/seasons/source/` (originals) | Source for re-exports; the optimized icons the game shows are the shared kit's (`@seasonal/kit/seasons.css`, the same files) |
| `brand/logo.svg` | `client/src/assets/seasonal-tokens.svg` | Source for the app icon until one is supplied (no longer in the top bar) |
| `brand/colors.md` | `client/src/styles/tokens.css` | The four season colours |

## Received (2026-10-21)

| File | Origin in the website repo | Size | Used for |
|---|---|---|---|
| `brand/emblem.webp` | `client/public/brand/emblem.webp` (the round Seasonal Entertainment emblem without lettering, made by the website's `scripts/build-brand-images.mjs`) | 420 × 374 px, 52 KB, WebP with transparency | The top bar of the player client, beside the "Seasonal Bingo Royale" wordmark |

## Still missing (optional)

| Slot | Format | Notes |
|---|---|---|
| App icon | PNG 512×512, square | Until supplied, generated from `brand/logo.svg` |
| Sounds | OGG | draw, mark, pattern, season, season-complete, cut, win; the game ships silent until supplied |

The Luxora Grotesk faces (book, regular, bold, italic, light italic: all UI text, Book for body, Bold for headings) come from the shared kit since 2026-11-22: `@seasonal/kit/fonts.css` and its `fonts/`, the same files the website and this folder had (docs/concepts/kit-adoption.md §2, B1).
