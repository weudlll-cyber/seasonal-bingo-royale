# Go-live: Bingo on the VPS, inside the website

The step-by-step sheet for the move. Bingo goes onto the VPS where the Seasonal Entertainment website already runs. It lives at `https://<website domain>/games/bingo/`. Players sign in with their website account.

Every step below was rehearsed on 2026-11-23 against the real website installer, in a throw-away Ubuntu 24.04 server (`bash ops/test/real-site.sh nginx master` and `… caddy master`; results in docs/BACKLOG.md part two). One step was not rehearsed that way: updating a website that is already running (step 3). The rehearsal installs the website fresh. The website's own tests cover its update.

`<…>` means: put in your value. Type everything else exactly as shown.

## 1. Before the move

1. **Versions.** Rehearsed together: website master `e71c654` and Bingo master `3c0888d` (2026-11-23, both modes, with a backup restored into a fresh server; docs/BACKLOG.md part two, "REHEARSAL-FINAL" and "PROD-AUDIT"). Use master of both; a newer one is fine when its CI is green.
2. **DNS.** Nothing new. Bingo uses the website's domain. Check that `https://<website domain>/` opens in the browser.
3. **The age key.** You need the public key (`age1…`) for Bingo's backups. It is the line `Public key: age1…` of your `sbr-age-key.txt` (operator guide §1 step 3). The private key stays on your PC.
4. **A backup of the website.** On the VPS:
   ```
   sudo systemctl start seasonal-backup.service
   ls /var/backups/seasonal
   ```
   The newest `<time>.tar.age` is the backup. Pull it to your PC as the website's guide says ("Backups to your PC").
5. **Time.** Plan about 30 minutes. Building Bingo takes a few minutes. Players of the website notice nothing, except the website's own update in step 3 (a few seconds).

## 2. Log in

In PowerShell on your PC:

```
ssh root@<VPS address>
```

## 3. Prepare the website for Bingo

The website must know that Bingo comes. Update it and answer the Bingo question:

```
sudo /opt/seasonal-entertainment/deploy/install.sh --update --bingo
```

- It asks: **"Will Seasonal Bingo Royale be embedded at /games/bingo?"** Answer **yes**.
- It takes a website backup first and prints where it is.
- It prints the old and the new commit.

Then check the website:

```
sudo /opt/seasonal-entertainment/deploy/install.sh --status
```

Expected: the website's containers run and are healthy. The commit is the new one.

## 4. Install Bingo: one command, three answers

```
git clone https://github.com/weudlll-cyber/seasonal-bingo-royale.git sbr && sudo bash sbr/ops/install.sh --type website
```

It asks three things:

| Question                                   | Your answer             |
| ------------------------------------------ | ----------------------- |
| `Environment [prod/staging] [prod]:`       | press **Enter** (prod)  |
| `Admin e-mail (certificates and notices):` | your e-mail address     |
| `Your age public key for backups (age1…):` | your public key `age1…` |

It asks nothing else. It takes the website's mode (nginx or the website's own Caddy) and the domain from the website's record.

Expected output, in this order (from the rehearsal; your values differ):

```
Checking the server
  system: ubuntu 24.04
  …
  website: nginx mode, domain <website domain>, the app trusts 172.30.249.0/24
Preparing the app
  image source: built on this server from /root/sbr at master (no signed release image yet)
  building sbr-app:<id> from master on this server (a few minutes)
  wrote /etc/sbr/prod.env
  …
  route file: /etc/seasonal/routes/bingo.conf, nginx reloaded
Starting the stack
  …
  the app is ready (after …)
Done (<n> change(s)). Next steps:
  1. The website's admins are the game's admins; members may host once the website allows it (Admin -> Users).
  2. The route is live at https://<website domain>/games/bingo/ (nginx mode, route file /etc/seasonal/routes/bingo.conf).
  3. Players sign in only with their website account (D37).
  checked through the website's proxy: the game, its sign-in and the website's answers work
  Backups run every night at 03:30 into /var/backups/sbr/prod/; pull them to your PC with ops/pull-backups.ps1.
  Status: sudo sbr status
```

