# 09 — Deployment Architecture

> Part of the Seasonal Bingo Royale specification. Index: [README](README.md).

## 1. Target: single VPS with Docker Compose (v1)

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
- **On the Seasonal Entertainment website** the game is not a separate site: the website’s reverse proxy forwards `/games/bingo/` (HTTP and WebSocket) to the bingo app, which runs with `SBR_BASE_PATH=/games/bingo` and without its own Caddy (`--no-caddy`, §8). Both apps can share one VPS; they keep separate databases and containers.
- The image (`Dockerfile`) holds the server bundle, its npm dependencies and the built player client (relative paths, so one build serves at `/` or under any base path); `/admin` answers a placeholder until the admin app exists (WP-19). It runs as uid 10001 on a read-only root filesystem with `/tmp` in memory and one writable volume at `/data`. A production build registers no development route (quick sign-in, load accounts, Quick Test, fast test rules, bot fill, system-abort route). Settings: `SBR_BASE_PATH` (`/` or `/games/bingo/`; routes, `/healthz`, `/readyz`, the client and the WebSocket `…/ws` all live under it), `SBR_PUBLIC_URL` (its origin may open the WebSocket unless `SBR_ALLOWED_ORIGINS` says otherwise), `SBR_TRUSTED_PROXIES` (the proxy whose `X-Forwarded-For` is believed), `DATABASE_URL`, `SBR_SEED_KEY`.
- `/metrics` port is not proxied by Caddy.
- Optional Compose profiles: `observability` (Prometheus, Grafana, Loki), `mail` (Mailpit for staging).

## 2. Files on the server

```
/opt/sbr/                     install root (owned by root)
  sbr                         CLI wrapper script
  compose.yml                 pinned image digests
  Caddyfile
/etc/sbr/prod.env             secrets + public URL (0600)
/etc/sbr/staging.env
/var/lib/docker/volumes/…     pgdata, uploads (per env)
/var/backups/sbr/<env>/       encrypted backups
```

## 3. One-command install

```
curl -fsSL https://raw.githubusercontent.com/<org>/seasonal-bingo-royale/<tag>/ops/install.sh -o install.sh
less install.sh            # operator reviews it
sudo bash install.sh
```

The script (idempotent, re-runnable):
1. Checks OS, CPU/RAM/disk, open ports 80/443.
2. Installs Docker Engine + Compose plugin from Docker’s official repository if missing.
3. **Asks** for the public address (domain or IP), the environment name (`prod`/`staging`), the admin e-mail, optional SMTP settings, and the operator’s `age` public key for backups.
4. Generates secrets with `openssl rand`, writes `/etc/sbr/<env>.env`.
5. Downloads `compose.yml` and `Caddyfile` for the chosen release, verifies the image signature with cosign, pulls images.
6. Runs `migrate`, then starts the stack, waits for `/readyz`.
7. Creates a one-time **bootstrap token** (valid 1 h) and prints the URL `https://<host>/admin/setup?token=…` where the first `super_admin` sets password and 2FA. Token is single-use and only shown in the terminal.
8. Installs the backup timer (systemd) and log rotation; prints the next steps (DNS, firewall, how to pull backups).

With an IP address instead of a domain, Caddy uses an internal CA / self-signed certificate and the script warns that browsers will show a warning until a domain is set.

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
- `/admin/setup` is active only while no `super_admin` exists **and** a valid bootstrap token is presented.

## 6. Backups (operational detail of [03-security-architecture.md](03-security-architecture.md) §15)

- systemd timer 03:30 local: `pg_dump -Fc` + tar of uploads → `age -r <operator key>` → `/var/backups/sbr/<env>/sbr-<env>-<timestamp>.tar.age`; retention 14 daily, 8 weekly.
- Pull to the operator’s own computer: `ops/pull-backups.sh` (rsync over SSH, run by the operator on their machine; Windows variant via `scp` in PowerShell documented). The operator holds the only private key.
- Optional WAL archiving profile for 15-minute RPO.
- Monthly restore drill: `sbr restore --drill <file>` restores into a temporary container and runs the smoke check.

## 7. Staging on the same VPS

- Separate Compose project, separate volumes and env file, separate subdomain, Caddy basic-auth.
- Resource limits keep staging from starving production (staging app 0.5 CPU / 512 MiB).

## 8. Self-hosted and cloud variants

| Variant | Notes |
|---|---|
| Any Linux server with Docker | Same install script. |
| Behind an existing reverse proxy (nginx, Traefik) | `--no-caddy` flag; operator proxies `/` and `/ws` with WebSocket upgrade and sets `SBR_TRUSTED_PROXIES`. Example configs in `ops/examples/`. |
| Managed Postgres (cloud) | Set `DATABASE_URL`; disable the `postgres` service with the `external-db` profile. |
| Kubernetes (future) | `ops/k8s/` Helm chart planned at scale step 2: Deployment (app, HPA on CPU), Job (migrate), Ingress with WebSocket support, Secret from external secret store, Redis, managed Postgres, S3-compatible bucket for uploads. The image and env contract are already identical, so no app change is needed beyond the Redis adapters. |

## 9. Hardening checklist for the operator (in `docs/operator-guide.md`)

- SSH keys only, root login off, `unattended-upgrades` on, `ufw` allowing 22/80/443 only, fail2ban for SSH.
- Docker daemon: `live-restore`, `userns-remap` optional, log rotation.
- Domain: CAA record for the ACME CA, DNSSEC if the registrar supports it.
- Optional: Cloudflare (proxy) in front for DDoS absorption; then `SBR_TRUSTED_PROXIES` = Cloudflare ranges.
