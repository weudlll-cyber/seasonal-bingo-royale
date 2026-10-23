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
- The image (`Dockerfile`) holds the server bundle, its npm dependencies and the built player client (relative paths, so one build serves at `/` or under any base path); `/admin` answers a placeholder until the admin app exists (WP-19). It runs as uid 10001 on a read-only root filesystem with `/tmp` in memory and one writable volume at `/data`. A production build registers no development route (quick sign-in, load accounts, Quick Test, fast test rules, bot fill, system-abort route). Settings: `SBR_BASE_PATH` (`/` or `/games/bingo/`; routes, `/healthz`, `/readyz`, the client and the WebSocket `…/ws` all live under it), `SBR_PUBLIC_URL` (its origin may open the WebSocket unless `SBR_ALLOWED_ORIGINS` says otherwise), `SBR_TRUSTED_PROXIES` (the proxy whose `X-Forwarded-For` is believed), `DATABASE_URL`, `SBR_SEED_KEY`.
- `/metrics` port is not proxied by Caddy.
- Optional Compose profiles: `observability` (Prometheus, Grafana, Loki), `mail` (Mailpit for staging).

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
git clone --branch feat/vps-install https://github.com/weudlll-cyber/seasonal-bingo-royale.git sbr
less sbr/ops/install.sh    # operator reviews it
sudo bash sbr/ops/install.sh [--type standalone|website]
```

Every answer is also a flag (`--env`, `--address`, `--email`, `--age-key`, `--smtp-*`, `--repo`, `--ref`, `--yes` for unattended runs, `--dry-run` to show every step without changing anything); `docs/operator-guide.md` walks through both types.

The script (idempotent, re-runnable):
1. Asks the install type first (standalone or website). Checks OS, CPU/RAM/disk; standalone: ports 80/443 free; website: finds the running website (compose project `seasonal-site`, its Caddy container) or stops with a plain message that the website must be installed first.
2. Installs Docker Engine + Compose plugin from Docker’s official repository if missing.
3. **Asks** for the environment name (`prod`/`staging`), the public address (standalone: domain or IP; website: taken from the website's `SITE_DOMAIN`), the admin e-mail, optional SMTP settings, and the operator’s `age` public key for backups.
4. Generates secrets with `openssl rand`, writes `/etc/sbr/<env>.env`.
5. Builds the app image on the server from a git ref (`--repo`, `--ref`; default the checkout's branch) — the only source until signed release images are published; then this step becomes: download `compose.yml` and `Caddyfile` for the chosen release, verify the image signature with cosign, pull images.
6. Runs `migrate`, then starts the stack, waits for `/readyz`.
7. The first admin is created with `sbr admin create-super` (password asked inside the app container, never echoed or logged; roles `super_admin` and `organizer`). The one-time **bootstrap token** and the page `https://<host>/admin/setup?token=…` where the first `super_admin` sets password and 2FA wait for the admin app (WP-19).
8. Installs the backup timer (systemd) and log rotation (5 × 10 MB per service); prints the next steps (website: the snippet and how to add it to the website's Caddyfile; firewall; how to pull backups).

With an IP address instead of a domain, Caddy uses its internal CA (`default_sni` set to the IP, since clients send no SNI to an IP) and the script warns that browsers will show a warning until a domain is set.

## 4. Operations CLI (`sbr`)

| Command | Does |
|---|---|
| `sbr status` | Containers, version, health, last backup |
| `sbr update <version>` | Verify signature, take a backup, pull, migrate, rolling restart (app down < 10 s; running realtime matches resume from the event log) |
| `sbr rollback` | Previous image + restore of the pre-update database dump (kept unencrypted, root only, in `/var/lib/sbr/<env>/`, replaced by the next update) if migrations changed the schema |
| `sbr backup` / `sbr restore <file>` | Manual backup / restore; an encrypted backup needs the operator's age key file (`--identity <file>`), which never stays on the server |
| `sbr logs [service]` | Follow logs |
| `sbr admin create-super` | Break-glass super admin (audited) |
| `sbr maintenance on|off` | A flag file in the app's data volume (`/data/maintenance`), read at most every 2 s: creating and starting matches answer 503 `MAINTENANCE`; running ones finish. The maintenance page in the client is still open. |

## 5. Bootstrap and first start

- Fresh database → migrations → seed (roles, permissions, patterns, default rulesets, settings v1, lobby room, first leaderboard period).
- `/admin/setup` is active only while no `super_admin` exists **and** a valid bootstrap token is presented (with the admin app, WP-19; until then `sbr admin create-super`).

## 6. Backups (operational detail of [03-security-architecture.md](03-security-architecture.md) §15)

- systemd timer 03:30 local: `pg_dump -Fc` + tar of uploads → `age -r <operator key>` → `/var/backups/sbr/<env>/sbr-<env>-<timestamp>.tar.age`; retention 14 daily, 8 weekly.
- Pull to the operator’s own computer: `ops/pull-backups.sh` (rsync over SSH) or `ops/pull-backups.ps1` (Windows, scp over the built-in OpenSSH), run by the operator on their machine; only files not there yet are copied. The operator holds the only private key.
- Optional WAL archiving profile for 15-minute RPO.
- Monthly restore drill: `sbr restore --drill <file>` restores into a temporary container and runs the smoke check.

## 7. Staging on the same VPS

- Separate Compose project, separate volumes and env file, separate subdomain, Caddy basic-auth.
- Resource limits keep staging from starving production (staging app 0.5 CPU / 512 MiB).

## 8. Self-hosted and cloud variants

| Variant | Notes |
|---|---|
| Any Linux server with Docker | Same install script. |
| Behind an existing reverse proxy (nginx, Traefik) | The website install type is this case for the Seasonal Entertainment website; for any other proxy the operator proxies `/` and `/ws` with WebSocket upgrade and sets `SBR_TRUSTED_PROXIES` (and `SBR_BASE_PATH` under a path). Example configs in `ops/examples/` (nginx, an existing Caddy). |
| Managed Postgres (cloud) | Set `DATABASE_URL`; disable the `postgres` service with the `external-db` profile. |
| Kubernetes (future) | `ops/k8s/` Helm chart planned at scale step 2: Deployment (app, HPA on CPU), Job (migrate), Ingress with WebSocket support, Secret from external secret store, Redis, managed Postgres, S3-compatible bucket for uploads. The image and env contract are already identical, so no app change is needed beyond the Redis adapters. |

## 9. Hardening checklist for the operator (in `docs/operator-guide.md`)

- SSH keys only, root login off, `unattended-upgrades` on, `ufw` allowing 22/80/443 only, fail2ban for SSH.
- Docker daemon: `live-restore`, `userns-remap` optional, log rotation.
- Domain: CAA record for the ACME CA, DNSSEC if the registrar supports it.
- Optional: Cloudflare (proxy) in front for DDoS absorption; then `SBR_TRUSTED_PROXIES` = Cloudflare ranges.
