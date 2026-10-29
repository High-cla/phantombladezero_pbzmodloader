# PBZModLoader 主工程

这是后续开发入口。玩家运行包位于 releases，游戏安装目录只保留运行文件。

## 0.3.0-preview：平台无关引导

DLL 不再检查 Steam 路径、进程文件名或固定 EXE 哈希。将 version.dll 放在实际游戏进程的 EXE 旁；
从该 EXE 目录向上寻找含 Content、加载器配置和 bootstrap.js 的 ProjectPBZ。
启动壳进程、未知构建和错误安装不会通过完整特征校验。必须由游戏在 EXE 入口执行前加载代理 DLL。

src/signatures.hpp 仅扫描可执行 PE 节，使用带通配符的指令序列，结合 MainStart 字符串、
Start 跳板指令、JSLogger.cpp 源文件引用、日志等级和共享日志类别地址定位挂钩。
所有匹配必须唯一，引用须位于有效 PE 节，所有挂钩验证完成后才修改游戏代码。
跳板及调用原始字节从实际匹配位置取得，不再依赖固定 RVA 或固定相对位移。
特征不匹配或歧义时跳过 MOD，继续原游戏；不会回退到旧固定地址。

这组特征来自 CL-301524_JKS-17219，允许地址和相对位移变化，但不是任意版本的通用 ABI。
编译器、运行时结构或保护机制变化仍可能需要新特征。WeGame 尚无实机验证；测试中的
platform/wegame 只是目录布局夹具，并非对 WeGame 实际目录、DLL 加载行为的断言。

新增检查：
```powershell
.\build.ps1 -Compiler C:\path\to\clang++.exe -Test -GameExe C:\path\to\PBZ.exe
.\package.ps1 -Version 0.3.0-preview
```
-GameExe 只读文件，不启动或修改游戏；该回归测试针对已知 Steam 基准文件，
验证扫描结果、地址重排、ASLR、调用位移变化及歧义/损坏拒绝。
安装包顶层为 ProjectPBZ、platform 和安装说明，DLL 位于 platform/steam/version.dll。
Steam 首次安装可直接解压到游戏根目录，合并同名文件夹，DLL 随包放到 PBZ.exe 旁。
WeGame 只需合并 ProjectPBZ，再将包内 platform/steam/version.dll 手动放到实际游戏 EXE 旁；
不假定 WeGame 的目录结构。遇到已有同名 DLL 应先确认来源，更新时保留自己的配置和 MOD。
当前新版通过静态匹配、原生/JS 测试及多布局代理宿主测试，尚待实际游戏启动、切图和退出验收。

## 目录

- src：原生 DLL 源码，无旧启动器源码。
- runtime：玩家文件模板，按游戏根目录布局；JS 管理器也在此维护。
- typescript：示例 MOD 的 TS 源码。
- sdk：已实测的 UE/PuerTS 类型声明和构建版本清单，仅供 MOD 开发引用。
- tests：原生、代理 DLL、JS 和运行验收工具。
- build：编译输出及测试产物，不直接给玩家。
- releases：玩家目录及 ZIP；只从明确的文件白名单打包。
- archive：整理前的开发目录、旧原型与历史证据备份，不参与构建或发布。

## 开发与打包

开发自己的 TS MOD 可从 [最小开发模板](templates/ts-mod/README.md) 开始：复制 `templates/ts-mod/`，
在副本中执行 `npm ci`、`npm run check`、`npm run build`，将输出的 `dist/my-mod/` 安装到
游戏的 `ProjectPBZ/PBZModLoader/mods/`。模板独立维护开发依赖，不需要编译加载器 DLL。

模板已通过本地开发依赖引用 [游戏 API SDK](sdk/README.md)，直接 `import ... from 'ue'` / `'puerts'`
即可获得补全和类型检查。SDK 当前为 Steam 构建 CL-301524_JKS-17219 实测后的接口子集，
包括世界、玩家对象、位置和时间等常用读取接口，尚非完整反射导出。
已有 MOD 可运行 `npm run sdk:pack`，将 `build/sdk/` 中的 npm 包安装为开发依赖；迁移步骤见 SDK 说明。
维护者修改 `sdk/` 后运行 `npm run sdk:sync` 更新模板副本，再执行 `npm test`。

