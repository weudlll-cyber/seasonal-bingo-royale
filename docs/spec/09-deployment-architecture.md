# 09 — Deployment Architecture

> Part of the Seasonal Bingo Royale specification. Index: [README](README.md).

## 1. Target: single VPS with Docker Compose (v1)

The installer offers two install types (decided 2026-10-23): **standalone** — own domain, own HTTPS through the game's own Caddy, base path `/`; or **integrated into the Seasonal Entertainment website** on the same server — no Caddy of its own and no published port, the app joins the website's Docker network and the website's Caddy forwards `/games/bingo/*` (HTTP and WebSocket) to it, `SBR_BASE_PATH=/games/bingo/`, `SBR_PUBLIC_URL=https://<website domain>/games/bingo/`, `SBR_TRUSTED_PROXIES` = that one Caddy. Re-running the installer never switches the type without confirmation; `sbr status` shows it.

Reference host: 4 vCPU, 8 GB RAM, 100 GB SSD, Ubuntu 24.04 LTS (e.g. the owner’s Contabo VPS). Sized for ~200 concurrent players with large headroom; minimum 2 vCPU / 4 GB.

```
                Internet :443 / :80
                       │
              ┌────────▼────────┐
              │  caddy           │  TLS (ACME), HTTP/3, headers, rate/conn limits,
              │                  │  /            → web (static from app)
              │                  │  /admin       → admin (static from app)
              │                  │  /api, /ws    → app:3000
              └────────┬────────┘
       network: edge   │
              ┌────────▼────────┐        ┌───────────────┐
              │  app (server)    ├───────►  postgres 17   │  network: data (internal)
              │  :3000, :9464    │        │  volume pgdata │
              └────────┬────────┘        └───────────────┘
                       │ volume uploads
              ┌────────▼────────┐
              │  backup (cron)   │ pg_dump + uploads → age → /var/backups/sbr
              └─────────────────┘
```

