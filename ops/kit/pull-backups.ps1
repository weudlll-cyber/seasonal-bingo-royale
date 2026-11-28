# @file   ops/pull-backups.ps1
# @module ops
# @brief  Copies a server's encrypted backups to this Windows PC (scp over SSH).
#
# Responsibility: run on the operator's own computer: fetch every backup file of one game that
#                 is not here yet from the folder ops/backup.sh writes on the server into a local
#                 folder (default: Documents\<prefix>-backups). Each file is copied as
#                 <name>.part, its size compared with the server's, and only then renamed, so an
#                 interrupted copy never looks like a backup. No backup on the server yet is a
#                 plain message, not an error. Files stay age-encrypted; only the operator's age
#                 key opens them. Needs the Windows OpenSSH client and an SSH key the server
#                 accepts for a user in the backup group (no root login).
# Source:         seasonal-bingo-royale ops/pull-backups.ps1 at dd35d08 and seasonal-mini-games
#                 ops/pull-backups.ps1 at 1988346 (the same script but for the prefix and the
#                 folder, which are parameters here).
# Spec:           kit DECISIONS K61; docs/OPERATIONS.md
#
# Usage:  powershell -ExecutionPolicy Bypass -File ops\pull-backups.ps1 -Server backup@203.0.113.10 -RemoteDir /var/backups/sbr/prod -Prefix sbr [-Target D:\backups]
param(
    [Parameter(Mandatory = $true)][string]$Server,
    [Parameter(Mandatory = $true)][string]$RemoteDir,
    [Parameter(Mandatory = $true)][string]$Prefix,
    [string]$Target = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) "$Prefix-backups")
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($Prefix -notmatch '^[A-Za-z0-9_-]+$') { throw "The prefix is letters, digits, - and _, not '$Prefix'." }
if ($RemoteDir -notmatch '^/[A-Za-z0-9_./-]+$') { throw "The remote folder is an absolute path of plain characters, not '$RemoteDir'." }
New-Item -ItemType Directory -Force -Path $Target | Out-Null

# Name and size of every backup on the server; an empty or missing folder lists nothing.
$remote = $RemoteDir
$lines = @(& ssh $Server "find $remote -maxdepth 1 -name '$Prefix-*.tar.age' -printf '%f %s\n' 2>/dev/null; true")
if ($LASTEXITCODE -ne 0) { throw "Could not reach $Server (SSH key, user rights?)." }
$sizes = @{}
foreach ($line in $lines) {
    if ($line -match "^($([regex]::Escape($Prefix))-\S+\.tar\.age) (\d+)$") { $sizes[$Matches[1]] = [long]$Matches[2] }
}
if ($sizes.Count -eq 0) {
    Write-Output "No backups on $Server in $remote yet (the first runs with the timer, or run ops/backup.sh backup)."
    exit 0
}

$missing = @($sizes.Keys | Sort-Object | Where-Object { -not (Test-Path (Join-Path $Target $_)) })
foreach ($name in $missing) {
    Write-Output "Fetching $name"
    $final = Join-Path $Target $name
    $part = "$final.part"
    & scp -q "${Server}:$remote/$name" $part
    if ($LASTEXITCODE -ne 0) { Remove-Item -Force -ErrorAction SilentlyContinue $part; throw "Copying $name failed." }
    # Complete only when as large as on the server.
    $got = (Get-Item $part).Length
    if ($got -ne $sizes[$name]) {
        Remove-Item -Force $part
        throw "Copy of $name is $got bytes, the server has $($sizes[$name]); run the script again."
    }
    Move-Item -Force $part $final
}
Write-Output ("{0} new backup(s) in {1}; {2} on the server." -f $missing.Count, $Target, $sizes.Count)
