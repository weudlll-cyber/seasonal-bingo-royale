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

**Before you start:** install the website with its own installer and answer **yes** to "Will Seasonal Bingo Royale be embedded at /games/bingo?" (or run it again with `--bingo`). It prepares everything for the game: the place for the game's route file, the website's local port (nginx mode), the account-changes token, and a record in `/etc/seasonal/install.conf` (mode, domain, checkout folder; no secrets). The game's installer reads that record and changes no website file except its own route file.

**Install (one command, nothing to do by hand):**

1. Log in to the VPS (`ssh root@<VPS address>`).
2. Run the same command as above, but choose **website** as the type (or add `--type website`):
   ```
   git clone https://github.com/weudlll-cyber/seasonal-bingo-royale.git sbr && sudo bash sbr/ops/install.sh --type website
   ```
3. Answer the game's own questions (environment, e-mail, age public key). The installer takes the website's mode and domain from its record (no question), stops plainly when the website was not prepared for the game (`BINGO` is not `yes`: run the website installer again with `--bingo`), writes its route file, checks it (`nginx -t`, or `caddy validate` inside the website's Caddy), puts the previous one back and stops if the check fails (the website keeps working), and reloads the website's proxy. Settings you can change with flags: `--website-domain`, `--website-authorize-path` (`/api/games/bingo/authorize`), `--website-login-path` (`/login?next=`), `--website-upstream`, `--website-routes-dir` (nginx: `/etc/seasonal/routes`), `--app-port` (nginx: `3900`), `--edge-subnet` (nginx: `172.30.249.0/24`), `--website-network`.
4. At the end it checks through the website's proxy: `/games/bingo/` answers, the sign-in route leads a visitor without a website session to the website's login, the website's authorize endpoint gives its guest answer, and the game can read the account-changes feed. A failing check is named; the fallback is "Website by hand" below.
5. Open `https://<website domain>/games/bingo/` and press **Sign in**: you come back signed in with your website name. `sudo sbr status` shows `sign-in: website`, whether the website's authorize endpoint answers (`204`, the guest answer, without a browser session is right; an older website answers `401`) and whether the account-changes feed is followed.

Re-running the installer and `sudo sbr update` rewrite the route file and reload the same way; `sudo sbr uninstall` removes only the game's route file and reloads.

**Good to know about the website login:**

- The route file sends only `/games/bingo/auth/website` to the website for the check (with the browser's cookie, origin and method), clears any `X-Acting-User…`, `X-Acting-Guest` and `X-Sbr-Proxy-Secret` headers a browser sends on every game path, passes the website's answer only on that route, and keeps `/games/bingo/metrics` closed (404). The game believes those headers only on that one route, only from the proxy's address and only with the proxy secret: the installer makes it once, keeps it in `/etc/sbr/<env>.env` and the route file (both readable by root only) and never prints it. The website never sees it.
- A game session started through the website lasts at most 7 days. A change on the website (account deleted, locked, unlocked, rights changed) signs the player out of the game within about 2 minutes (the account-changes feed); a locked account then counts as a guest. Visitors who are not signed in can watch matches and read the leaderboard; to join they are sent to the website login.
- Display names follow the website at each sign-in (letters, digits, `_`, `.` and `-`; another character becomes `_`; a name already taken gets a number, e.g. `Anna2`). Hosting follows the website's "may start games" permission at each sign-in (website admins may host too), and a website `admin` is a game admin as long as the website says so. The game's super admin (who grants or removes admins) is never given by the website: create it with `sudo sbr admin create-super`.
- To delete their game account, a website player types their display name to confirm (there is no game password).
- In nginx mode the game listens on `127.0.0.1:<app port>` of the server only. Another program on the server can reach that port, but without the proxy secret it cannot sign anybody in.

### Website by hand (fallback)

Only when the installer could not do it (an older website without `/etc/seasonal/install.conf`, or a failing check). The game's route file is written anyway; the website's files are never edited by the installer.

- **nginx mode:** the file is `/etc/seasonal/routes/bingo.conf`. The website's `server` block for its domain needs, once, the line `include /etc/seasonal/routes/*.conf;`, then `nginx -t && systemctl reload nginx`.
- **Own-Caddy mode:** without the website's checkout the file is `/opt/sbr/routes/bingo.caddy`. Once, in the website's checkout on the same server: copy it into `deploy/site/routes/` kept private (`install -m 0600 /opt/sbr/routes/bingo.caddy <website checkout>/deploy/site/routes/`); in `deploy/site/Caddyfile`, inside the `{$SITE_DOMAIN} { … }` block, add `import /etc/caddy/routes/*.caddy`; in `deploy/site/docker-compose.yml` give the `caddy` service the volume `- ./routes:/etc/caddy/routes:ro`; then `cd <website checkout>/deploy/site && docker compose up -d caddy`.
- The website must answer `/api/games/bingo/authorize` on its app (204 for every visitor; the identity headers for a member, `X-Acting-Guest: true` for anyone else) and offer `/api/games/bingo/account-changes` with the token in `/etc/seasonal/games-sync-token`.

## 4. Create the first admin

```
sudo sbr admin create-super
```

It asks for e-mail, display name (3–24 letters or digits) and a password of at least 12 characters (not shown while you type). This account can host matches. (A proper admin area with two-factor login comes with a later version.)

### Admin two-factor sign-in and password reset (standalone)

- Every admin account signs in with a second step: the first sign-in shows a QR code for an authenticator app (any TOTP app) and then ten recovery codes, shown once; keep them safe. Later sign-ins ask for the app's code or one recovery code. An admin who lost both: `sudo sbr admin reset-2fa <display name>` (they set it up again at the next sign-in).
- "Forgot password?" on the sign-in page sends a link by e-mail, valid one hour, through the SMTP settings the installer asked for. Without them the link is hidden and `sudo sbr status` says so; run the installer again with `--smtp-host …` to add them.
- League points no longer need a confirmed e-mail address (D59); `SBR_FEATURE_EMAIL_VERIFICATION=true` in `/etc/sbr/<env>.env` brings the requirement back.

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
5. Everyday checks: `sudo sbr status` (what runs, health, last backup, the database roles) and `sudo sbr logs app`.
6. Database roles (since 4 November 2026): the game uses two database roles.
   - The app connects as `sbr_app`, which can read and write the game's rows but cannot change the tables, drop them or touch roles. It can never change or delete a match event.
   - The migrations run before the app starts as `sbr_owner`, in the short-lived `migrate` container. `sbr status` lists it as exited (that is normal).
   - Their passwords are in `/etc/sbr/prod.env` (made by the installer, never shown).
   - An install made earlier gets the roles on the first `sudo sbr update` that the new `sbr` command runs. The update that brings the new command still runs the old one, so after `sudo sbr confirm` run `sudo sbr update <the same ref>` once more; `sudo sbr status` says whether the roles are set up. `sudo sbr rollback` goes back to the earlier setup, the env file included.
   - A version older than the roles cannot be installed over them; `sbr update` refuses it.

## 6a. Load check

Before you announce the game, check once that the server keeps up with a full match:

```
sudo sbr maintenance on "Load check"
sudo sbr loadcheck
sudo sbr maintenance off
```

- What it does: it plays one realtime royale with 200 temporary players and 50 spectators for 10 minutes (draws every 4 s, every player tapping), on the server itself, inside the game's resource limits.
- What it prints: how fast each draw reaches the screens, how fast taps are acknowledged, any errors, and the most CPU and memory the game and its database used, each with the target beside it.
- Afterwards: it aborts the match and removes all its temporary accounts and their sessions, and says that nothing is left. It does this also when something goes wrong; a run you break off cleans up as well.
- When it refuses: it does not run while real players are in a match, or while people are signed in and maintenance is off (it says why); with maintenance on nobody can start a match meanwhile.
- Smaller runs: `--players 50 --spectators 10 --minutes 3`.

## 7. Hardening checklist

1. SSH: keys only, no passwords, no root login (`PasswordAuthentication no`, `PermitRootLogin no` in `/etc/ssh/sshd_config`); work as your own user with `sudo`, and pull backups as the `backup-pull` user of section 5. Before turning root login off, check that your own user can log in and use `sudo`.
2. Automatic security updates: `apt install unattended-upgrades` (on by default on Ubuntu 24.04).
3. Firewall: allow only 22, 80 and 443 — `ufw allow 22/tcp; ufw allow 80/tcp; ufw allow 443/tcp; ufw enable`. (With the website installed, keep the website's own ports too, see its DEPLOYMENT.md.)
4. fail2ban for SSH: `apt install fail2ban`.
5. Docker: `live-restore` on (`/etc/docker/daemon.json`: `{ "live-restore": true }`); log rotation is already set by the game.
6. Domain: a CAA record allowing your certificate authority (Let's Encrypt: `0 issue "letsencrypt.org"`), and DNSSEC if your registrar offers it.
7. No CDN in front: a CDN or Cloudflare proxy in front of the game is not supported for now. Behind it every visitor would share the same rate limits. Point your domain's DNS straight at the server (with Cloudflare: “DNS only”, the grey cloud). The installer's `--trusted-proxies <range>,…` is only for a proxy of your own in front of the website; `--trusted-proxies none` removes the ranges again.

## 8. Removing the game

To take the game off the server (the website and anything else on it stay as they are):

```
sudo sbr uninstall
```

It asks you to type the environment's name (`prod`), then removes the game's containers, its database and uploads, its backup timer, its settings and its route file for the website (in nginx mode it reloads nginx; in own-Caddy mode it tells you to remove `bingo.caddy` from the website's `deploy/site/routes/` yourself). The backups in `/var/backups/sbr/prod/` stay (add `--purge-backups` to delete them too); so do Docker, the `backup-pull` user and the `sbr-backup` group. The website's include line may stay: it then matches no file.

## 8a. For hosts

- **Pausing a match:** there is no separate pause (D57). In the host console switch the draws to **Host draws ("Draw next")**: no number is drawn until you press Draw next again; switch back to timed draws to go on automatically.
- **No late join:** players join only while the match is in its lobby (D53).
- **Chat:** the game has no chat of its own; inside the website the website's chat is used (D55).

## 9. Good to know

- Settings and secrets live in `/etc/sbr/prod.env` (readable by root only). Running the installer again (also with `--yes`) keeps the secrets, your earlier answers and any setting you added to that file yourself, and changes only what you changed; an empty SMTP answer keeps the saved one; it never switches between standalone and website without asking.
- Resource limits: the game takes at most 3 CPUs and 1 GiB of memory for the app and 1.5 CPUs and 1 GiB for its database, without swap, so it never starves the website or other services on the same server. If the app reaches its limit, Docker restarts only the game's app container. To change them, add lines to `/etc/sbr/prod.env` (they are kept on re-runs) and run `sbr update <ref>`: `SBR_APP_CPUS='3'`, `SBR_APP_MEMORY='1g'`, `SBR_DB_CPUS='1.5'`, `SBR_DB_MEMORY='1g'`. Under a 200-player match the app used up to about 2 CPUs and 330 MiB, the database under 1 CPU and 80 MiB.
- One environment per server for now: a staging install needs its own VPS (standalone staging would need ports 80/443 of prod, website staging the same `/games/bingo` route). The installer refuses a second environment on the same server.
- Behind another proxy (nginx, your own Caddy): examples in `ops/examples/`.
- Not there yet: a signed release image (the server builds from source), the admin area with two-factor login and its setup page, e-mail sending.
