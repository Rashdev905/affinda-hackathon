$ErrorActionPreference = 'Stop'
$script:PulseRoot = Split-Path -Parent $PSScriptRoot
$env:npm_config_cache = Join-Path $script:PulseRoot '.tools\npm-cache'

function Set-PulseNodePath {
    $localNode = Get-ChildItem -LiteralPath (Join-Path $script:PulseRoot '.tools') -Directory -Filter 'node-*-win-x64' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($localNode) {
        $env:Path = $localNode.FullName + ';' + $env:Path
        return
    }
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        throw 'Node.js 22.12+ is required. Install Node, or run scripts/setup.ps1 -InstallLocalNode.'
    }
}

function Get-PulsePython {
    $pythonPath = Join-Path $script:PulseRoot 'backend\.venv\Scripts\python.exe'
    if (-not (Test-Path -LiteralPath $pythonPath)) {
        throw 'The project virtual environment is missing. Run scripts/setup.ps1 first.'
    }
    return $pythonPath
}
