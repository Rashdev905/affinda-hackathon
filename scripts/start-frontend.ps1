. (Join-Path $PSScriptRoot 'common.ps1')
Set-PulseNodePath
Set-Location -LiteralPath (Join-Path $PulseRoot 'frontend')
if (-not (Test-Path -LiteralPath 'node_modules\.bin\vite.cmd')) {
    & npm.cmd ci --cache (Join-Path $PulseRoot '.tools\npm-cache')
    if ($LASTEXITCODE -ne 0) { throw 'Website dependencies could not be installed. Check the network and try again.' }
}
& npm.cmd run dev
exit $LASTEXITCODE
