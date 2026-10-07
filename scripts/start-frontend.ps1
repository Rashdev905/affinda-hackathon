# The primary frontend is now the native phone app.
& (Join-Path $PSScriptRoot 'start-mobile.ps1')
exit $LASTEXITCODE
