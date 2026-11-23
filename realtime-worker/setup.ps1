# Windows PowerShell 5.1 / PowerShell 7. No secret is written in plaintext.
[CmdletBinding()]
param(
    [string]$AccountId,
    [string]$SfuAppId,
    [string]$TurnKeyId,
    [string]$WorkerHost,
    [switch]$CopySiteSecret,
    [switch]$CheckCredentials
)

$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'Ce script utilise le chiffrement Windows DPAPI.' }
$stateDirectory = Join-Path $PSScriptRoot '.setup'
$secretPath = Join-Path $stateDirectory 'site-secret.dpapi'
$configPath = Join-Path $stateDirectory 'account.json'

function Get-PlainSecret([Security.SecureString]$Secret) {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secret)
    try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}
function Read-Secret([string]$Label, [int]$Minimum = 1) {
    $secret = Read-Host $Label -AsSecureString
    if ($secret.Length -lt $Minimum) { throw "Valeur absente ou trop courte : $Label" }
    return $secret
}
function Assert-Command([string]$Step) {
    if ($LASTEXITCODE -ne 0) { throw "$Step a echoue. Arret sans poursuivre la configuration." }
}

if ($CopySiteSecret) {
    if (-not (Test-Path -LiteralPath $secretPath)) { throw 'Aucun secret local. Executer la configuration auparavant.' }
    $secure = (Get-Content -LiteralPath $secretPath -Raw).Trim() | ConvertTo-SecureString
    try { Set-Clipboard -Value (Get-PlainSecret $secure) }
    finally { $secure.Dispose() }
    Write-Host 'Secret copie. Coller dans CLOUDFLARE_REALTIME_SECRET sur Vercel, puis vider le presse-papiers.'
    return
}

if (Test-Path -LiteralPath $configPath) {
    $saved = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
    if (-not $AccountId) { $AccountId = $saved.accountId }
    if (-not $SfuAppId) { $SfuAppId = $saved.sfuAppId }
    if (-not $TurnKeyId) { $TurnKeyId = $saved.turnKeyId }
    if (-not $WorkerHost) { $WorkerHost = $saved.workerHost }
    if ($AccountId -ne $saved.accountId -or ($WorkerHost -and $WorkerHost -ne $saved.workerHost)) {
        throw 'Cette copie est deja liee a un autre compte ou Worker. Utiliser une copie distincte.'
    }
}
if (-not $AccountId) { $AccountId = Read-Host 'Cloudflare Account ID' }
if (-not $SfuAppId) { $SfuAppId = Read-Host 'SFU App ID' }
if (-not $TurnKeyId) { $TurnKeyId = Read-Host 'TURN Key ID' }
if (-not $WorkerHost) { $WorkerHost = Read-Host 'Hote du Worker (weblogbook-realtime.sous-domaine.workers.dev)' }
foreach ($id in @($AccountId, $SfuAppId, $TurnKeyId)) {
    if ($id -notmatch '^[a-fA-F0-9]{32}$') { throw 'Un identifiant Cloudflare doit contenir 32 caracteres hexadecimaux.' }
}
if ($WorkerHost -notmatch '^weblogbook-realtime\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.workers\.dev$') {
    throw 'Hote invalide. Utiliser weblogbook-realtime.<sous-domaine>.workers.dev, sans https://.'
}

