# About this fork

This repository is a fork of [PBZModLoader](https://github.com/zoneoflkf/PBZModLoader) by LKF, a mod loader for
Phantom Blade Zero. The original downloads are on [Nexus Mods](https://www.nexusmods.com/phantombladezero/mods/113) and
in the [upstream releases](https://github.com/zoneoflkf/PBZModLoader/releases). This fork is unofficial: LKF did not
make it and does not support it. Please report problems with this fork here, not to the author.

## Why it exists

KintaroModding adapts the loader here and releases the result on GitHub. Every change is public, so that the author can
see and check it. The author allowed KintaroModding to change the project, to release it on GitHub and to integrate it
into KintaroModding's mod manager.

## What this fork does differently

The goal is the fewest files in the game. A player installs one DLL and one license file, and no other tool. The upstream READMEs below still describe
the upstream layout; this section and [docs/MOD-MANAGER.md](docs/MOD-MANAGER.md) describe this fork, and `runtime/PBZModLoader-安装说明.txt` is its install guide.

| | Upstream 1.0.0 | This fork |
|---|---|---|
| Player package | 122 files, 13.4 MB | 4 files, 1.1 MB; spare proxies and developer tools in their own zips |
| Loader scripts | loose `bootstrap.js` and `manager.js` | inside the DLL |
| Mods | copied to `Content/JavaScript/.../generated-mods` at each start | loaded from `PBZModLoader/mods`, no copies |
| Hot reload | copied to `generated-reloads` | no copies: each reload spells the root path differently, so the game's module cache sees new modules |
| TypeScript | compiled at game start by a bundled compiler | authors ship JavaScript; a TypeScript-only mod is reported in the log |
| Settings | `mods.ini` required, `generated-config.js` written | `mods.ini` optional, nothing generated |
| Log | a new folder per run | one `loader.log` per start, about 8 MB at most |
| Pak mods that change game scripts | refused by the game | allowed; `[Loader] AllowScriptPaks=0` turns it off |

How the scripts reach the game without a file: the game asks for its first module on disk. The loader names a game script that nothing else uses
(`SCRIPT_SLOTS` in `src/signatures.hpp`, checked against the game's own script list) and replaces its bytes at the existing validator call, inside that script's own
memory, after the game read it and before the game turns it into text. Later reads of that script answer with the current MOD list.

Limits of this design: an old mod instance that calls `require` after a reload reads the file as it is now, because no old copy exists. Hot reload has about
4000 spellings per game run. A build whose script validators are missing is refused, so builds before 2026-11-04 are not supported.

Not updated yet: the reflection tools in `scripts/` (`REFLECTION.md`, `load-types-probe.js`) still expect the upstream layout. To regenerate the SDK, use upstream `v1.0.0`.

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

## Build

The unchanged upstream code reproduces the official `v1.0.0` DLLs, except for the build date, with
[llvm-mingw](https://github.com/mstorsjo/llvm-mingw) `20261020` (UCRT, x86_64; clang 23.1.4) and PowerShell 7. This fork
builds with the same tools: `build.ps1` and `package.ps1` as the upstream README describes them. They do not run in
Windows PowerShell 5.1.
