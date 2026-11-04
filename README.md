# Seasonal Bingo Royale

Multiplayer Bingo with battle-royale elimination and the four Seasonal Tokens seasons as a core mechanic. Realtime and asynchronous play, standalone or embedded in a host website.

**Status:** specification complete; on master: the Quick Test, a first draft of the real game (with "Verify this match" and the recap between royale rounds), leaderboards and profiles (WP-15), the asynchronous royale (WP-14), several matches at once with "My matches", the website login for installs inside the Seasonal Entertainment website (D37, D40–D43), a one-command VPS installer with encrypted backups, resource limits, updates, rollback and uninstall, the 200-player load check, and the fixes of the audits of 2026-10-23, 2026-10-31 and 2026-11-04.

Quick start: Node 22+ and pnpm, then `pnpm install` and `pnpm verify`. Details: [CONTRIBUTING.md](CONTRIBUTING.md).

- Install on a VPS (standalone or inside the Seasonal Entertainment website): [docs/operator-guide.md](docs/operator-guide.md)
- Specification: [docs/spec/README.md](docs/spec/README.md)
- Open items: [docs/OPEN.md](docs/OPEN.md) · full list: [docs/BACKLOG.md](docs/BACKLOG.md)
- Brand assets: [assets/README.md](assets/README.md)
- Working rules for Claude Code: [CLAUDE.md](CLAUDE.md) · unattended runs on the development machine (not for servers): [docs/NIGHT-RUN.md](docs/NIGHT-RUN.md)

No prizes of monetary value exist in this game — players compete for placements and leaderboard rank.

## License

Copyright (C) 2026 weudlll-cyber. Licensed under the GNU Affero General Public License v3.0 or later ([LICENSE](LICENSE)). The Seasonal Tokens icons, logo and font come from the Seasonal Entertainment website project ([assets/README.md](assets/README.md)).
