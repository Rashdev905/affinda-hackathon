param([switch]$Clear, [switch]$DevClient, [string]$HostAddress)
. (Join-Path $PSScriptRoot 'common.ps1')
Set-PulseNodePath
$env:EXPO_NO_TELEMETRY = '1'
$env:EXPO_HOME = Join-Path $PulseRoot '.tools\expo'
if ($HostAddress) {
    $env:REACT_NATIVE_PACKAGER_HOSTNAME = $HostAddress
} elseif (-not $env:REACT_NATIVE_PACKAGER_HOSTNAME) {
    $wifi = Get-NetIPConfiguration -ErrorAction SilentlyContinue |
        Where-Object { $_.InterfaceAlias -like '*Wi-Fi*' -and $_.IPv4DefaultGateway } |
        Select-Object -First 1
    if ($wifi) { $env:REACT_NATIVE_PACKAGER_HOSTNAME = $wifi.IPv4Address.IPAddress }
}
if ($env:REACT_NATIVE_PACKAGER_HOSTNAME) {
    Write-Output "Phone connection: exp://$($env:REACT_NATIVE_PACKAGER_HOSTNAME):8081"
}
Set-Location -LiteralPath (Join-Path $PulseRoot 'mobile')
$expoArgs = @('start', '--lan')
if ($DevClient) { $expoArgs += '--dev-client' } else { $expoArgs += '--go' }
if ($Clear) { $expoArgs += '--clear' }
& node node_modules/expo/bin/cli @expoArgs
exit $LASTEXITCODE