With the website's own Caddy, the `website:` line says `caddy mode` and the route file is `deploy/site/routes/bingo.caddy` in the website's folder.

The important line is **`checked through the website's proxy: … work`**.

## 5. Check the status

```
sudo sbr status
```

Expected, as on the rehearsal's server (the website's own Caddy there; with the website's nginx the `proxy:` line reads differently):

```
type:        website (environment prod)
address:     https://<website domain>/games/bingo/
image:       sbr-app:<id> (ref master)
SERVICE    STATUS
app        Up 2 minutes (healthy)
postgres   Up 3 minutes (healthy)
health:      ready
last backup: none yet
next backup: <tomorrow> 03:30:00 UTC
maintenance: off
sign-in:     website
database:    the app as sbr_app, migrations as sbr_owner
proxy:       the website's network seasonal-site_default (172.18.0.0/16)
website:     authorize endpoint site:3800/api/games/bingo/authorize: 204
website feed: following the website's account changes
```

The rehearsal checks these three lines; they must be there:

- `sign-in:     website`
- `website:     authorize endpoint …: 204`
- `website feed: following the website's account changes`

`last backup: none yet` is right until the first backup (step 7.6, or the night at 03:30).

## 6. In the website's admin

1. **Admin → Games**: open or add the card for Bingo.
   - Path: `/games/bingo` (no slash at the end).
   - Status: `coming_soon` while you test; `available` when players may come.
   - Who may see it: as you like.
   - Image: one of `seasonal-tokens`, `spring`, `summer`, `autumn`, `winter`.
   - "Sign-up status URL": leave empty.
2. **Admin → Users**: tick "May host" for Bingo for each member who may start matches. Website admins may always host.

## 7. First checks in the browser

1. Open `https://<website domain>/games/bingo/` **signed out**. The leaderboard shows. A small "← Seasonal Entertainment" is at the top left.
2. Press **Sign in**. You go to the website's login and come back signed in, with your website name.
3. As a website admin, open the admin area. The Overview shows.
4. Start a short match from a preset, with a second browser as a player. Play it to the end.
5. Open the chat. It is the website's chat, in Bingo's room.
6. Take Bingo's first backup and pull it to your PC:
   ```
   sudo sbr backup
   ```
   Then, in PowerShell on your PC (once: the `backup-pull` user, operator guide §5 step 1):
   ```
   powershell -ExecutionPolicy Bypass -File ops\pull-backups.ps1 -Server backup-pull@<VPS address>
   ```

When all is good: set the Bingo card to `available`.

## 8. If a step fails

**Where to look:**

- The installer names the check that failed. Read the last lines.
- `sudo sbr status`: what runs, its health, the sign-in mode, the last backup.
- `sudo sbr logs app`: the game's log.
- The website: `sudo /opt/seasonal-entertainment/deploy/install.sh --status`.

**Going back without losing the website:**

- **Bingo's install failed, or Bingo must go:**
  ```
  sudo sbr uninstall
  ```
  Type `prod` when asked. It removes only Bingo: its containers, its data, its route file. It reloads the website's proxy. The website keeps running; the rehearsal checks that nothing of the website changes. Bingo's backups stay in `/var/backups/sbr/prod/`. Then you can install again from step 4.
- **The install's route check failed:** the installer puts the previous route file back and stops. The website keeps working. See the operator guide §3, "Website by hand".
- **A later Bingo update went wrong** (before `sudo sbr confirm`):
  ```
  sudo sbr rollback
  ```
- **The website's update in step 3 went wrong:** follow the website's guide (`docs/DEPLOYMENT.md`, "Status, uninstall, rollback" and "Restoring"). It needs the snapshot it printed (`/var/backups/seasonal-install/<time>`) or the backup from step 1.4.
- **Bingo's data must come back from a backup:** operator guide §5 step 5 (`sudo sbr restore <file> --identity <key file>`). On a new server, add `--force-env`. The rehearsal restores a backup into a fresh server this way.
