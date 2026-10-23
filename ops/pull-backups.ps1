# @file   ops/pull-backups.ps1
# @brief  Copies the server's encrypted backups to this Windows PC (scp over SSH).
#
# Responsibility: run on the operator's own computer: fetch every backup file of one
#                 environment that is not here yet from /var/backups/sbr/<env>/ on the
#                 server into a local folder (default: Documents\sbr-backups\<env>). The
#                 files stay age-encrypted; only the operator's age key opens them. Needs
#                 the OpenSSH client that ships with Windows 10/11 and an SSH key the server
#                 accepts for the given user (who must be allowed to read the backups).
# Spec:           docs/spec/09-deployment-architecture.md section 6; docs/operator-guide.md
#
# Usage:  powershell -ExecutionPolicy Bypass -File ops\pull-backups.ps1 -Server root@203.0.113.10 [-Environment prod] [-Target D:\backups]
param(
    [Parameter(Mandatory = $true)][string]$Server,
    [string]$Environment = 'prod',
    [string]$Target = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) "sbr-backups\$Environment")
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($Environment -notmatch '^(prod|staging)$') { throw "The environment is prod or staging, not '$Environment'." }
New-Item -ItemType Directory -Force -Path $Target | Out-Null

# The list on the server, then only the files missing here.
$remote = "/var/backups/sbr/$Environment"
$names = & ssh $Server "ls -1 $remote" | Where-Object { $_ -match '^sbr-.*\.tar\.age$' }
if ($LASTEXITCODE -ne 0) { throw "Could not list $remote on $Server (SSH key, user rights?)." }
$missing = @($names | Where-Object { -not (Test-Path (Join-Path $Target $_)) })
foreach ($name in $missing) {
    Write-Output "Fetching $name"
    & scp -q "${Server}:$remote/$name" (Join-Path $Target $name)
    if ($LASTEXITCODE -ne 0) { throw "Copying $name failed." }
}
Write-Output ("{0} new backup(s) in {1}; {2} on the server." -f $missing.Count, $Target, @($names).Count)
