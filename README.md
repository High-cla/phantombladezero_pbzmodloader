# PBZModLoader 主工程

这是后续开发入口。玩家运行包位于 releases，游戏安装目录只保留运行文件。

## 目录

- src：原生 DLL 源码，无旧启动器源码。
- runtime：玩家文件模板，按游戏根目录布局；JS 管理器也在此维护。
- typescript：示例 MOD 的 TS 源码。
- tests：原生、代理 DLL、JS 和运行验收工具。
- build：编译输出及测试产物，不直接给玩家。
- releases：玩家目录及 ZIP；只从明确的文件白名单打包。
- archive：整理前的开发目录、旧原型与历史证据备份，不参与构建或发布。

## 开发与打包

```powershell
npm ci
npm run build:mods
.\build.ps1 -Compiler C:\path\to\llvm-mingw\bin\clang++.exe -Test
.\package.ps1 -Version 0.2.1
```

TS 输出到 runtime/ProjectPBZ/Content/JavaScript/PBZModLoader/mods。
原生编译输出 build/version.dll。-VerifyOnly -Test 可检查已有 DLL 而不重新编译它。
package.ps1 拒绝覆盖已有版本，并检查 ZIP 根目录、白名单及解压后全部文件哈希。
发布前仍需对新代码进行实际 Steam 启动和切图验收；静态及宿主测试不能替代游戏实测。

首个整理版 0.2.0 使用此前通过完整 Steam 实测的同一个 DLL，未重新编译或修改游戏内代码。
其 SHA-256 为 0727d3c15b7453425df0538f30de9a6e6372e03ba9e41da4e77ee425ad0cb54b。
来源记录为 build/tested-build-info.json；完整游戏证据保存在 archive/installed-development-0.2/evidence/20261029-132016-33200-dll。

玩家不需要本主工程、Node.js、编译器、Python、独立启动器或测试观察器。
玩家安装、配置及卸载说明在 runtime/PBZModLoader-安装说明.txt，并随 ZIP 发布。
