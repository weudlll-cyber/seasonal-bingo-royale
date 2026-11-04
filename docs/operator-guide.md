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
3. Answer the questions: **standalone**; environment **prod**; your **domain** (or the IP address); your **e-mail** (for certificates); your **age public key** (`age1…`); SMTP can stay empty for now. For an unattended run every answer is a flag (top of `ops/install.sh`); the SMTP password then comes from a file, `--smtp-password-file <file>` (or `-` to pipe it in), never from the command line.
4. Wait until it says **Done**. It installs Docker if needed, builds the game, starts it and checks that it answers.
5. Create the first admin (section 4), then open `https://<your domain>/`.

## 3. Install — inside the Seasonal Entertainment website

Inside the website, players sign in **only with their website account** (D37): the website's proxy asks the website who the visitor is and passes the answer to the game; the game never sees a password or a website session. The game's own registration and password sign-in are off.

**What the website must provide first** (website repository; the game goes online only once this works end to end, D38):

- An authorize endpoint for the game, like the event bot's admin page uses: by default `GET /api/games/bingo/authorize` on the website app (`127.0.0.1:3800` in nginx mode, the `site` service on port 3800 in own-Caddy mode). For a signed-in, unlocked user it answers `204` with four headers: `X-Acting-User-Id` (the stable user id), `X-Acting-User` (the display name), `X-Acting-User-Roles` (comma-separated, e.g. `member,organiser`) and `X-Acting-User-Email-Verified` (`true` or `false`); otherwise `401` (not signed in) or `403`. Organisers and admins may host matches; website admins are game admins; members play. Only a verified e-mail counts for league points.
- A login page that takes a return path in `next` and, after signing in, sends the browser to it (a path on the same site): the game sends a visitor who is not signed in to `/login?next=` followed by the URL-encoded `/games/bingo/auth/website?next=<URL-encoded page>`, e.g. `/login?next=%2Fgames%2Fbingo%2Fauth%2Fwebsite%3Fnext%3D%252Fgames%252Fbingo%252F%2523%252Fleaderboard`, so the player lands on the page they wanted.
- One include line for the game's route file (below) and a link to `https://<website domain>/games/bingo/` on the games page.

**Install:**

