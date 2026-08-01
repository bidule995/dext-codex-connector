[CmdletBinding()]
param([string]$ConfigPath)

$ErrorActionPreference = "Stop"

if (-not $ConfigPath) {
  if (-not $env:LOCALAPPDATA) {
    throw "LOCALAPPDATA is unavailable. Pass -ConfigPath explicitly."
  }
  $ConfigPath = Join-Path $env:LOCALAPPDATA "dext-codex-connector\config.json"
}

$ConfigPath = [IO.Path]::GetFullPath($ConfigPath)
$credentialsPath = Join-Path (Split-Path -Parent $ConfigPath) "credentials.dpapi.json"
if (-not (Test-Path -LiteralPath $ConfigPath)) {
  Write-Host "Local Dext connector is unconfigured."
  Write-Host "Expected config: $ConfigPath"
  exit 0
}

$config = Get-Content -Raw -LiteralPath $ConfigPath | ConvertFrom-Json
$credentials = if (Test-Path -LiteralPath $credentialsPath) {
  Get-Content -Raw -LiteralPath $credentialsPath | ConvertFrom-Json
} else {
  $null
}

[pscustomobject]@{
  ConfigPath = $ConfigPath
  Mode = $config.mode
  DataHealthEnabled = [bool]$config.dataHealth.enabled
  DataHealthCredentialPresent = [bool]$credentials.dataHealthToken
  CommerceEnabled = [bool]$config.commerce.enabled
  CommerceEnvironment = $config.commerce.environment
  CommerceCredentialPresent = [bool]$credentials.commerceApiKey
} | Format-List

Write-Host "Credential values were not read or displayed."