开发者可使用[只读反射导出工具](scripts/REFLECTION.md)，采集当前构建的原生类型与已加载蓝图，
输出完整元数据清单、数量统计和解析失败报告。该清单尚未转换为 PuerTS 类型声明。

```powershell
npm ci
npm run build:mods
.\build.ps1 -Compiler C:\path\to\llvm-mingw\bin\clang++.exe -Test
.\package.ps1 -Version 0.3.0-preview
```

TS 输出到 runtime/ProjectPBZ/PBZModLoader/mods。
每次启动自动发现 `mods/<ID>/main.ts` 或 `main.js`，按 ID 排序加载；新增 MOD 无需修改配置。
在 mods.ini 的 `[Mods]` 下设置 `ID=0` 可禁用，删除该行或设为 `1` 恢复。
`[Loader]` 的 Enabled、Version 保留；Count 可省略。旧 Count / Mod.N 配置仍优先按编号加载，
自动发现结果随后追加并去重；`[Mods]` 开关优先于旧项 Enabled。辅助脚本不会作为独立 MOD 加载。
玩家的 mods.ini 与 mods/ 均位于 ProjectPBZ/PBZModLoader，Entry 相对于该目录。
旧版带 Mods 层的目录需整体上移到 ProjectPBZ/PBZModLoader，并同步更新 DLL；
具体迁移步骤见安装说明，mods.ini 中的 Entry 无需修改。
启动时 DLL 校验配置，将 mods/ 同步到 Content/JavaScript/PBZModLoader/generated-mods，
供原有 PuerTS 搜索路径加载；该缓存每次启动重建，不应直接编辑。
Content/JavaScript 下只需随包安装 bootstrap.js 和 manager.js，MOD 源文件无需放在那里。
原生编译输出 build/version.dll。-VerifyOnly -Test 可检查已有 DLL 而不重新编译它。
package.ps1 拒绝覆盖已有版本，并检查 ZIP 根目录、白名单及解压后全部文件哈希。
发布前仍需对新代码进行实际 Steam 启动和切图验收；静态及宿主测试不能替代游戏实测。

首个整理版 0.2.0 使用此前通过完整 Steam 实测的同一个 DLL，未重新编译或修改游戏内代码。
其 SHA-256 为 0727d3c15b7453425df0538f30de9a6e6372e03ba9e41da4e77ee425ad0cb54b。
来源记录为 build/tested-build-info.json；完整游戏证据保存在 archive/installed-development-0.2/evidence/20261029-132016-33200-dll。

玩家不需要本主工程、Node.js、额外安装的编译器、Python、独立启动器或测试观察器。
玩家安装、配置及卸载说明在 runtime/PBZModLoader-安装说明.txt，并随 ZIP 发布。

### 启动时编译 TypeScript

将 `main.ts` 及它引用的 `.ts`/`.js` 文件放在 `mods/<MOD ID>/`，自动发现时优先使用 `main.ts`，没有时使用 `main.js`。显式 INI Entry 可以选择 `.ts` 或 `.js`。

启动时使用随包提供的原生 TypeScript 编译器生成 ES2020/CommonJS，产物位于 `Content/JavaScript/PBZModLoader/generated-mods/`，不覆盖源码。每次启动重建缓存，不做热重载。编译只转换语法，不执行完整类型检查；语法错误、编译器缺失或超时会禁用本次启动中的对应 MOD，诊断写入加载器日志及缓存中的 `compile.log`。引用文件应位于入口目录内，运行时依赖仍须随 MOD 提供。

构建前运行 `npm ci`；`build.ps1` 自动准备随包编译器及许可证，玩家不需要安装 Node.js。
