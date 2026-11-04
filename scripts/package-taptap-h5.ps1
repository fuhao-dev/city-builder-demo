param(
    [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot),
    [string]$OutputRoot = '',
    [string]$Version = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$repoPath = [IO.Path]::GetFullPath($RepoRoot)
if (-not $Version) {
    $versionMatch = [regex]::Match((Get-Content -LiteralPath (Join-Path $repoPath 'index.html') -Raw), 'v(\d+\.\d+\.\d+)')
    if (-not $versionMatch.Success) { throw 'Could not determine version from index.html.' }
    $Version = $versionMatch.Groups[1].Value
}
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw 'Version must use major.minor.patch.' }
if (-not $OutputRoot) {
    $OutputRoot = Join-Path (Split-Path -Parent $repoPath) "outputs/taptap-h5-v$Version"
}
$outPath = [IO.Path]::GetFullPath($OutputRoot)
$stagePath = Join-Path $outPath 'payload\loop-town'
$verifyRoot = Join-Path $outPath 'verified-extraction'
$archivePath = Join-Path $outPath "loop-town-v$Version-taptap-h5.zip"
if ((Test-Path -LiteralPath $archivePath) -or (Test-Path -LiteralPath $stagePath) -or (Test-Path -LiteralPath $verifyRoot)) {
    throw 'Output already exists; use a new OutputRoot to preserve the previous build.'
}

$runtimeFiles = @(
    'index.html', 'style.css', 'game.js', 'progress.js', 'loadouts.js',
    'onboarding.js', 'audio.js', 'saves.js', 'cloud-save.js', 'save-ui.js', 'ui.js', 'favicon.ico', 'LICENSE',
    'assets/brand/loop-town-wordmark.png',
    'assets/intro/town-dawn.svg',
    'assets/icons/favicon-32.png', 'assets/icons/icon-192.png',
    'assets/icons/apple-touch-icon.png'
)
New-Item -ItemType Directory -Path $stagePath -Force | Out-Null
$files = @()
foreach ($relativePath in $runtimeFiles) {
    $source = Join-Path $repoPath $relativePath
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Missing file: $relativePath" }
    $target = Join-Path $stagePath $relativePath
    New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
    Copy-Item -LiteralPath $source -Destination $target
    $files += [ordered]@{
        path = "loop-town/$relativePath"
        bytes = (Get-Item -LiteralPath $target).Length
        sha256 = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
    }
}

$archive = [IO.Compression.ZipFile]::Open($archivePath, [IO.Compression.ZipArchiveMode]::Create)
try {
    $null = $archive.CreateEntry('loop-town/')
    foreach ($relativePath in $runtimeFiles) {
        $null = [IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $archive, (Join-Path $stagePath $relativePath), "loop-town/$relativePath",
            [IO.Compression.CompressionLevel]::Optimal
        )
    }
} finally { $archive.Dispose() }

$archiveInfo = Get-Item -LiteralPath $archivePath
if ($archiveInfo.Length -gt 300000000) { throw 'ZIP exceeds the screenshot limit of 300 MB.' }
$archive = [IO.Compression.ZipFile]::OpenRead($archivePath)
try {
    $entryNames = @($archive.Entries | ForEach-Object { $_.FullName })
    $topFolders = @($entryNames | ForEach-Object { ($_ -split '/')[0] } | Select-Object -Unique)
    if ($topFolders.Count -ne 1 -or $topFolders[0] -ne 'loop-town') { throw 'ZIP must contain exactly one top-level folder.' }
    if ($entryNames -notcontains 'loop-town/index.html') { throw 'Missing entry point.' }
    foreach ($entry in $entryNames) {
        if ($entry.Contains('\') -or $entry.Contains('..') -or $entry.StartsWith('/')) { throw "Unsafe ZIP path: $entry" }
    }
} finally { $archive.Dispose() }

[IO.Compression.ZipFile]::ExtractToDirectory($archivePath, $verifyRoot)
foreach ($file in $files) {
    $actualHash = (Get-FileHash -LiteralPath (Join-Path $verifyRoot $file.path) -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualHash -ne $file.sha256) { throw "Extracted file mismatch: $($file.path)" }
}
$gitCommit = (& git -c "safe.directory=$($repoPath.Replace('\','/'))" -C $repoPath rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Could not determine source commit.' }
$sourceChanges = @(& git -c "safe.directory=$($repoPath.Replace('\','/'))" -C $repoPath status --porcelain)
if ($LASTEXITCODE -ne 0) { throw 'Could not determine source worktree status.' }
$manifest = [ordered]@{
    title = '周目小镇'
    version = $Version
    sourceCommit = $gitCommit
    sourceDirty = $sourceChanges.Count -gt 0
    platform = 'TapTap H5'
    orientationSetting = 'landscape / 横屏（在 TapTap 上传界面选择）'
    archive = $archiveInfo.Name
    archiveBytes = $archiveInfo.Length
    archiveSha256 = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    topLevelFolder = 'loop-town'
    entryPoint = 'loop-town/index.html'
    fileCount = $files.Count
    extractedFileHashesVerified = $true
    containsOnlyRuntimeFilesAndLicense = $true
    files = $files
}
$manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $outPath 'manifest.json') -Encoding utf8NoBOM
[pscustomobject]$manifest | Select-Object title,version,sourceCommit,archive,archiveBytes,archiveSha256,entryPoint,fileCount,extractedFileHashesVerified | ConvertTo-Json
