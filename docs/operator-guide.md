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
   git clone https://github.com/weudlll-cyber/seasonal-bingo-royale.git sbr && sudo bash sbr/ops/install.sh
   ```
   (`master` holds the installer once the current work is merged into it; until then add `--ref <branch>` after `install.sh` and clone that branch.)
3. Answer the questions: **standalone**; environment **prod**; your **domain** (or the IP address); your **e-mail** (for certificates); your **age public key** (`age1…`); SMTP can stay empty for now. For an unattended run every answer is a flag (top of `ops/install.sh`); the SMTP password then comes from a file, `--smtp-password-file <file>` (or `-` to pipe it in), never from the command line.
4. Wait until it says **Done**. It installs Docker if needed, builds the game, starts it and checks that it answers.
5. Create the first admin (section 4), then open `https://<your domain>/`.

## 3. Install — inside the Seasonal Entertainment website

1. Log in to the VPS (`ssh root@<VPS address>`).
2. Run the same command as above, but choose **website** as the type (or add `--type website`):
   ```
   git clone https://github.com/weudlll-cyber/seasonal-bingo-royale.git sbr && sudo bash sbr/ops/install.sh --type website
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

The server makes an encrypted backup every night at 03:30 in `/var/backups/sbr/prod/` and keeps the 14 newest plus one a week for 8 more weeks. A backup holds the database, the uploaded files and the game's seed key (`SBR_SEED_KEY`, which locks the stored match secrets: without it a restored database cannot be opened), all encrypted with your age key. The files belong to the group `sbr-backup`, so a normal user can pull them; root login over SSH can stay off. If the nightly backup fails, `sudo sbr status` says so (until the next good backup) and the system log has the error (`journalctl -u sbr-backup@prod`).

1. Once, on the server: a user for pulling, in the group `sbr-backup`, with your SSH key:
   ```
   sudo adduser --disabled-password --gecos "" backup-pull
   sudo usermod -aG sbr-backup backup-pull
   sudo install -d -m 700 -o backup-pull -g backup-pull /home/backup-pull/.ssh
   sudo cp ~/.ssh/authorized_keys /home/backup-pull/.ssh/ && sudo chown backup-pull: /home/backup-pull/.ssh/authorized_keys
   ```
2. Pull the new ones to your PC (only files you do not have yet are copied; a copy counts only when it is complete), in PowerShell from the folder with the game's source (or copy `ops\pull-backups.ps1` anywhere):
   ```
   powershell -ExecutionPolicy Bypass -File ops\pull-backups.ps1 -Server backup-pull@<VPS address>
   ```
   They land in `Documents\sbr-backups\prod`. (Optional: run it daily with Windows Task Scheduler.)
3. A backup taken right now: `sudo sbr backup`.
4. Check a backup can really be restored (monthly is good): copy your key up for a moment, run the drill, delete the key:
   ```
   scp $HOME\sbr-age-key.txt <you>@<VPS address>:sbr-age-key.txt
   ssh -t <you>@<VPS address> "sudo sbr restore --drill /var/backups/sbr/prod/<file> --identity sbr-age-key.txt; rm sbr-age-key.txt"
   ```
   It restores into a throw-away database, says how many accounts, matches and events came back, and checks that the backup's seed key opens a stored match (it fails if not; a backup made before backups carried the key fails too, take a new one).
5. A real restore (replaces the live data; it asks first): the same, with `sbr restore <file> --identity …` instead of `--drill`. It refuses a backup of another environment (a staging file on prod), or one whose seed key differs from the server's, unless you add `--force-env` (the backup's key then replaces the server's). The live data is replaced only when the whole database restore succeeds; if anything fails, the game is started again as it was. Maintenance mode stays as it is (it is never part of a backup).

## 6. Updating and rolling back

1. Update to a newer version of the source (a branch, tag or commit):
   ```
   sudo sbr update <git ref>
   ```
   It builds the new version first (a few minutes, the game keeps running), then takes a backup and a plain database dump for a rollback and starts the new version (the game is away for a few seconds; running matches continue). It refuses while the last update is neither confirmed nor rolled back (step 2 or 3).
2. All good? Confirm it, which deletes the plain dump (it is not encrypted) and frees the old image:
   ```
   sudo sbr confirm
   ```
3. Something wrong after an update (before `sbr confirm`)?
   ```
   sudo sbr rollback
   ```
   It takes a backup of the current state, asks, and goes back to the version before. **If the update changed the database layout, the database goes back to the moment before the update: accounts, matches and points since then are lost** (they stay in the backup it took first). Without a layout change the data stays as it is.
4. Before a planned update you can stop new matches: `sudo sbr maintenance on "Update, back at 22:00"` (the reason is optional, at most 200 characters). Players see "Maintenance — we'll be back shortly" with your reason; running matches play to the end; matches set to start at a time or when full wait in their lobby and start once you turn maintenance off. Afterwards `sudo sbr maintenance off`.
5. Everyday checks: `sudo sbr status` (what runs, health, last backup) and `sudo sbr logs app`.

## 7. Hardening checklist

1. SSH: keys only, no passwords, no root login (`PasswordAuthentication no`, `PermitRootLogin no` in `/etc/ssh/sshd_config`); work as your own user with `sudo`, and pull backups as the `sbr-backup` user of section 5. Before turning root login off, check that your own user can log in and use `sudo`.
2. Automatic security updates: `apt install unattended-upgrades` (on by default on Ubuntu 24.04).
3. Firewall: allow only 22, 80 and 443 — `ufw allow 22/tcp; ufw allow 80/tcp; ufw allow 443/tcp; ufw enable`. (With the website installed, keep the website's own ports too, see its DEPLOYMENT.md.)
4. fail2ban for SSH: `apt install fail2ban`.
5. Docker: `live-restore` on (`/etc/docker/daemon.json`: `{ "live-restore": true }`); log rotation is already set by the game.
6. Domain: a CAA record allowing your certificate authority (Let's Encrypt: `0 issue "letsencrypt.org"`), and DNSSEC if your registrar offers it.
7. Optional: Cloudflare in front for DDoS protection; then the game must trust Cloudflare's addresses as well: run the installer again with `--trusted-proxies <range>,<range>,…` (Cloudflare's published ranges). They are added to the proxy the install type trusts and kept on later runs; `--trusted-proxies none` removes them.

## 8. Good to know

- Settings and secrets live in `/etc/sbr/prod.env` (readable by root only). Running the installer again (also with `--yes`) keeps the secrets, your earlier answers and any setting you added to that file yourself, and changes only what you changed; an empty SMTP answer keeps the saved one; it never switches between standalone and website without asking.
- One environment per server for now: a staging install needs its own VPS (standalone staging would need ports 80/443 of prod, website staging the same `/games/bingo` route). The installer refuses a second environment on the same server.
- Behind another proxy (nginx, your own Caddy): examples in `ops/examples/`.
- Not there yet: a signed release image (the server builds from source), the admin area with two-factor login and its setup page, e-mail sending, the shared website login.
