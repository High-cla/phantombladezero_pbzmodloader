param([string]$Version='0.3.0-preview')
$ErrorActionPreference='Stop'
if ($Version -notmatch '^\d+\.\d+\.\d+(?:-[A-Za-z0-9-]+)?$') { throw 'Invalid release version' }
$files=@(
    'PBZModLoader-安装说明.txt',
    'ProjectPBZ/Mods/PBZModLoader/mods.ini',
    'ProjectPBZ/Mods/PBZModLoader/TOOLCHAIN-LICENSE.txt',
    'ProjectPBZ/Content/JavaScript/PBZModLoader/bootstrap.js',
    'ProjectPBZ/Content/JavaScript/PBZModLoader/manager.js',
    'ProjectPBZ/Mods/PBZModLoader/mods/hello/main.js',
    'ProjectPBZ/Mods/PBZModLoader/mods/world-watch/main.js'
)
$release=Join-Path $PSScriptRoot "releases/PBZModLoader-$Version-win64"
$zip="$release.zip"
if ((Test-Path -LiteralPath $release) -or (Test-Path -LiteralPath $zip)) { throw 'Release already exists; choose a new version or archive the existing release first.' }
foreach ($relative in $files) {
    if (!(Test-Path -LiteralPath (Join-Path "$PSScriptRoot/runtime" $relative) -PathType Leaf)) { throw "Missing runtime file: $relative" }
}
if (!(Test-Path -LiteralPath "$PSScriptRoot/build/version.dll")) { throw 'Build DLL first.' }
New-Item -ItemType Directory -Path $release | Out-Null
foreach ($relative in $files) {
    $destination=Join-Path $release $relative
    New-Item -ItemType Directory -Force (Split-Path $destination) | Out-Null
    Copy-Item -LiteralPath (Join-Path "$PSScriptRoot/runtime" $relative) -Destination $destination
}
Copy-Item -LiteralPath "$PSScriptRoot/build/version.dll" -Destination "$release/version.dll"
$files += 'version.dll'
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($release,$zip,[IO.Compression.CompressionLevel]::Optimal,$false)
$archive=[IO.Compression.ZipFile]::OpenRead($zip)
try {
    $entries=@($archive.Entries | Where-Object { $_.Name } | ForEach-Object { $_.FullName.Replace('\','/') })
    if (Compare-Object ($files | Sort-Object) ($entries | Sort-Object)) { throw 'ZIP entry allowlist mismatch' }
} finally { $archive.Dispose() }
$verify=Join-Path $PSScriptRoot ('build/zip-check-'+[guid]::NewGuid().ToString('N'))
[IO.Compression.ZipFile]::ExtractToDirectory($zip,$verify)
$hashes=[ordered]@{}
foreach ($relative in $files) {
    $expected=(Get-FileHash -LiteralPath (Join-Path $release $relative)).Hash
    $actual=(Get-FileHash -LiteralPath (Join-Path $verify $relative)).Hash
    if ($actual -ne $expected) { throw "Extracted content mismatch: $relative" }
    $hashes[$relative]=$actual.ToLower()
}
[ordered]@{version=$Version;zipSha256=(Get-FileHash -LiteralPath $zip).Hash.ToLower();files=$hashes;verified=$true} |
    ConvertTo-Json -Depth 5 | Set-Content -LiteralPath "$zip.manifest.json" -Encoding utf8
Write-Output "PASS ZIP root layout, exact allowlist ($($files.Count) files), extraction and SHA-256 checks"
Write-Output $zip