$previousAccount = $env:CLOUDFLARE_ACCOUNT_ID
$previousLog = $env:WRANGLER_LOG
$previousEncoding = $OutputEncoding
$sfuSecret = $turnSecret = $ticketSecret = $null
$payload = $sfuPlain = $turnPlain = $ticketPlain = $null
Push-Location $PSScriptRoot
try {
    $env:CLOUDFLARE_ACCOUNT_ID = $AccountId
    $env:WRANGLER_LOG = 'info'
    $OutputEncoding = New-Object System.Text.UTF8Encoding($false)
    Get-Command node -ErrorAction Stop | Out-Null
    if (-not $CheckCredentials) {
        Get-Command npm.cmd -ErrorAction Stop | Out-Null
        & node --test test/radio.test.mjs test/credentials.test.mjs
        Assert-Command 'Les tests Worker'
        if (Test-Path -LiteralPath 'package-lock.json') { & npm.cmd ci --no-audit --no-fund }
        else { & npm.cmd install --no-audit --no-fund }
        Assert-Command "L'installation de Wrangler"
        $wrangler = Join-Path $PSScriptRoot 'node_modules/wrangler/bin/wrangler.js'
        & node $wrangler login
        Assert-Command 'La connexion Cloudflare'
    }

    Write-Host 'Saisir les secrets associes aux ressources SFU et TURN (saisie masquee).'
    $sfuSecret = Read-Secret 'SFU App Secret'
    $turnSecret = Read-Secret 'TURN API Token'
    $sfuPlain = (Get-PlainSecret $sfuSecret).Trim()
    $turnPlain = (Get-PlainSecret $turnSecret).Trim()

    # Node uses its TLS stack instead of legacy Windows PowerShell HTTPS defaults.
    # Only a sanitized service name, HTTP status and known error category are logged.
    $payload = @{ sfuAppId = $SfuAppId; sfuSecret = $sfuPlain; turnKeyId = $TurnKeyId; turnToken = $turnPlain } | ConvertTo-Json -Compress
    $payload | & node (Join-Path $PSScriptRoot 'scripts/check-credentials.mjs')
    Assert-Command 'La verification des identifiants (voir les lignes SFU/TURN ci-dessus)'
    $payload = $null
    Write-Host 'Identifiants SFU et TURN valides.'
    if ($CheckCredentials) {
        Write-Host 'Diagnostic termine, aucun Worker deploye. Lancer .\setup.ps1 pour poursuivre.'
        return
    }

    & node $wrangler deploy
    Assert-Command 'Le deploiement Worker'
    $list = & node $wrangler secret list --format json
    Assert-Command 'La lecture des noms de secrets'
    $existing = ($list -join "`n") | ConvertFrom-Json
    if (Test-Path -LiteralPath $secretPath) {
        $ticketSecret = (Get-Content -LiteralPath $secretPath -Raw).Trim() | ConvertTo-SecureString
    } elseif (@($existing | Where-Object { $_.name -eq 'REALTIME_TICKET_SECRET' }).Count -gt 0) {
        $ticketSecret = Read-Secret 'Secret REALTIME_TICKET_SECRET existant (ne pas en creer un autre)' 32
    } else {
        $random = New-Object byte[] 48
        $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
        try { $generator.GetBytes($random) }
        finally { $generator.Dispose() }
        $ticketSecret = ConvertTo-SecureString ([Convert]::ToBase64String($random)) -AsPlainText -Force
        [Array]::Clear($random, 0, $random.Length)
    }
    if ($ticketSecret.Length -lt 32) { throw 'Secret de signature invalide.' }
    New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null
    $ticketSecret | ConvertFrom-SecureString | Set-Content -LiteralPath $secretPath -Encoding ASCII
    @{ accountId = $AccountId; sfuAppId = $SfuAppId; turnKeyId = $TurnKeyId; workerHost = $WorkerHost } |
        ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8
    $ticketPlain = Get-PlainSecret $ticketSecret
    $payload = @{ SFU_APP_ID = $SfuAppId; SFU_APP_SECRET = $sfuPlain; TURN_KEY_ID = $TurnKeyId; TURN_API_TOKEN = $turnPlain; REALTIME_TICKET_SECRET = $ticketPlain } | ConvertTo-Json -Compress
    $payload | & node $wrangler secret bulk
    Assert-Command "L'installation des secrets"
    $payload = $sfuPlain = $turnPlain = $ticketPlain = $null

    $health = Invoke-RestMethod -Uri "https://$WorkerHost/health" -TimeoutSec 30
    if ($health.service -ne 'weblogbook-radio' -or $health.protocol -ne 1) { throw 'Le Worker attendu ne repond pas a cette adresse.' }
    Write-Host ''
    Write-Host 'Worker deploye et endpoint HTTP verifie. Le site et les essais audio restent a terminer.'
    Write-Host "CLOUDFLARE_REALTIME_URL = wss://$WorkerHost/connect"
    Write-Host 'Pour copier le secret a saisir dans Vercel : .\setup.ps1 -CopySiteSecret'
    Write-Host 'Le secret local est chiffre pour votre utilisateur Windows dans .setup (ignore par Git).'
} finally {
    $payload = $sfuPlain = $turnPlain = $ticketPlain = $null
    foreach ($secret in @($sfuSecret, $turnSecret, $ticketSecret)) { if ($null -ne $secret) { $secret.Dispose() } }
    $env:CLOUDFLARE_ACCOUNT_ID = $previousAccount
    $env:WRANGLER_LOG = $previousLog
    $OutputEncoding = $previousEncoding
    Pop-Location
}
