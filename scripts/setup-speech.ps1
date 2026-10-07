. (Join-Path $PSScriptRoot 'common.ps1')
Set-Location -LiteralPath (Join-Path $PulseRoot 'backend')
$env:HF_HOME = Join-Path $PulseRoot '.tools\huggingface'
$env:HF_HUB_DISABLE_TELEMETRY = '1'
& (Get-PulsePython) -m app.services.transcription
if ($LASTEXITCODE -ne 0) { throw 'Local speech model setup failed.' }
