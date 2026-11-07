# About this fork

This repository is a fork of [PBZModLoader](https://github.com/zoneoflkf/PBZModLoader) by LKF, a mod loader for
Phantom Blade Zero. The original downloads are on [Nexus Mods](https://www.nexusmods.com/phantombladezero/mods/113) and
in the [upstream releases](https://github.com/zoneoflkf/PBZModLoader/releases). This is an official fork: LKF gave
KintaroModding the source code, added the license KintaroModding asked for, and trusts KintaroModding to take the project
forward. KintaroModding maintains this fork, so please report problems with it here, not to the author.

## Why it exists

KintaroModding adapts the loader here and releases the result on GitHub. Every change is public, so that the author can
see and check it. The author allowed KintaroModding to change the project, to release it on GitHub and to integrate it
into KintaroModding's mod manager.

## What this fork does differently

The goal is the fewest files in the game. A player installs one DLL, its start file and one license file, and no other tool. [README.md](README.md), this section and
[docs/MOD-MANAGER.md](docs/MOD-MANAGER.md) describe this fork, and `runtime/PBZModLoader-Install-Guide.txt` is its install guide. The original README is in the [upstream repository](https://github.com/zoneoflkf/PBZModLoader).

| | Upstream 1.0.0 | This fork |
|---|---|---|
| Player package | 122 files, 13.4 MB | 9 files, about 3.4 MB, of which a player needs 3 in the game; developer tools in their own zip |
| Loader scripts | loose `bootstrap.js` and `manager.js` | inside the DLL; a 32 KiB placeholder `bootstrap.js` gives them their name |
| Mods Menu 0.9.0 | runs beside it in chain mode, by Mods Menu's own tests | runs beside it in chain mode, tested in the game with this fork |
| Mods | copied to `Content/JavaScript/.../generated-mods` at each start | loaded from `PBZModLoader/mods`, no copies |
| Hot reload | copied to `generated-reloads` | no copies: each reload spells the root path differently, so the game's module cache sees new modules |
| TypeScript | compiled at game start by a bundled compiler | authors ship JavaScript; a TypeScript-only mod is reported in the log |
| Settings | `mods.ini` required, `generated-config.js` written | `mods.ini` optional, nothing generated |
| Log | a new folder per run | one `loader.log` per start, about 8 MB at most |
| Pak mods that change game scripts | refused by the game | allowed; `[Loader] AllowScriptPaks=0` turns it off |

How the scripts reach the game without a script file: the game asks for its first module on disk. The loader names its start file,
`Content/JavaScript/PBZModLoader/bootstrap.js` (module `PBZModLoader/bootstrap`, the name upstream uses), and replaces its bytes at the existing validator
call, inside that file's own memory, after the game read it and before the game turns it into text. Later reads of that file answer with the current MOD list.
The file is a 32 KiB placeholder made by `scripts/embed-script.cjs`: its size is the room for the script and the list. It exists because Mods Menu 0.9.0
runs beside a loader only when that file exists, and then starts it by that name. Without the file, the loader names a game script that nothing else uses
(`SCRIPT_SLOTS` in `src/signatures.hpp`, checked against the game's own script list), as 2.0.x did.

Limits of this design: an old mod instance that calls `require` after a reload reads the file as it is now, because no old copy exists. Hot reload has about
4000 spellings per game run. A build whose script validators are missing is refused, so builds before 2026-11-04 are not supported.

Not tested yet: the reflection tools that regenerate the SDK after a game update (`scripts/REFLECTION.md`). Their scripts name no loader paths, and their guide now names the new ones, but nobody has run them on this layout.

## License

The author published the project under the GNU General Public License, version 3, on 2026-11-05 (upstream commit
[`7dfcd14`](https://github.com/zoneoflkf/PBZModLoader/commit/7dfcd14d267c2aa0b8983bf52cc48471afabe3a5)). `LICENSE` here
is the author's file, and the changes of this fork are under the same license.

`openmods.json` and `openmods.md` are placeholders. This fork is not listed on openmods. The cover is the author's own
image, unchanged: `docs/images/pbzmodloader-cover.png`.

## Base

The branch `release` starts at upstream commit
[`daef5ae4b893354b5a52de2ad64c7d7ee4d17eba`](https://github.com/zoneoflkf/PBZModLoader/commit/daef5ae4b893354b5a52de2ad64c7d7ee4d17eba)
(2026-11-05). Its code is the same as upstream release `v1.0.0`; the commits after that tag change only documentation
and the install text. Since 2026-11-05 it also holds upstream commit
[`c7bafdb399778469ef7f3c5d2f182d8650563270`](https://github.com/zoneoflkf/PBZModLoader/commit/c7bafdb399778469ef7f3c5d2f182d8650563270)
(merged), which adds the license. All upstream commits are kept unchanged, so `git log` shows each change of this fork
on top of them.

## Changes

| Date | Files | Change |
|---|---|---|
| 2026-11-05 | `FORK.md`, `LICENSE`, `openmods.json`, `openmods.md` | Added, `LICENSE` as a placeholder. No file of the author changed; the loader code is unchanged. |
| 2026-11-05 | `LICENSE`, `FORK.md` | The placeholder is replaced by the author's GPL-3.0 file, merged from upstream. |
| 2026-11-05 | `src/signatures.hpp`, `tests/signatures.cpp` | The loader also finds a script validator that another tool has already hooked with a 5-byte jump. Before this, the loader skipped all mods when such a tool started first (seen with UE4SS C++ BYPASS). Any other changed entry byte is still rejected. |
| 2026-11-05 | `src/`, `scripts/embed-script.cjs`, `build.ps1`, `package.ps1`, `runtime/`, `tests/`, `docs/MOD-MANAGER.md`, READMEs, template README | The layout described in "What this fork does differently". `runtime/.../bootstrap.js` and `manager.js` moved to `src/script-bootstrap.js` and `src/script-manager.js`. |
| 2026-11-05 | `runtime/PBZModLoader-Install-Guide.txt`, `scripts/PhantomBladeZero-*.cmd` | File names in English only: `PBZModLoader-安装说明.txt`, `影之刃零-恢复1280x720.cmd`, `影之刃零-最大化.cmd` and `影之刃零-窗口模式1280x720.cmd` renamed. Content unchanged. |
| 2026-11-05 | `README.md`, `templates/ts-mod/README.md`, `sdk/README.md` | English first, Chinese further down. `README.md` is rewritten for this fork in both languages, and `README.en.md` is gone. The two guides have an English translation; their Chinese text is the author's, with the outdated version, TypeScript and game build lines corrected. |
| 2026-11-05 | `src/script-manager.js`, `tests/manager.test.cjs` | The Alt+F5 message on screen is English, then a dash, then the author's Chinese text. Its box is wider, 1600 instead of 800, so that the longer text fits. |
| 2026-11-05 | `README.md`, `FORK.md`, `openmods.json` | The texts now call this an official fork: the author gave the source code, added the license and trusts KintaroModding to take the project forward. |
| 2026-11-07 | `src/signatures.hpp`, `src/proxy.cpp`, `scripts/embed-script.cjs`, `package.ps1`, `tests/`, READMEs, install guide, `docs/MOD-MANAGER.md` | Version 2.1.0. The package ships the placeholder start file `ProjectPBZ/Content/JavaScript/PBZModLoader/bootstrap.js`, and the loader starts from it as `PBZModLoader/bootstrap`, so Mods Menu 0.9.0 runs beside it. `oldLayout` no longer removes that folder, only the files 1.0.x left in it. |

## Build

The unchanged upstream code reproduces the official `v1.0.0` DLLs, except for the build date, with
[llvm-mingw](https://github.com/mstorsjo/llvm-mingw) `20261020` (UCRT, x86_64; clang 23.1.4) and PowerShell 7. This fork
builds with the same tools: `build.ps1` and `package.ps1` as `README.md` describes them. They do not run in
Windows PowerShell 5.1.
