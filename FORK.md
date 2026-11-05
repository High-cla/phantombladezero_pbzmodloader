# About this fork

This repository is a fork of [PBZModLoader](https://github.com/zoneoflkf/PBZModLoader) by LKF, a mod loader for
Phantom Blade Zero. The original downloads are on [Nexus Mods](https://www.nexusmods.com/phantombladezero/mods/113) and
in the [upstream releases](https://github.com/zoneoflkf/PBZModLoader/releases). This fork is unofficial: LKF did not
make it and does not support it. Please report problems with this fork here, not to the author.

## Why it exists

KintaroModding adapts the loader here and releases the result on GitHub. Every change is public, so that the author can
see and check it. The author allowed KintaroModding to change the project, to release it on GitHub and to integrate it
into KintaroModding's mod manager.

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
