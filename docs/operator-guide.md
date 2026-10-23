# Operator guide — installing and running Seasonal Bingo Royale on a VPS

Two ways to install, chosen by the installer's first question:

- **Standalone** — the game on its own domain (e.g. `bingo.example.org`) with its own HTTPS.
- **Website** — the game inside the Seasonal Entertainment website on the same server, at `https://<website domain>/games/bingo/`, behind the website's own proxy.

There is no signed release image yet, so the installer builds the game on the server from the source code (a few minutes). Commands in grey boxes are typed exactly as shown; `<…>` is replaced by your value.

## 1. What to prepare (both types)

1. **A VPS** with Ubuntu 24.04. Good size: 4 CPU, 8 GB RAM, 100 GB disk (about 200 players at once with room to spare). Smallest that works: 2 CPU, 4 GB RAM, 20 GB free disk.
2. **An SSH key** on your Windows PC (skip if you have one). In PowerShell:
   ```
   ssh-keygen -t ed25519
   ```
   Press Enter for the default file. When you order the VPS, give the provider the content of `C:\Users\<you>\.ssh\id_ed25519.pub` as your SSH key (or, later, add that line to `/root/.ssh/authorized_keys` on the server).
3. **An age key for the backups.** Backups are encrypted so that only you can open them. In PowerShell:
   ```
   winget install FiloSottile.age
   age-keygen -o $HOME\sbr-age-key.txt
   ```
   It prints a line `Public key: age1…` — the installer asks for that public key. **Keep `sbr-age-key.txt` safe and never put it on the server permanently**: without it no backup can be opened; with it anyone can.
4. **Standalone only: a domain** (e.g. `bingo.example.org`) with an **A record** pointing at the VPS's IPv4 address (and an AAAA record for IPv6 if the VPS has one). Set it before installing; HTTPS certificates come automatically once the name points at the server. Without a domain you can install on the bare IP address, but browsers then warn about the certificate.
5. **Website only:** the Seasonal Entertainment website must already run on this VPS (its `docs/DEPLOYMENT.md`).

## 2. Install — standalone

1. Log in to the VPS from PowerShell:
   ```
   ssh root@<VPS address>
   ```
2. Fetch the installer and run it (the one install command):
   ```
   git clone --branch feat/vps-install https://github.com/weudlll-cyber/seasonal-bingo-royale.git sbr && sudo bash sbr/ops/install.sh
   ```
3. Answer the questions: **standalone**; environment **prod**; your **domain** (or the IP address); your **e-mail** (for certificates); your **age public key** (`age1…`); SMTP can stay empty for now.
4. Wait until it says **Done**. It installs Docker if needed, builds the game, starts it and checks that it answers.
5. Create the first admin (section 4), then open `https://<your domain>/`.

## 3. Install — inside the Seasonal Entertainment website

1. Log in to the VPS (`ssh root@<VPS address>`).
2. Run the same command as above, but choose **website** as the type (or add `--type website`):
   ```
   git clone --branch feat/vps-install https://github.com/weudlll-cyber/seasonal-bingo-royale.git sbr && sudo bash sbr/ops/install.sh --type website
   ```
   If the website is not running, the installer stops and says so — install the website first.
3. Answer the questions (environment, e-mail, age public key). The installer finds the website's domain itself and publishes no port of its own.
4. **Add bingo to the website's Caddy** — the installer prints these steps at the end; once, in the website's checkout on the same server:
   1. Create the folder `deploy/site/routes/` and copy `/opt/sbr/website-bingo.caddy` into it as `bingo.caddy`.
   2. In `deploy/site/Caddyfile`, inside the `{$SITE_DOMAIN} { … }` block, add the line `import /etc/caddy/routes/*.caddy`.
   3. In `deploy/site/docker-compose.yml`, give the `caddy` service the volume `- ./routes:/etc/caddy/routes:ro`.
   4. Apply it: `cd <website checkout>/deploy/site && docker compose up -d caddy`.
