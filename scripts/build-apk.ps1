param([string]$ApiUrl, [string]$BuildDirectory)
. (Join-Path $PSScriptRoot 'common.ps1')
Set-PulseNodePath

$sdkPath = Join-Path $PulseRoot '.tools\android-sdk'
if (-not (Test-Path -LiteralPath (Join-Path $sdkPath 'build-tools\36.0.0'))) {
    throw 'Install the Android SDK in .tools/android-sdk first (platform 36, build tools 36.0.0, NDK 27.1.12297006, CMake 3.22.1).'
}
$javaCommand = Get-Command java -ErrorAction Stop
$env:JAVA_HOME = Split-Path -Parent (Split-Path -Parent $javaCommand.Source)
$env:EXPO_NO_TELEMETRY = '1'
$env:CI = '1'
$env:NODE_ENV = 'production'
$env:APP_VARIANT = 'preview'
if ($ApiUrl) { $env:EXPO_PUBLIC_API_URL = $ApiUrl }
$sourceDirectory = Join-Path $PulseRoot 'mobile'
& node (Join-Path $PSScriptRoot 'check-native-deps.cjs') $sourceDirectory
if ($LASTEXITCODE -ne 0) { throw 'Native dependency compatibility check failed.' }
$buildRecord = Join-Path $PulseRoot '.run\apk-build-root.txt'
if (-not $BuildDirectory) {
    if (Test-Path -LiteralPath $buildRecord) { $BuildDirectory = (Get-Content -LiteralPath $buildRecord -Raw).Trim() }
    if (-not $BuildDirectory) { $BuildDirectory = 'C:\pulse-apk-' + [Guid]::NewGuid().ToString('N').Substring(0,8) }
}
if ($BuildDirectory -notmatch '^C:\\pulse-apk-[0-9a-f]{8}$') {
    throw 'Use an isolated C:\pulse-apk-<8 hex characters> build directory to avoid Windows native path limits.'
}
New-Item -ItemType Directory -Force -Path $BuildDirectory, (Split-Path -Parent $buildRecord) | Out-Null
Set-Content -LiteralPath $buildRecord -Value $BuildDirectory
# Remove only changed/removed package copies before /E sync. Otherwise stale peer
# modules and native source files survive a downgrade in this incremental folder.
$resolvedBuild = (Resolve-Path -LiteralPath $BuildDirectory).Path
if ($resolvedBuild -notmatch '^C:\\pulse-apk-[0-9a-f]{8}$' -or (Get-Item -LiteralPath $resolvedBuild).LinkType) {
    throw 'The isolated Android build folder must be a physical short C: directory.'
}
$oldLockPath = Join-Path $resolvedBuild 'package-lock.json'
if (Test-Path -LiteralPath $oldLockPath) {
    $changedPackages = & node (Join-Path $PSScriptRoot 'changed-native-deps.cjs') $oldLockPath (Join-Path $sourceDirectory 'package-lock.json')
    if ($LASTEXITCODE -ne 0) { throw 'Could not compare isolated dependency lockfiles.' }
    foreach ($relative in ($changedPackages | ConvertFrom-Json)) {
        $target = [IO.Path]::GetFullPath((Join-Path $resolvedBuild $relative))
        if (-not $target.StartsWith($resolvedBuild + '\node_modules\') -or $relative.Contains('..')) {
            throw 'Package cleanup escaped the isolated build dependency folder.'
        }
        if (Test-Path -LiteralPath $target) {
            $resolvedTarget = (Resolve-Path -LiteralPath $target).Path
            if (-not $resolvedTarget.StartsWith($resolvedBuild + '\node_modules\') -or (Get-Item -LiteralPath $target).LinkType) {
                throw 'Refusing to remove a dependency outside the physical isolated build folder.'
            }
            Remove-Item -LiteralPath $resolvedTarget -Recurse -Force
        }
    }
}
$excluded = @((Join-Path $sourceDirectory 'android'), (Join-Path $sourceDirectory 'dist'), (Join-Path $sourceDirectory '.expo'), '.cxx', '.gradle')
# Exclude native Gradle outputs, but preserve packages' shipped JavaScript build/ folders.
$gradleFiles = & node (Join-Path $PSScriptRoot 'native-gradle-files.cjs') (Join-Path $sourceDirectory 'node_modules')
if ($LASTEXITCODE -ne 0) { throw 'Could not enumerate native package build files.' }
foreach ($gradleFile in $gradleFiles) {
    $candidate = Join-Path (Split-Path -Parent $gradleFile) 'build'
    if (Test-Path -LiteralPath $candidate) { $excluded += $candidate }
}
& robocopy.exe $sourceDirectory $BuildDirectory /E /MT:16 /R:1 /W:1 /NFL /NDL /NJH /NJS /NP /XD $excluded
if ($LASTEXITCODE -ge 8) { throw 'Synchronizing the isolated Android build workspace failed.' }
& node (Join-Path $PSScriptRoot 'check-native-deps.cjs') $BuildDirectory
if ($LASTEXITCODE -ne 0) { throw 'Isolated build dependencies do not match the supported SDK.' }
Write-Output "Building the mobile app in $BuildDirectory"

# Windows native tooling needs a short path without spaces. This temporary drive
# maps to this same repository; tool caches stay project-local. Source compilation
# uses the separate short C: folder above because Node resolves drive aliases.
$drive = @('P:', 'Q:', 'R:', 'S:', 'T:') | Where-Object { -not (Test-Path ($_ + '\')) } | Select-Object -First 1
if (-not $drive) { throw 'No free temporary drive letter among P: through T:.' }
& subst.exe $drive $PulseRoot
if ($LASTEXITCODE -ne 0) { throw 'Could not create a temporary short build path.' }
try {
    $shortRoot = $drive + '\'
    $env:ANDROID_HOME = Join-Path $shortRoot '.tools\android-sdk'
    $env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
    $env:GRADLE_USER_HOME = Join-Path $shortRoot '.tools\gradle'
    $env:EXPO_HOME = Join-Path $shortRoot '.tools\expo'
    # React Native resolves dependencies to their physical C: paths. Build the
    # project from that same drive to avoid cross-root code-generation failures;
    # only the SDK and Gradle cache need the short, space-free tool path.
    Set-Location -LiteralPath $BuildDirectory
    $ErrorActionPreference = 'Continue'
    & node node_modules/expo/bin/cli prebuild --platform android --no-install
    $prebuildExit = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($prebuildExit -ne 0) { throw 'Native Android generation failed.' }
    Set-Location android
    $autolinking = Join-Path (Get-Location) 'build\generated\autolinking\autolinking.json'
    if (Test-Path -LiteralPath $autolinking) { Remove-Item -LiteralPath $autolinking -Force }
    # The generated release variant uses the local test keystore, embeds Hermes
    # JavaScript, and starts independently of Expo Go or a Metro development server.
    $ErrorActionPreference = 'Continue'
    & .\gradlew.bat :app:assembleRelease --no-daemon --no-watch-fs --max-workers=2 '-Pkotlin.compiler.execution.strategy=in-process' '-PreactNativeArchitectures=arm64-v8a,armeabi-v7a' --console=plain --stacktrace
    $buildExit = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($buildExit -ne 0) { throw "Android build failed ($buildExit)." }
    $output = Join-Path $PulseRoot 'artifacts'
    New-Item -ItemType Directory -Force -Path $output | Out-Null
    Copy-Item -LiteralPath 'app\build\outputs\apk\release\app-release.apk' -Destination (Join-Path $output 'Pulse-Android.apk') -Force
    Get-FileHash -LiteralPath (Join-Path $output 'Pulse-Android.apk') -Algorithm SHA256 | Format-List
    Write-Output "APK ready: $output\Pulse-Android.apk"
} finally {
    Set-Location -LiteralPath $PulseRoot
    & subst.exe $drive /D
}
