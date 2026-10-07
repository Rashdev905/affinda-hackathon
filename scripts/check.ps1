. (Join-Path $PSScriptRoot 'common.ps1')
Set-Location -LiteralPath (Join-Path $PulseRoot 'backend')
& (Get-PulsePython) -m pytest -q
if ($LASTEXITCODE -ne 0) { throw 'Backend tests failed.' }
Set-PulseNodePath
Set-Location -LiteralPath (Join-Path $PulseRoot 'mobile')
& npm.cmd run typecheck
if ($LASTEXITCODE -ne 0) { throw 'Mobile type checks failed.' }
& npm.cmd test
if ($LASTEXITCODE -ne 0) { throw 'Native UI tests failed.' }
