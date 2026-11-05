param([string]$Version='1.0.0')
$ErrorActionPreference='Stop'
if ($Version -notmatch '^\d+\.\d+\.\d+(?:-[A-Za-z0-9-]+)?$') { throw 'Invalid release version' }
# The player's package: the default proxy DLL per platform, the spare proxies and one license file.
# The loader's own scripts are inside the DLL. The developer tools are a separate zip.
$files=@(
    'PBZModLoader-安装说明.txt'
)
$licenseFile='ProjectPBZ/PBZModLoader/LICENSES.txt'
$licenseParts=@(
    @{Title='PBZModLoader: GNU General Public License, version 3';Path="$PSScriptRoot/LICENSE"},
    @{Title='LLVM runtime libraries in the DLLs';Path="$PSScriptRoot/runtime/ProjectPBZ/PBZModLoader/TOOLCHAIN-LICENSE.txt"},
    @{Title='MinGW-w64 runtime in the DLLs';Path="$PSScriptRoot/runtime/ProjectPBZ/PBZModLoader/COPYING.MinGW-w64-runtime.txt"}
)
$alternatives=@('hid','winmm','dsound','dxgi')
$release=Join-Path $PSScriptRoot "releases/PBZModLoader-$Version-win64"
$zip="$release.zip"
$developerZip=Join-Path $PSScriptRoot "releases/PBZModLoader-$Version-developer.zip"
foreach ($existing in @($release,$zip,$developerZip)) {
    if (Test-Path -LiteralPath $existing) { throw 'Release already exists; choose a new version or archive the existing release first.' }
}
foreach ($relative in $files) {
    if (!(Test-Path -LiteralPath (Join-Path "$PSScriptRoot/runtime" $relative) -PathType Leaf)) { throw "Missing runtime file: $relative" }
}
foreach ($part in $licenseParts) {
    if (!(Test-Path -LiteralPath $part.Path -PathType Leaf)) { throw "Missing license file: $($part.Path)" }
}
foreach($proxy in @('version')+$alternatives) {
    if (!(Test-Path -LiteralPath "$PSScriptRoot/build/$proxy.dll")) { throw "Build $proxy.dll first." }
}
New-Item -ItemType Directory -Path $release | Out-Null
foreach ($relative in $files) {
    $destination=Join-Path $release $relative
    New-Item -ItemType Directory -Force (Split-Path $destination) | Out-Null
    Copy-Item -LiteralPath (Join-Path "$PSScriptRoot/runtime" $relative) -Destination $destination
}
# One file in the game for every license text the DLLs and their source need.
$licenseTarget=Join-Path $release $licenseFile
New-Item -ItemType Directory -Force (Split-Path $licenseTarget) | Out-Null
$rule='='*78
$text=foreach ($part in $licenseParts) { "$rule`n$($part.Title)`n$rule`n`n$((Get-Content -LiteralPath $part.Path -Raw -Encoding utf8).Replace("`r`n","`n").TrimEnd())`n`n" }
[IO.File]::WriteAllText($licenseTarget,($text -join ''),[Text.UTF8Encoding]::new($false))
$files += $licenseFile
foreach ($platform in @('steam','wegame')) {
    $dllRelative="platform/$platform/version.dll"
    $dllDestination=Join-Path $release $dllRelative
    New-Item -ItemType Directory -Force (Split-Path $dllDestination) | Out-Null
    Copy-Item -LiteralPath "$PSScriptRoot/build/version.dll" -Destination $dllDestination
    $files += $dllRelative
}
# Spare proxies, for a game where another tool holds version.dll. Each is a choice, so each has its own
# folder: a mod manager's scanner then sees one part per DLL. Install only one entry.
$alternativePaths=[ordered]@{}
foreach($proxy in $alternatives) {
    $relative="alternative-entries/$proxy/$proxy.dll"
    $destination=Join-Path $release $relative
    New-Item -ItemType Directory -Force (Split-Path $destination) | Out-Null
    Copy-Item -LiteralPath "$PSScriptRoot/build/$proxy.dll" -Destination $destination
    $files += $relative
    $alternativePaths["$proxy.dll"]=$relative
}
$directories=@('ProjectPBZ/PBZModLoader/mods/')
foreach ($relative in $directories) {
    New-Item -ItemType Directory -Force (Join-Path $release $relative) | Out-Null
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($release,$zip,[IO.Compression.CompressionLevel]::Optimal,$false)
$archive=[IO.Compression.ZipFile]::OpenRead($zip)
try {
    $entries=@($archive.Entries | Where-Object { $_.Name } | ForEach-Object { $_.FullName.Replace('\','/') })
    if (Compare-Object ($files | Sort-Object) ($entries | Sort-Object)) { throw 'ZIP entry allowlist mismatch' }
    foreach ($relative in $directories) {
        if (!($archive.Entries | Where-Object { $_.FullName.Replace('\','/') -eq $relative })) { throw "Missing ZIP directory: $relative" }
    }
} finally { $archive.Dispose() }
$verify=Join-Path $PSScriptRoot ('build/zip-check-'+[guid]::NewGuid().ToString('N'))
[IO.Compression.ZipFile]::ExtractToDirectory($zip,$verify)
foreach ($relative in $directories) {
    if (!(Test-Path -LiteralPath (Join-Path $verify $relative) -PathType Container)) { throw "Missing extracted directory: $relative" }
}
$hashes=[ordered]@{}
foreach ($relative in $files) {
    $expected=(Get-FileHash -LiteralPath (Join-Path $release $relative)).Hash
    $actual=(Get-FileHash -LiteralPath (Join-Path $verify $relative)).Hash
    if ($actual -ne $expected) { throw "Extracted content mismatch: $relative" }
    $hashes[$relative]=$actual.ToLower()
}
# For MOD authors: the TypeScript template with its SDK, and the license. Never for the game folder.
$developerDir=Join-Path $PSScriptRoot ('build/developer-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $developerDir | Out-Null
Copy-Item -LiteralPath "$PSScriptRoot/templates/ts-mod" -Destination (Join-Path $developerDir 'ts-mod') -Recurse -Exclude 'node_modules','dist'
Copy-Item -LiteralPath "$PSScriptRoot/LICENSE" -Destination $developerDir
[IO.Compression.ZipFile]::CreateFromDirectory($developerDir,$developerZip,[IO.Compression.CompressionLevel]::Optimal,$false)
# What a mod manager needs: see docs/MOD-MANAGER.md.
[ordered]@{
    version=$Version
    zipSha256=(Get-FileHash -LiteralPath $zip).Hash.ToLower()
    directories=$directories
    files=$hashes
    verified=$true
    entries=[ordered]@{
        default='version.dll'
        locations=[ordered]@{steam='platform/steam/version.dll';wegame='platform/wegame/version.dll'}
        alternatives=$alternativePaths
    }
    owned=@($licenseFile,'ProjectPBZ/PBZModLoader/loader.log')
    playerOwned=@('ProjectPBZ/PBZModLoader/mods/','ProjectPBZ/PBZModLoader/mods.ini')
    oldLayout=@('ProjectPBZ/Content/JavaScript/PBZModLoader/','ProjectPBZ/PBZModLoader/compiler/','ProjectPBZ/PBZModLoader/evidence/','ProjectPBZ/PBZModLoader/TOOLCHAIN-LICENSE.txt')
} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath "$zip.manifest.json" -Encoding utf8
Write-Output "PASS ZIP root layout, exact allowlist ($($files.Count) files), extraction and SHA-256 checks"
Write-Output $zip
Write-Output $developerZip
