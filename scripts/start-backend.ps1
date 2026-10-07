param([switch]$Lan)
. (Join-Path $PSScriptRoot 'common.ps1')
Set-Location -LiteralPath (Join-Path $PulseRoot 'backend')
$bindAddress = '127.0.0.1'
if ($Lan) {
    $bindAddress = '0.0.0.0'
    Write-Output 'Phone and PC must be on the same Wi-Fi. In the app Connection tab, use one of these PC addresses:'
    Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -ne '127.0.0.1' -and $_.IPAddress -notlike '169.254.*' } |
        ForEach-Object { Write-Output "  http://$($_.IPAddress):8000  ($($_.InterfaceAlias))" }
}
& (Get-PulsePython) -m uvicorn app.main:app --reload --host $bindAddress --port 8000
exit $LASTEXITCODE
