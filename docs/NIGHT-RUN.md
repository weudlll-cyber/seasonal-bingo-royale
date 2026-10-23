# Night runs

**Development machine only.** Nothing here is part of an install or of running the game on a server.

How to start an unattended block of work ("night run") so it finishes without stopping at an approval prompt, and how the owner reads the result in the morning. The permission rules live in `.claude/settings.json`; this page owns the launcher and the reporting rules. Modelled on the race project's recipe.

## Launch

The task text goes into `night-task.md` in the repository root (git-ignored). The launch line, run from the repository root:

```sh
claude -p "<contents of night-task.md>" --permission-mode dontAsk --output-format json > logs/night-<YYYYMMDD-HHMM>.log 2>&1
```

On this Windows machine the prompt is passed on stdin instead of as an argument. `claude -p` with no prompt argument reads it from stdin, so the result is the same. Windows PowerShell 5.1 strips embedded double quotes from native arguments and reads files as ANSI, which would corrupt a task text with quotes or characters like `→`. A `cmd` redirect passes the file's bytes through unchanged. Detached and hidden, so it survives the launching session and shows no window:

```powershell
powershell -NoProfile -Command Start-Process -FilePath cmd.exe -WindowStyle Hidden -WorkingDirectory (Get-Location) -ArgumentList '/c claude -p --permission-mode dontAsk --output-format json < night-task.md > logs\night-<YYYYMMDD-HHMM>.log 2>&1'
```

Create `logs/` first; it is git-ignored.

Why each part:

- `-p` runs non-interactively and skips the workspace-trust dialog.
- `--permission-mode dontAsk` turns every call that no allow rule covers into a denial, so the run carries on with an allowed alternative instead of waiting for an answer nobody gives. The deny list still applies; this is not `--dangerously-skip-permissions`.
- `--output-format json` writes one result object when the run ends.
- Redirecting both streams keeps a failed start debuggable.

**The mode must be given at launch.** `defaultMode` in the settings file does not change a session that is already running, and without `dontAsk` the run waits forever at its first unlisted command.

Never pass `-r` or `-c`; use `--session-id <uuid>` if a specific id is needed. Optional: `--max-budget-usd` for a spending ceiling, `--model` and `--effort` to pin the configuration.

## Reporting rules for the run

1. **The log is not a liveness signal.** With `--output-format json` it stays empty until the run ends. To see whether the run is alive, look at the pushed branches or at the session transcript growing under `~/.claude/projects/<project folder>/`.
2. **The channel is the pushed tree.** Commits on origin are the only thing the owner sees during and after the night.
3. **After every finished piece:** commit, push, and append a dated line to the morning sheet (`reports/night-<YYYY-MM-DD>.md`), then push again.
4. **Heartbeat:** at least every 45 minutes a commit on the current branch with the clock time and one sentence of what the run is doing. A gap of more than 45 minutes means the run is stuck.
5. **The morning sheet's OPEN section is regenerated** from the piece list every time, never appended to, so it cannot go stale.

## Desktop notifications

A run reports to the owner without being asked, through `ops/notify.ps1` (development machine only; Windows balloon titled "Bingo", nothing but what ships with Windows):

```sh
powershell -NoProfile -ExecutionPolicy Bypass -File ops/notify.ps1 "<text>"
```

- At the start: `<RUN> started: <N> steps, <goal>`.
- After every finished step: `Step N of M done: <one line>`.
- When a step is still red after three attempts: `Stuck at step N: <one line>, continuing with step N+1` (or `…, stopping` when later steps depend on it).
- At the very end: `Finished: <what is running and where>`, or what actually applies.

## Processes and scratch files

- Long-running processes (dev servers, watchers) start only through `powershell -NoProfile -Command Start-Process ... -WindowStyle Hidden`, never with `&`, `nohup` or chained commands. Chained commands match no permission rule and are denied in `dontAsk` mode.
- Run one command per call; a pipe only when a single tool needs it.
- One-off scripts live in the git-ignored `tmp/` folder and are deleted when the step that needed them is done.

## What a night run never does

- Edit `.claude/settings.json` or `.claude/settings.local.json`. That prompt cannot be suppressed by any mode, so trying it stalls the run.
- Force-push, rewrite history or hard-reset. A run that thinks it needs one stops and leaves the branch pushed.
- Delete source, docs, data directories or `.git`; read `.env` files, keys or certificates.

Deleting a merged branch (`git push origin --delete <branch>`) is allowed.

## In the morning

- Read the morning sheet on `master` or on the last branch named in it.
- `tail` the log for the final result object; search it for `permission` denials. A denial is either a gap in the allow list to close by hand, or a step the run should not have tried.
