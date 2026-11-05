# Installing this loader with a mod manager

For a mod manager that places, tracks and removes files. `PBZModLoader-<version>-win64.zip.manifest.json` carries the same facts in a
form a program can read, with a SHA-256 for every file.

## What goes where

| In the game | Owner | Note |
|---|---|---|
| `<exe folder>/version.dll` (or one alternative) | loader | The whole loader. Its scripts are inside it. |
| `ProjectPBZ/PBZModLoader/LICENSES.txt` | loader | The license texts for the DLLs. |
| `ProjectPBZ/PBZModLoader/loader.log` | loader | Written at each game start. A new file each time, at most about 8 MB. |
| `ProjectPBZ/PBZModLoader/mods/` | player | Created by the DLL when missing. Never delete it on an update. |
| `ProjectPBZ/PBZModLoader/mods.ini` | player | Optional. Created only by a player or a manager, never by the loader. |

The exe folder is `platform/steam` on Steam and `platform/wegame` on WeGame. The DLL finds `ProjectPBZ` by itself, searching upward from the exe.

The loader writes nothing else: no generated scripts, no cache, no per-run folders.

## The packages

| File | For |
|---|---|
| `PBZModLoader-<version>-win64.zip` | Players and managers: `platform/steam/version.dll`, `platform/wegame/version.dll`, `alternative-entries/<name>/<name>.dll` for `hid`, `winmm`, `dsound` and `dxgi`, `ProjectPBZ/PBZModLoader/LICENSES.txt`, the install guide, an empty `mods/`. |
| `PBZModLoader-<version>-developer.zip` | The TypeScript template and SDK for MOD authors. Never for a game folder. |

## Choosing the entry

The manager decides, or offers a selection. The manifest's `entries` names every choice with its path in the zip, and `files` has its SHA-256.

1. Install `version.dll` for the player's store. It is the tested default.
2. If that name next to the exe belongs to another tool, do not overwrite it. Use one alternative with a free name, under its own name, next to the exe.
   Renaming a DLL does not work: each one is built for its own name.
3. Never install two entries. A second one stays inactive and only forwards system calls, which is a safeguard, not a feature.
4. A free name does not prove that the game loads that DLL early enough. `version.dll` is tested on Steam build 26367565. The alternatives passed
   a start test by the original author on an earlier Steam build; check `loader.log` after a change.

## Knowing that it works

`loader.log` is the signal. These lines mean:

| Line | Meaning |
|---|---|
| `[PBZMOD] ready loaded=N failed=M` | The loader runs: N mods loaded, M failed. |
| `MODs skipped: ...; original game continues` | This game build is not supported. The game runs without mods. |
| `disabled <id>: TypeScript source without main.js` | That mod ships no JavaScript. |

A game update can end support, because the loader finds the game's code by its bytes. It does not use fixed addresses, so many patches pass, and it
refuses a build it cannot match. Nothing else needs a change per patch.

## Update and removal

- **Update:** replace the entry DLL and `LICENSES.txt`. Keep `mods/` and `mods.ini`.
- **From version 1.0.0:** also remove the paths in `oldLayout` of the manifest: `ProjectPBZ/Content/JavaScript/PBZModLoader/`,
  `ProjectPBZ/PBZModLoader/compiler/`, `ProjectPBZ/PBZModLoader/evidence/`, `ProjectPBZ/PBZModLoader/TOOLCHAIN-LICENSE.txt`.
- **Removal:** remove the entry DLL, `LICENSES.txt` and `loader.log`. Leave `mods/` and `mods.ini` unless the player asks otherwise, and leave
  any file the manager did not place.

## Mods for this loader

A mod is a folder `ProjectPBZ/PBZModLoader/mods/<id>/` with a `main.js`. `<id>` uses letters, digits, `_` and `-`. Existing mods ship this path in their zips,
so a manager that accepts it installs them as they are.

Pak mods that change game scripts go into `~mods` as always. With this loader they need neither UE4SS nor a separate bypass.
Do not install the loader together with a loader that changes the same script check (for example Mods Menu), as they can conflict.
UE4SS C++ BYPASS runs next to it without a problem, but it is no longer needed.

## With UE MM: the state of `uemodmanager` 1.5.5

Read from its `PackageScanner` and tested with it on this package:

- The zip's default entry already installs correctly as a game file: `platform/<store>/version.dll` for the player's store. The other store's copy stays out.
- Each spare DLL is its own part, because each has its own folder, so the dialog already lets a player choose. **But its defaults tick `version.dll`, `dsound`, `dxgi` and
  `winmm`, and only `hid` starts unticked** (`IsUncertain`, because `hid` is not in `ProxyDllNames`). Without a rule, a player who accepts the defaults gets four entries next to the exe.
  The loader's own guard then lets one hook, and the others only forward, but that is untidy and untested in the game. So the manager needs a rule here: tick only one entry.
- `LICENSES.txt` is not installed: the scanner takes only `Saved`, `Config` and `Content/JavaScript` below the project folder, and it skips documents. That is fine
  for the license, because the player has the zip.
- **Mods for this loader are not installed yet:** the scanner ignores `ProjectPBZ/PBZModLoader/mods/...`, so a zip such as PBZMapMarkers' installs only its Mods Menu copy.
  Accepting `PBZModLoader` next to `Saved` and `Config` in `GameFilePath` would be enough. Keep each mod as its own part (`GamePartFolder`), as it does for scripts.
