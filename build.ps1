param([string]$Compiler='clang++',[switch]$Test,[switch]$VerifyOnly)
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
        node --test tests/manager.test.cjs
        if ($LASTEXITCODE -ne 0) { throw 'JS tests failed' }
        $fixture=Join-Path $PSScriptRoot 'build/proxy-fixture/platform/steam'
        New-Item -ItemType Directory -Force $fixture | Out-Null
        & $Compiler -std=c++17 -O2 -Wall -Wextra -static tests/proxy-host.cpp -lversion -o "$fixture/PBZ.exe"
        if ($LASTEXITCODE -ne 0) { throw 'Proxy host build failed' }
        Copy-Item -LiteralPath build/version.dll -Destination "$fixture/version.dll" -Force
        & "$fixture/PBZ.exe"
        if ($LASTEXITCODE -ne 0) { throw 'Proxy tests failed' }
        $readobj=Join-Path (Split-Path (Get-Command $Compiler).Source) 'llvm-readobj.exe'
        $imports=& $readobj --coff-imports build/version.dll
        if ($LASTEXITCODE -ne 0) { throw 'Import inspection failed' }
        if ($imports -match 'Symbol: (DebugActiveProcess|DebugActiveProcessStop|WaitForDebugEvent|ContinueDebugEvent|DebugSetProcessKillOnExit|CheckRemoteDebuggerPresent|IsDebuggerPresent|CreateProcessW|ReadProcessMemory|WriteProcessMemory|CreateRemoteThread)\b') { throw 'Unexpected debugger or remote process API' }
        $exports=& $readobj --coff-exports build/version.dll
        if ($LASTEXITCODE -ne 0 -or @($exports -match '^Export \{').Count -ne 17) { throw 'Unexpected exports' }
        Write-Output 'PASS DLL import audit and 17 exports'
    }
} finally { Pop-Location }
