[CmdletBinding()]
param(
  [switch]$SkipDataHealth,
  [switch]$EnableCommerce,
  [ValidateSet("sandbox", "production")]
  [string]$CommerceEnvironment = "sandbox",
  [ValidateRange(1, 50)]
  [int]$RiskDetailRequestBudget = 40,
  [string]$ConfigPath
)

$ErrorActionPreference = "Stop"

if (-not $IsWindows -and $PSVersionTable.PSVersion.Major -ge 6) {
  throw "The protected setup helper requires Windows DPAPI. Use the documented environment-variable setup on other platforms."
}

if (-not $ConfigPath) {
  if (-not $env:LOCALAPPDATA) {
    throw "LOCALAPPDATA is unavailable. Pass -ConfigPath explicitly."
  }
  $ConfigPath = Join-Path $env:LOCALAPPDATA "dext-codex-connector\config.json"
}

$ConfigPath = [IO.Path]::GetFullPath($ConfigPath)
$configDirectory = Split-Path -Parent $ConfigPath
$credentialsPath = Join-Path $configDirectory "credentials.dpapi.json"
New-Item -ItemType Directory -Force -Path $configDirectory | Out-Null

$existingCredentials = $null
if (Test-Path -LiteralPath $credentialsPath) {
  $existingCredentials = Get-Content -Raw -LiteralPath $credentialsPath | ConvertFrom-Json
  if (
    $existingCredentials.version -ne 1 -or
    $existingCredentials.provider -ne "windows-dpapi-current-user"
  ) {
    throw "The existing protected credential file uses an unsupported format."
  }
}

$credentials = [ordered]@{
  version = 1
  provider = "windows-dpapi-current-user"
}
if ($existingCredentials.dataHealthToken) {
  $credentials.dataHealthToken = $existingCredentials.dataHealthToken
}
if ($existingCredentials.commerceApiKey) {
  $credentials.commerceApiKey = $existingCredentials.commerceApiKey
}

if (-not $SkipDataHealth) {
  $dataHealthToken = Read-Host "Paste the dedicated Dext Data Health API token" -AsSecureString
  if ($dataHealthToken.Length -lt 8) {
    throw "The Data Health token is too short. Nothing was saved."
  }
  $credentials.dataHealthToken = ConvertFrom-SecureString $dataHealthToken
}

if ($EnableCommerce) {
  $commerceKey = Read-Host "Paste the separate Dext Commerce API key" -AsSecureString
  if ($commerceKey.Length -lt 8) {
    throw "The Commerce API key is too short. Nothing was saved."
  }
  $credentials.commerceApiKey = ConvertFrom-SecureString $commerceKey
}

if (-not $credentials.dataHealthToken -and -not $credentials.commerceApiKey) {
  throw "No credential was configured. Nothing was saved."
}

$config = [ordered]@{
  version = 1
  mode = "live"
  dataHealth = [ordered]@{
    enabled = [bool]$credentials.dataHealthToken
  }
  commerce = [ordered]@{
    enabled = [bool]($EnableCommerce -or $existingCredentials.commerceApiKey)
    environment = $CommerceEnvironment
  }
  riskDetailRequestBudget = $RiskDetailRequestBudget
}

$config | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $ConfigPath -Encoding UTF8
$credentials | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $credentialsPath -Encoding UTF8

$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$acl = New-Object Security.AccessControl.DirectorySecurity
$acl.SetAccessRuleProtection($true, $false)
$rule = New-Object Security.AccessControl.FileSystemAccessRule(
  $identity,
  "FullControl",
  "ContainerInherit,ObjectInherit",
  "None",
  "Allow"
)
$acl.AddAccessRule($rule)
Set-Acl -LiteralPath $configDirectory -AclObject $acl

Write-Host "Saved local Dext configuration for the current Windows user."
Write-Host "Config: $ConfigPath"
Write-Host "No Dext request was made. Restart Codex and call connection_status first."
