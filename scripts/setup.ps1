param([switch]$InstallLocalNode)
. (Join-Path $PSScriptRoot 'common.ps1')
Set-Location -LiteralPath $PulseRoot

if (-not (Test-Path -LiteralPath 'backend\.venv\Scripts\python.exe')) {
    # The system interpreter bootstraps the venv only. All installs and app commands use the venv.
    $bootstrapPython = Get-Command python -ErrorAction Stop
    & $bootstrapPython.Source -m venv backend/.venv
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the Python virtual environment.' }
}
& (Get-PulsePython) -m pip install -r backend/requirements-lock.txt
if ($LASTEXITCODE -ne 0) { throw 'Backend dependency installation failed.' }
& (Join-Path $PSScriptRoot 'setup-speech.ps1')
Set-Location -LiteralPath $PulseRoot

if ($InstallLocalNode) {
    New-Item -ItemType Directory -Force -Path '.tools' | Out-Null
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $releases = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json'
    $release = $releases | Where-Object { $_.lts -and $_.version -like 'v22.*' } | Select-Object -First 1
    $archiveName = "node-$($release.version)-win-x64.zip"
    $archivePath = Join-Path $PulseRoot '.tools\node.zip'
    Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/$($release.version)/$archiveName" -OutFile $archivePath
    $checksums = (Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/$($release.version)/SHASUMS256.txt").Content
    $expected = ($checksums -split "`n" | Where-Object { $_.Trim().EndsWith($archiveName) }) -split '\s+' | Select-Object -First 1
    if (-not $expected -or (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLower() -ne $expected) { throw 'Node archive checksum mismatch.' }
    Expand-Archive -LiteralPath $archivePath -DestinationPath '.tools' -Force
}
Set-PulseNodePath
Set-Location -LiteralPath (Join-Path $PulseRoot 'mobile')
& npm.cmd ci --cache (Join-Path $PulseRoot '.tools\npm-cache')
if ($LASTEXITCODE -ne 0) { throw 'Mobile dependency installation failed.' }
Set-Location -LiteralPath (Join-Path $PulseRoot 'frontend')
& npm.cmd ci --cache (Join-Path $PulseRoot '.tools\npm-cache')
if ($LASTEXITCODE -ne 0) { throw 'Website dependency installation failed.' }
Write-Output 'Pulse is ready. For the manager website, run scripts/start-backend.ps1 and scripts/start-frontend.ps1 in separate terminals.'
