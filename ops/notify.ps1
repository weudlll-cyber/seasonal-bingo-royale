# @file   ops/notify.ps1
# @module ops
# @brief  Development machine only: shows a Windows desktop notification titled "Bingo".
#
# Responsibility: let unattended runs report progress to the owner on the development PC,
#                 using only what ships with Windows (System.Windows.Forms balloon); no
#                 network. Not part of an install: no server or operator step uses it.
# Used by:        unattended runs (docs/NIGHT-RUN.md, "Desktop notifications")
# Spec:           docs/NIGHT-RUN.md
#
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File ops/notify.ps1 "<text>"
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$Text
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$icon = New-Object System.Windows.Forms.NotifyIcon
$icon.Icon = [System.Drawing.SystemIcons]::Information
$icon.BalloonTipTitle = 'Bingo'
$icon.BalloonTipText = $Text
$icon.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Info
$icon.Visible = $true
try {
  $icon.ShowBalloonTip(10000)
  # The balloon belongs to this process; keep it alive long enough to be seen.
  Start-Sleep -Seconds 10
}
finally {
  # Remove the tray icon so finished runs leave nothing behind.
  $icon.Dispose()
}
