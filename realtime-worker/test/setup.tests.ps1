$ErrorActionPreference = 'Stop'
$taskTestRoot = Join-Path $env:TEMP ('weblogbook-setup-test-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $taskTestRoot | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '../setup.ps1') -Destination (Join-Path $taskTestRoot 'setup.ps1')
$global:radioSetupWrittenSecrets = @()
$global:radioSetupActiveSecret = $null
$global:radioSetupCopiedSecret = $null
$global:radioSetupFailBulk = $false
$global:radioSetupHealthChecks = 0
$global:radioSetupCredentialChecks = 0
$global:radioSetupFailCredentials = $false
$global:radioSetupDeployments = 0
$global:radioSetupLogins = 0
function node {
    $global:LASTEXITCODE = 0
    if ($args -contains 'deploy') { $global:radioSetupDeployments++ }
    if ($args -contains 'login') { $global:radioSetupLogins++ }
    if ($args[0] -like '*check-credentials.mjs') {
        $global:radioSetupCredentialChecks++
        $received = ($input | Out-String) | ConvertFrom-Json
        if ($received.sfuSecret -ne 'fake-sfu-secret' -or $received.turnToken -ne 'fake-turn-secret') { throw 'Credential check received malformed input.' }
        if ($global:radioSetupFailCredentials) { $global:LASTEXITCODE = 1 }
    }
    if ($args -contains 'list') {
        if ($global:radioSetupActiveSecret) { '[{"name":"REALTIME_TICKET_SECRET","type":"secret_text"}]' } else { '[]' }
    }
    if ($args -contains 'bulk') {
        $received = ($input | Out-String) | ConvertFrom-Json
        if ($received.SFU_APP_SECRET -ne 'fake-sfu-secret' -or $received.TURN_API_TOKEN -ne 'fake-turn-secret') { throw 'Secret input was corrupted.' }
        if ($received.REALTIME_TICKET_SECRET.Length -lt 32) { throw 'Signing secret too short.' }
        $global:radioSetupWrittenSecrets += $received.REALTIME_TICKET_SECRET
        if ($global:radioSetupFailBulk) { $global:LASTEXITCODE = 1 }
        else { $global:radioSetupActiveSecret = $received.REALTIME_TICKET_SECRET }
    }
}
function npm.cmd { $global:LASTEXITCODE = 0 }
function Read-Host {
    param([string]$Prompt, [switch]$AsSecureString)
    if ($Prompt -eq 'SFU App Secret') { return ConvertTo-SecureString ' fake-sfu-secret ' -AsPlainText -Force }
    if ($Prompt -eq 'TURN API Token') { return ConvertTo-SecureString ' fake-turn-secret ' -AsPlainText -Force }
    if ($Prompt -like 'Secret REALTIME*') { return ConvertTo-SecureString $global:radioSetupActiveSecret -AsPlainText -Force }
    throw 'Unexpected prompt.'
}
function Invoke-RestMethod {
    param($Uri, $Method, $Headers, $ContentType, $Body, $TimeoutSec)
    if ($Uri -match '/health$') { $global:radioSetupHealthChecks++; return @{ service = 'weblogbook-radio'; protocol = 1 } }
    throw 'Unexpected request.'
}
function Set-Clipboard { param($Value); $global:radioSetupCopiedSecret = $Value }
$setup = Join-Path $taskTestRoot 'setup.ps1'
$options = @{ AccountId = ('a' * 32); SfuAppId = ('b' * 32); TurnKeyId = ('c' * 32); WorkerHost = 'weblogbook-realtime.test.workers.dev' }
& $setup @options *> $null
& $setup *> $null
if ($global:radioSetupWrittenSecrets.Count -ne 2 -or $global:radioSetupWrittenSecrets[0] -ne $global:radioSetupWrittenSecrets[1]) { throw 'A second setup rotated the signing secret.' }
& $setup -CopySiteSecret *> $null
if ($global:radioSetupCopiedSecret -ne $global:radioSetupActiveSecret) { throw 'Copy did not recover the deployed secret.' }
$cipher = Get-Content -LiteralPath (Join-Path $taskTestRoot '.setup/site-secret.dpapi') -Raw
if ($cipher.Contains($global:radioSetupActiveSecret)) { throw 'Signing secret stored in plaintext.' }
Remove-Item -LiteralPath (Join-Path $taskTestRoot '.setup/site-secret.dpapi')
& $setup *> $null
if ($global:radioSetupWrittenSecrets[2] -ne $global:radioSetupActiveSecret -or $global:radioSetupWrittenSecrets[0] -ne $global:radioSetupActiveSecret) { throw 'Existing signing secret was lost on recovery.' }
$before = $global:radioSetupHealthChecks
$global:radioSetupFailBulk = $true
$failed = $false
try { & $setup *> $null } catch { $failed = $true }
if (-not $failed -or $global:radioSetupHealthChecks -ne $before) { throw 'Failed secret upload reported success.' }
$mismatch = $false
try { & $setup -AccountId ('d' * 32) *> $null } catch { $mismatch = $true }
if (-not $mismatch) { throw 'Cross-account state was accepted.' }
$deploymentsBefore = $global:radioSetupDeployments
$loginsBefore = $global:radioSetupLogins
$checksBefore = $global:radioSetupCredentialChecks
& $setup -CheckCredentials *> $null
if ($global:radioSetupCredentialChecks -ne $checksBefore + 1 -or $global:radioSetupDeployments -ne $deploymentsBefore -or $global:radioSetupLogins -ne $loginsBefore) { throw 'Diagnostic-only mode deployed or logged in.' }
$global:radioSetupFailCredentials = $true
$failed = $false
try { & $setup *> $null } catch { $failed = $true }
if (-not $failed -or $global:radioSetupDeployments -ne $deploymentsBefore) { throw 'Invalid credentials did not prevent deployment.' }
Write-Output 'PASS: setup, rerun, encrypted storage, recovery, error handling, account isolation, diagnostic-only mode and credential gate. No network calls.'
