param([string]$Compiler='clang++',[switch]$Test,[switch]$VerifyOnly,[string]$GameExe)
$ErrorActionPreference='Stop'
Push-Location $PSScriptRoot
try {
    New-Item -ItemType Directory -Force build | Out-Null
    if (!$VerifyOnly) {
        & $Compiler -std=c++17 -O2 -Wall -Wextra -static -shared src/proxy.cpp src/proxy.S src/version.def -lbcrypt '-Wl,--exclude-all-symbols' -o build/version.dll
        if ($LASTEXITCODE -ne 0) { throw 'DLL build failed' }
    }
    if (!(Test-Path build/version.dll)) { throw 'Missing build/version.dll' }
    if ($Test) {
        & $Compiler -std=c++17 -O2 -Wall -Wextra -static tests/native.cpp -lbcrypt -o build/native-test.exe
        if ($LASTEXITCODE -ne 0) { throw 'Native test build failed' }
        & ./build/native-test.exe
        if ($LASTEXITCODE -ne 0) { throw 'Native tests failed' }
        if ($GameExe) {
            & $Compiler -std=c++17 -O2 -Wall -Wextra -static tests/signatures.cpp -lbcrypt -o build/signature-test.exe
            if ($LASTEXITCODE -ne 0) { throw 'Signature test build failed' }
            & ./build/signature-test.exe $GameExe
            if ($LASTEXITCODE -ne 0) { throw 'Signature tests failed' }
        }
        node --test tests/manager.test.cjs
        if ($LASTEXITCODE -ne 0) { throw 'JS tests failed' }
        foreach ($layout in @('platform/steam','platform/wegame','ProjectPBZ/Binaries/Win64')) {
        $fixtureRoot=Join-Path $PSScriptRoot ('build/proxy-fixture/'+$layout.Replace('/','-'))
        $fixture=Join-Path $fixtureRoot $layout
        $runtime=Join-Path $fixtureRoot 'ProjectPBZ'
        New-Item -ItemType Directory -Force "$runtime/PBZModLoader","$runtime/Content/JavaScript/PBZModLoader" | Out-Null
        Set-Content "$runtime/PBZModLoader/mods.ini" '[Loader]'
        Set-Content "$runtime/Content/JavaScript/PBZModLoader/bootstrap.js" '// fixture'
        New-Item -ItemType Directory -Force $fixture | Out-Null
        & $Compiler -std=c++17 -O2 -Wall -Wextra -static tests/proxy-host.cpp -lversion -o "$fixture/PBZ.exe"
        if ($LASTEXITCODE -ne 0) { throw 'Proxy host build failed' }
        Copy-Item -LiteralPath build/version.dll -Destination "$fixture/version.dll" -Force
        & "$fixture/PBZ.exe"
        if ($LASTEXITCODE -ne 0) { throw 'Proxy tests failed' }
        $logs=@(Get-ChildItem "$runtime/PBZModLoader/evidence" -Filter loader.log -Recurse | Sort-Object LastWriteTime -Descending)
        if (!$logs.Count -or !(Select-String -LiteralPath $logs[0].FullName -SimpleMatch 'MainStart signature requires one validated match; found=0')) { throw 'Missing signature rejection evidence' }
        Write-Output "PASS platform layout: $layout, entry restored and unsupported host skipped"
        }
        $readobj=Join-Path (Split-Path (Get-Command $Compiler).Source) 'llvm-readobj.exe'
        $imports=& $readobj --coff-imports build/version.dll
        if ($LASTEXITCODE -ne 0) { throw 'Import inspection failed' }
        if ($imports -match 'Symbol: (DebugActiveProcess|DebugActiveProcessStop|WaitForDebugEvent|ContinueDebugEvent|DebugSetProcessKillOnExit|CheckRemoteDebuggerPresent|IsDebuggerPresent|CreateProcessW|ReadProcessMemory|WriteProcessMemory|CreateRemoteThread)\b') { throw 'Unexpected debugger or remote process API' }
        $exports=& $readobj --coff-exports build/version.dll
        if ($LASTEXITCODE -ne 0 -or @($exports -match '^Export \{').Count -ne 17) { throw 'Unexpected exports' }
        Write-Output 'PASS DLL import audit and 17 exports'
    }
} finally { Pop-Location }
