# @file   ops/pull-backups.ps1
# @module ops
# @brief  Copies the server's encrypted backups to this Windows PC (scp over SSH).
#
# Responsibility: run on the operator's own computer: fetch every backup file of one
#                 environment that is not here yet from /var/backups/sbr/<env>/ on the
#                 server into a local folder (default: Documents\sbr-backups\<env>). Each
#                 file is copied as <name>.part, its size compared with the server's, and
#                 only then renamed, so an interrupted copy never looks like a backup. No
#                 backup on the server yet is a plain message, not an error. The files stay
#                 age-encrypted; only the operator's age key opens them. Needs the OpenSSH
#                 client that ships with Windows 10/11 and an SSH key the server accepts for
#                 a user in the group sbr-backup (no root login needed).
# Spec:           docs/spec/09-deployment-architecture.md section 6, section 9; docs/operator-guide.md
#
# Usage:  powershell -ExecutionPolicy Bypass -File ops\pull-backups.ps1 -Server backup@203.0.113.10 [-Environment prod] [-Target D:\backups]
param(
    [Parameter(Mandatory = $true)][string]$Server,
    [string]$Environment = 'prod',
    [string]$Target = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) "sbr-backups\$Environment")
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($Environment -notmatch '^(prod|staging)$') { throw "The environment is prod or staging, not '$Environment'." }
New-Item -ItemType Directory -Force -Path $Target | Out-Null

# Name and size of every backup on the server; an empty or missing folder lists nothing.
$remote = "/var/backups/sbr/$Environment"
$lines = @(& ssh $Server "find $remote -maxdepth 1 -name 'sbr-*.tar.age' -printf '%f %s\n' 2>/dev/null; true")
if ($LASTEXITCODE -ne 0) { throw "Could not reach $Server (SSH key, user rights?)." }
$sizes = @{}
foreach ($line in $lines) {
    if ($line -match '^(sbr-\S+\.tar\.age) (\d+)$') { $sizes[$Matches[1]] = [long]$Matches[2] }
}
if ($sizes.Count -eq 0) {
    Write-Output "No backups on $Server in $remote yet (the first runs at 03:30, or: sudo sbr backup)."
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