- The app serves the built player and admin bundles itself (one image, no second web server), Caddy only proxies. Same principle the owner chose for the race project (simplest delivery).
- Postgres is on an internal-only network; no published port.
- **On the Seasonal Entertainment website** the game is not a separate site: the website’s reverse proxy forwards `/games/bingo/` (HTTP and WebSocket) to the bingo app, which runs with `SBR_BASE_PATH=/games/bingo` and without its own Caddy (the installer's website type, §3). Both apps can share one VPS; they keep separate databases and containers.
- The image (`Dockerfile`) holds the server bundle, its npm dependencies and the built player client (relative paths, so one build serves at `/` or under any base path); `/admin` answers a placeholder until the admin app exists (WP-19). It runs as uid 10001 on a read-only root filesystem with `/tmp` in memory and one writable volume at `/data`. A production build registers no development route (quick sign-in, load accounts, Quick Test, fast test rules, bot fill, system-abort route). The development code itself stays out of the shipped bundles: the server build replaces `src/dev/*` and the Quick Test and dev sign-in routes with a stub (`apps/server/build.mjs`), and the client loads the Quick Test and the dev sign-in menu only behind Vite's DEV flag; `apps/server/test/productionBundle.test.ts` builds both and fails on any development marker. Settings: `SBR_BASE_PATH` (`/` or `/games/bingo/`; routes, `/healthz`, `/readyz`, the client and the WebSocket `…/ws` all live under it), `SBR_PUBLIC_URL` (its origin may open the WebSocket unless `SBR_ALLOWED_ORIGINS` says otherwise), `SBR_TRUSTED_PROXIES` (the proxy whose `X-Forwarded-For` is believed), `DATABASE_URL`, `SBR_SEED_KEY`.
- `/metrics` is never reachable from outside: the app answers 404 to any request that came through a proxy (`X-Forwarded-For`), and the standalone Caddyfile and the website snippet answer 404 for the path themselves.
- Optional Compose profiles (planned, not in `ops/compose.yml` yet): `observability` (Prometheus, Grafana, Loki), `mail` (Mailpit for staging). Built: `standalone` (Caddy).

## 2. Files on the server

```
/opt/sbr/                     install root (owned by root)
  sbr, lib/                   CLI and its shell library (/usr/local/bin/sbr links here)
  compose.yml                 the stack (app, postgres; caddy for standalone)
  compose.website.yml         website installs: the app on the website's network
  caddy/Caddyfile             standalone (the folder is mounted, so `caddy reload` sees changes)
  website-bingo.caddy         website installs: the route for the website's Caddyfile
  src/                        git checkout the image is built from (until release images exist)
/etc/sbr/install.conf         install type, environment, address, repository and ref
/etc/sbr/prod.env             secrets + public URL (0600)
/etc/sbr/staging.env
/var/lib/docker/volumes/…     pgdata, uploads (per env)
/var/backups/sbr/<env>/       encrypted backups
```

## 3. One-command install

```
git clone https://github.com/weudlll-cyber/seasonal-bingo-royale.git sbr
less sbr/ops/install.sh    # operator reviews it
sudo bash sbr/ops/install.sh [--type standalone|website]
```

Every answer is also a flag (`--env`, `--address`, `--email`, `--age-key`, `--smtp-host/-port/-user/-from`, `--smtp-password-file <file|->` — a password never goes on the command line —, `--repo`, `--ref`, `--yes` for unattended runs, `--dry-run` to show every step without changing anything, not even a git fetch); `docs/operator-guide.md` walks through both types. A re-run keeps the earlier answers (read back from `/etc/sbr/<env>.env`, also with `--yes`); an empty SMTP answer keeps the saved value. Values in the env file are single-quoted, so Compose takes them literally. The default ref is `master` (the installer works from `master` once the audit branch is merged).

The script (idempotent, re-runnable):
1. Asks the install type first (standalone or website). Checks OS, CPU/RAM/disk; standalone: ports 80/443 free; website: finds the running website (compose project `seasonal-site`, its Caddy container) or stops with a plain message that the website must be installed first.
2. Installs Docker Engine + Compose plugin from Docker’s official repository if missing.
3. **Asks** for the environment name (`prod`/`staging`), the public address (standalone: domain or IP; website: taken from the website's `SITE_DOMAIN`), the admin e-mail, optional SMTP settings, and the operator’s `age` public key for backups.
4. Generates secrets with `openssl rand`, writes `/etc/sbr/<env>.env` (atomically: written beside it and renamed).
5. Builds the app image on the server from a git ref (`--repo`, `--ref`; default: the last install's, else `master`; a changed `--repo` replaces the checkout's origin) — the only source until signed release images are published; then this step becomes: download `compose.yml` and `Caddyfile` for the chosen release, verify the image signature with cosign, pull images.
6. Starts the stack and waits for `/readyz`; there is no separate migrate step: the app applies pending migrations on start (checksummed, `apps/server/src/db/migrator.ts`) and does not answer ready before.
7. The first admin is created with `sbr admin create-super` (password asked inside the app container, never echoed or logged; roles `super_admin` and `organizer`). The one-time **bootstrap token** and the page `https://<host>/admin/setup?token=…` where the first `super_admin` sets password and 2FA wait for the admin app (WP-19).
8. Installs the backup timer (systemd); log rotation is the Compose file's (Docker `local` driver, 5 × 20 MB per service, spec 08 §6); prints the next steps (website: the snippet and how to add it to the website's Caddyfile; firewall; how to pull backups).

With an IP address instead of a domain, Caddy uses its internal CA (`default_sni` set to the IP, since clients send no SNI to an IP) and the script warns that browsers will show a warning until a domain is set.

## 4. Operations CLI (`sbr`)

| Command | Does |
|---|---|
| `sbr status` | Containers, version, health, last backup |
| `sbr update <version>` | Planned with release images: verify signature, take a backup, pull, migrate, rolling restart (app down < 10 s; running realtime matches resume from the event log). Built today: `sbr update <git ref>` takes a backup and a plain pre-update dump, builds the image from the ref on the server, restarts (the app migrates on start) and prunes images nothing uses |
| `sbr confirm` | The update works: deletes the plain pre-update dump and the rollback data; app images no environment uses or can roll back to are pruned |
| `sbr rollback` | Takes a backup of the current state, asks (`--yes` skips it), sets the previous image and ref back and, if migrations changed the schema, empties the schema (`DROP SCHEMA sbr CASCADE`) and restores the pre-update dump in one transaction that stops at the first error (dump kept unencrypted, root only, in `/var/lib/sbr/<env>/`, written whole or not at all, deleted by `sbr confirm` or the rollback). Data written since the update is then lost, except in the backup taken first |
| `sbr backup` / `sbr restore <file>` | Manual backup / restore; an encrypted backup needs the operator's age key file (`--identity <file>`), which never stays on the server. A restore asks first and refuses another environment's backup (by file name) unless `--force-env`; database restore as in `sbr rollback` |
| `sbr logs [service]` | Follow logs |
| `sbr admin create-super` | Break-glass super admin; the audit entry follows with the `audit_log` table (WP-19), not written yet |
| `sbr maintenance on ["reason"]|off` | A flag file in the app's data volume (`/data/maintenance`), read at most every 2 s; its text (at most 200 characters) is the reason. Creating and starting matches answer 503 `MAINTENANCE` with the reason; nothing starts by itself (no automatic start at a set time, no start when full: the match waits in its lobby and starts within 5 s of `sbr maintenance off`, D22); running ones play to the end. `GET /api/v1/maintenance` answers `{ on, reason }`; the client asks on load and every 30 s, shows "Maintenance — we'll be back shortly" with the reason instead of the lobby and the create form, and a banner above the host console. Match screens stay as they are, and sign-in stays reachable so admins can sign in (decided 2026-10-26). |

## 5. Bootstrap and first start

- Fresh database → migrations → seed (roles, permissions, patterns, default rulesets, settings v1, lobby room, first leaderboard period).
- `/admin/setup` is active only while no `super_admin` exists **and** a valid bootstrap token is presented (with the admin app, WP-19; until then `sbr admin create-super`).

## 6. Backups (operational detail of [03-security-architecture.md](03-security-architecture.md) §15)

- systemd timer `sbr-backup@<env>.timer` at 03:30 local runs `sbr --env <env> backup`: `pg_dump -Fc` + tar of the uploads volume (read by a helper container) → `age -r <operator key>` → `/var/backups/sbr/<env>/sbr-<env>-<timestamp>.tar.age`, written as `.partial` and renamed when complete; the plain dump lives in a work folder removed on exit, also after an error, and any failing step fails the run. Retention: the 14 newest, plus the newest of each of the 8 weeks before them. Folders 0750 and files 0640, group `sbr-backup`.
- Pull to the operator’s own computer: `ops/pull-backups.sh` (Linux and macOS, rsync over SSH: each file under a temporary name, renamed when complete) or `ops/pull-backups.ps1` (Windows, scp over the built-in OpenSSH: each file to `<name>.part`, size-checked against the server, then renamed), run by the operator on their machine as a user in the group `sbr-backup` (no root login); only files not there yet are copied; no backup yet is a plain message. The operator holds the only private key.
- Optional WAL archiving profile for 15-minute RPO (planned).
- Monthly restore drill: `sbr restore --drill <file>` restores into a temporary container (removed on exit; readiness wait capped at 60 s) and counts migrations, accounts, matches and events.

## 7. Staging on the same VPS (planned)

- Planned: separate Compose project, separate volumes and env file, separate subdomain, Caddy basic-auth; resource limits keep staging from starving production (staging app 0.5 CPU / 512 MiB).
- **Today: one environment per server.** Compose project, volumes, env file and backup timer are already per environment, but a standalone staging would need ports 80/443 held by prod's Caddy, a website staging the same `/games/bingo` route and snippet, and the install record holds one environment. The installer refuses a second environment on a server; staging runs on its own VPS.

## 8. Self-hosted and cloud variants

| Variant | Notes |
|---|---|
| Any Linux server with Docker | Same install script. |
| Behind an existing reverse proxy (nginx, Traefik) | The website install type is this case for the Seasonal Entertainment website; for any other proxy the operator proxies `/` and `/ws` with WebSocket upgrade and sets `SBR_TRUSTED_PROXIES` (and `SBR_BASE_PATH` under a path). Example configs in `ops/examples/` (nginx, an existing Caddy). |
| Managed Postgres (cloud) | Planned: set `DATABASE_URL` and disable the `postgres` service with an `external-db` profile (not in `ops/compose.yml` yet). |
| Kubernetes (future) | `ops/k8s/` Helm chart planned at scale step 2: Deployment (app, HPA on CPU), Job (migrate), Ingress with WebSocket support, Secret from external secret store, Redis, managed Postgres, S3-compatible bucket for uploads. The image and env contract are already identical, so no app change is needed beyond the Redis adapters. |

## 9. Hardening checklist for the operator (in `docs/operator-guide.md`)

- SSH keys only, root login off (`PermitRootLogin no`; the operator works with `sudo` and pulls backups as a user in the group `sbr-backup`), `unattended-upgrades` on, `ufw` allowing 22/80/443 only, fail2ban for SSH.
- Docker daemon: `live-restore`, `userns-remap` optional, log rotation.
- Domain: CAA record for the ACME CA, DNSSEC if the registrar supports it.
- Optional: Cloudflare (proxy) in front for DDoS absorption; then `SBR_TRUSTED_PROXIES` = Cloudflare ranges.
