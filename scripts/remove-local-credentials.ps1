[CmdletBinding(SupportsShouldProcess, ConfirmImpact = "High")]
param([string]$ConfigPath)

$ErrorActionPreference = "Stop"

if (-not $ConfigPath) {
  if (-not $env:LOCALAPPDATA) {
    throw "LOCALAPPDATA is unavailable. Pass -ConfigPath explicitly."
  }
  $ConfigPath = Join-Path $env:LOCALAPPDATA "dext-codex-connector\config.json"
}

$configDirectory = Split-Path -Parent ([IO.Path]::GetFullPath($ConfigPath))
if (-not (Test-Path -LiteralPath $configDirectory)) {
  Write-Host "No local Dext connector configuration was found."
  exit 0
}

if ($PSCmdlet.ShouldProcess($configDirectory, "Remove local Dext connector configuration and protected credentials")) {
  Remove-Item -LiteralPath $configDirectory -Recurse -Force
  Write-Host "Removed the local connector configuration."
  Write-Host "This did not revoke any token in Dext. Revoke it separately in Dext when required."
}