5. Create the first admin (section 4), then open `https://<website domain>/games/bingo/`.
6. Players use the game's own accounts for now; the shared website login comes later.

## 4. Create the first admin

```
sudo sbr admin create-super
```

It asks for e-mail, display name (3–24 letters or digits) and a password of at least 12 characters (not shown while you type). This account can host matches. (A proper admin area with two-factor login comes with a later version.)

## 5. Backups to your Windows PC

The server makes an encrypted backup every night at 03:30 in `/var/backups/sbr/prod/` and keeps 14 daily and 8 weekly ones.

1. Pull the new ones to your PC (only files you do not have yet are copied), in PowerShell from the folder with the game's source (or copy `ops\pull-backups.ps1` anywhere):
   ```
   powershell -ExecutionPolicy Bypass -File ops\pull-backups.ps1 -Server root@<VPS address>
   ```
   They land in `Documents\sbr-backups\prod`. (Optional: run it daily with Windows Task Scheduler.)
2. A backup taken right now: `sudo sbr backup`.
3. Check a backup can really be restored (monthly is good): copy your key up for a moment, run the drill, delete the key:
   ```
   scp $HOME\sbr-age-key.txt root@<VPS address>:/root/sbr-age-key.txt
   ssh root@<VPS address> "sbr restore --drill /var/backups/sbr/prod/<file> --identity /root/sbr-age-key.txt; rm /root/sbr-age-key.txt"
   ```
   It restores into a throw-away database and says how many accounts, matches and events came back.
4. A real restore (replaces the live data): the same, with `sbr restore <file> --identity …` instead of `--drill`.

## 6. Updating and rolling back

1. Update to a newer version of the source (a branch, tag or commit):
   ```
   sudo sbr update <git ref>
   ```
   It first takes a backup, then builds and starts the new version (the game is away for a few seconds; running matches continue).
2. Something wrong after an update?
   ```
   sudo sbr rollback
   ```
   It goes back to the version before; if the update changed the database layout, it also puts back the database from just before the update.
3. Before a planned update you can stop new matches: `sudo sbr maintenance on` (running matches finish), and afterwards `sudo sbr maintenance off`.
4. Everyday checks: `sudo sbr status` (what runs, health, last backup) and `sudo sbr logs app`.

## 7. Hardening checklist

1. SSH: keys only, no passwords; root login with password off (`PasswordAuthentication no`, `PermitRootLogin prohibit-password` in `/etc/ssh/sshd_config`).
2. Automatic security updates: `apt install unattended-upgrades` (on by default on Ubuntu 24.04).
3. Firewall: allow only 22, 80 and 443 — `ufw allow 22/tcp; ufw allow 80/tcp; ufw allow 443/tcp; ufw enable`. (With the website installed, keep the website's own ports too, see its DEPLOYMENT.md.)
4. fail2ban for SSH: `apt install fail2ban`.
5. Docker: `live-restore` on (`/etc/docker/daemon.json`: `{ "live-restore": true }`); log rotation is already set by the game.
6. Domain: a CAA record allowing your certificate authority (Let's Encrypt: `0 issue "letsencrypt.org"`), and DNSSEC if your registrar offers it.
7. Optional: Cloudflare in front for DDoS protection; then the game must trust Cloudflare's addresses (`SBR_TRUSTED_PROXIES` in `/etc/sbr/prod.env`).

## 8. Good to know

- Settings and secrets live in `/etc/sbr/prod.env` (readable by root only). Running the installer again keeps the secrets and changes only what you changed; it never switches between standalone and website without asking.
- Behind another proxy (nginx, your own Caddy): examples in `ops/examples/`.
- Not there yet: a signed release image (the server builds from source), the admin area with two-factor login and its setup page, e-mail sending, the shared website login, a maintenance page for players (maintenance already stops new matches).