1. Log in to the VPS (`ssh root@<VPS address>`).
2. Run the same command as above, but choose **website** as the type (or add `--type website`):
   ```
   git clone https://github.com/weudlll-cyber/seasonal-bingo-royale.git sbr && sudo bash sbr/ops/install.sh --type website
   ```
   The installer finds out how the website runs — with its **own Caddy** (the website's installer chose that because nothing else held ports 80/443) or behind the server's **nginx** — and stops with a plain message when the website is not running. Install the website first.
3. Answer the questions (environment, e-mail, age public key). The installer finds the website's domain itself (own-Caddy mode) or asks for it (nginx mode). Other settings have defaults you can change with flags: `--website-authorize-path` (`/api/games/bingo/authorize`), `--website-login-path` (`/login?next=`), `--website-upstream` (where the website app answers), `--website-routes-dir` (nginx: `/etc/seasonal/routes`), `--app-port` (nginx: the game's loopback port, `3900`), `--edge-subnet` (nginx: the game's network, `172.30.249.0/24`).
4. **Hand the route to the website** — the installer writes the game's own route file and prints these steps; the website's files are never edited by the installer:
   - **nginx mode:** the file is `/etc/seasonal/routes/bingo.conf`. The website's `server` block for its domain needs, once, the line
     ```
     include /etc/seasonal/routes/*.conf;
     ```
     then `nginx -t && systemctl reload nginx`.
   - **Own-Caddy mode:** the file is `/opt/sbr/routes/bingo.caddy`. Once, in the website's checkout on the same server:
     1. Create the folder `deploy/site/routes/` and copy the route file into it, kept private (it holds the proxy secret; keep `routes/` out of version control): `install -m 0600 /opt/sbr/routes/bingo.caddy <website checkout>/deploy/site/routes/`.
     2. In `deploy/site/Caddyfile`, inside the `{$SITE_DOMAIN} { … }` block, add the line `import /etc/caddy/routes/*.caddy`.
     3. In `deploy/site/docker-compose.yml`, give the `caddy` service the volume `- ./routes:/etc/caddy/routes:ro`.
     4. Apply it: `cd <website checkout>/deploy/site && docker compose up -d caddy`.
5. Open `https://<website domain>/games/bingo/` and press **Sign in**: you come back signed in with your website name. `sudo sbr status` shows `sign-in: website` and whether the website's authorize endpoint answers (`401` without a browser session is right).

**Good to know about the website login:**

- The route file sends only `/games/bingo/auth/website` to the website for the check, clears any `X-Acting-User…` and `X-Sbr-Proxy-Secret` headers a browser sends on every game path, and keeps `/games/bingo/metrics` closed (404). The game believes those headers only on that one route, only from the proxy's address and only with the proxy secret: the installer makes it once, keeps it in `/etc/sbr/<env>.env` and the route file (both readable by root only) and never prints it. The website never sees it.
- Signing out of the website does not sign the player out of the game at once: the game session lasts as configured (7 days idle, 30 days at most) or until the player signs out in the game. A website account that is deleted or locked cannot sign in to the game again (the authorize endpoint refuses it).
- Display names follow the website at each sign-in (letters, digits, `_`, `.` and `-`; another character becomes `_`; a name already taken gets a number, e.g. `Anna2`). Hosting follows the website's `organiser` and `admin` roles at each sign-in, and a website `admin` is a game admin as long as the website says so. The game's super admin (who grants or removes admins) is never given by the website: create it with `sudo sbr admin create-super`.
- To delete their game account, a website player types their display name to confirm (there is no game password).
- In nginx mode the game listens on `127.0.0.1:<app port>` of the server only. Another program on the server can reach that port, but without the proxy secret it cannot sign anybody in.

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
   It builds the new version first (a few minutes, the game keeps running), then takes a backup and a plain database dump for a rollback, installs the new version's stack files (limits, routes, the `sbr` command; the old ones are kept for a rollback) and starts the new version (the game is away for a few seconds; running matches continue). An install made before 4 November 2026 gets the new stack files once by running the installer again (step 2 of the install: the same command; it keeps your answers and secrets). It refuses while the last update is neither confirmed nor rolled back (step 2 or 3).
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

1. SSH: keys only, no passwords, no root login (`PasswordAuthentication no`, `PermitRootLogin no` in `/etc/ssh/sshd_config`); work as your own user with `sudo`, and pull backups as the `backup-pull` user of section 5. Before turning root login off, check that your own user can log in and use `sudo`.
2. Automatic security updates: `apt install unattended-upgrades` (on by default on Ubuntu 24.04).
3. Firewall: allow only 22, 80 and 443 — `ufw allow 22/tcp; ufw allow 80/tcp; ufw allow 443/tcp; ufw enable`. (With the website installed, keep the website's own ports too, see its DEPLOYMENT.md.)
4. fail2ban for SSH: `apt install fail2ban`.
5. Docker: `live-restore` on (`/etc/docker/daemon.json`: `{ "live-restore": true }`); log rotation is already set by the game.
6. Domain: a CAA record allowing your certificate authority (Let's Encrypt: `0 issue "letsencrypt.org"`), and DNSSEC if your registrar offers it.
7. Optional: Cloudflare in front for DDoS protection; then the game must trust Cloudflare's addresses as well: run the installer again with `--trusted-proxies <range>,<range>,…` (Cloudflare's published ranges). They are added to the proxy the install type trusts and kept on later runs; `--trusted-proxies none` removes them.

## 8. Removing the game

To take the game off the server (the website and anything else on it stay as they are):

```
sudo sbr uninstall
```

It asks you to type the environment's name (`prod`), then removes the game's containers, its database and uploads, its backup timer, its settings and its route file for the website (in nginx mode it reloads nginx; in own-Caddy mode it tells you to remove `bingo.caddy` from the website's `deploy/site/routes/` yourself). The backups in `/var/backups/sbr/prod/` stay (add `--purge-backups` to delete them too); so do Docker, the `backup-pull` user and the `sbr-backup` group. The website's include line may stay: it then matches no file.

## 9. Good to know

- Settings and secrets live in `/etc/sbr/prod.env` (readable by root only). Running the installer again (also with `--yes`) keeps the secrets, your earlier answers and any setting you added to that file yourself, and changes only what you changed; an empty SMTP answer keeps the saved one; it never switches between standalone and website without asking.
- Resource limits: the game takes at most 3 CPUs and 1 GiB of memory for the app and 1.5 CPUs and 1 GiB for its database, without swap, so it never starves the website or other services on the same server. If the app reaches its limit, Docker restarts only the game's app container. To change them, add lines to `/etc/sbr/prod.env` (they are kept on re-runs) and run `sbr update <ref>`: `SBR_APP_CPUS='3'`, `SBR_APP_MEMORY='1g'`, `SBR_DB_CPUS='1.5'`, `SBR_DB_MEMORY='1g'`. Under a 200-player match the app used up to about 2 CPUs and 330 MiB, the database under 1 CPU and 80 MiB.
- One environment per server for now: a staging install needs its own VPS (standalone staging would need ports 80/443 of prod, website staging the same `/games/bingo` route). The installer refuses a second environment on the same server.
- Behind another proxy (nginx, your own Caddy): examples in `ops/examples/`.
- Not there yet: a signed release image (the server builds from source), the admin area with two-factor login and its setup page, e-mail sending.
