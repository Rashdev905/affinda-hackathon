param([switch]$FromClipboard)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$configPath = Join-Path $projectRoot 'backend\.env'

Write-Output 'Configure Gemini for incident analysis and manager message suggestions.'
Write-Output 'Your key is saved locally in backend/.env (ignored by Git). Do not share that file.'
$secureKey = $null
$keyPointer = [IntPtr]::Zero
try {
    if ($FromClipboard) {
        Write-Output 'Now copy ONLY the API key from Google AI Studio (not this command).'
        Read-Host 'Return here and press Enter to read the clipboard; do not paste the key' | Out-Null
        $apiKey = [string](Get-Clipboard -Raw)
    } else {
        $secureKey = Read-Host 'Paste your Gemini API key (input is hidden)' -AsSecureString
        $keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
        $apiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
    }
    $apiKey = $apiKey.Trim()
    # Accept a copied key surrounded by matching quotes, but never a command or URL.
    if ($apiKey.Length -ge 2 -and (
        ($apiKey.StartsWith('"') -and $apiKey.EndsWith('"')) -or
        ($apiKey.StartsWith("'") -and $apiKey.EndsWith("'"))
    )) {
        $apiKey = $apiKey.Substring(1, $apiKey.Length - 2).Trim()
    }
    if ($apiKey -notmatch '^[A-Za-z0-9_-]+$') {
        throw 'No plain API key received. Copy only the key, without a command, URL, or asterisks. Retry with -FromClipboard to bypass hidden input. Configuration was not changed.'
    }
    $lines = @()
    if (Test-Path -LiteralPath $configPath) {
        $lines = @(Get-Content -LiteralPath $configPath | Where-Object {
            $_ -notmatch '^\s*(GEMINI_API_KEY|PULSE_AI_MODE|PULSE_ALERT_PROVIDER)\s*='
        })
    }
    $lines += @("GEMINI_API_KEY=$apiKey", 'PULSE_AI_MODE=gemini', 'PULSE_ALERT_PROVIDER=gemini')
    [IO.File]::WriteAllLines($configPath, [string[]]$lines, (New-Object Text.UTF8Encoding($false)))
} finally {
    if ($keyPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
    }
    $apiKey = $null
    if ($null -ne $secureKey) { $secureKey.Dispose() }
}
Write-Output 'Saved. Stop the backend with Ctrl+C, then start it again using scripts/start-backend.ps1 -Lan.'
Write-Output 'Use a fresh terminal if you previously set PULSE_AI_MODE or PULSE_ALERT_PROVIDER to mock: terminal settings override this file.'
