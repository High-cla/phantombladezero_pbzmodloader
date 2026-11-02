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
- sdk：反射生成的 UE/PuerTS 类型声明、实测补充及构建清单，仅供 MOD 开发引用。
- tests：原生、代理 DLL、JS 和运行验收工具。
- build：编译输出及测试产物，不直接给玩家。
- releases：玩家目录及 ZIP；只从明确的文件白名单打包。
- archive：整理前的开发目录、旧原型与历史证据备份，不参与构建或发布。

## 开发与打包

开发自己的 TS MOD 可从 [最小开发模板](templates/ts-mod/README.md) 开始：复制 `templates/ts-mod/`，
在副本中执行 `npm ci`、`npm run check`、`npm run build`，将输出的 `dist/my-mod/` 安装到
游戏的 `ProjectPBZ/PBZModLoader/mods/`。模板独立维护开发依赖，不需要编译加载器 DLL。

模板已通过本地开发依赖引用 [游戏 API SDK](sdk/README.md)，直接 `import ... from 'ue'` / `'puerts'`
即可获得补全和类型检查。SDK 0.3.2 基于 Steam 构建 CL-301524_JKS-17219 的场景与分批资产反射采集，
包含 34,597 个类型、49,540 个函数和 119,260 个已映射属性，并保留实测补充接口；
生成覆盖、未解析项与调用验证分别记录，详见 SDK 说明。
已有 MOD 可运行 `npm run sdk:pack`，将 `build/sdk/` 中的 npm 包安装为开发依赖；迁移步骤见 SDK 说明。
维护者修改 `sdk/` 后运行 `npm run sdk:sync` 更新模板副本，再执行 `npm test`。

开发者可使用[只读反射导出工具](scripts/REFLECTION.md)，采集当前构建的原生类型与已加载蓝图，
输出完整元数据清单、数量统计和解析失败报告。使用 `npm run sdk:generate -- <reflection.json> [<reflection.json> ...]`
可转换为 PuerTS 类型声明；随后同步模板、运行测试并打包。

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
供原有 PuerTS 搜索路径加载；该缓存每次启动重建，不应直接编辑。运行中按 Alt+F5 可触发热重载，详见下文。
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

启动时使用随包提供的原生 TypeScript 编译器生成 ES2020/CommonJS，产物位于 `Content/JavaScript/PBZModLoader/generated-mods/`，不覆盖源码。每次启动重建缓存。编译只转换语法，不执行完整类型检查；语法错误、编译器缺失或超时会禁用本次启动中的对应 MOD，诊断写入加载器日志及缓存中的 `compile.log`。引用文件应位于入口目录内，运行时依赖仍须随 MOD 提供。

构建前运行 `npm ci`；`build.ps1` 自动准备随包编译器及许可证，玩家不需要安装 Node.js。

### MOD 热重载

安装新版 DLL、bootstrap.js 和 manager.js 并启动游戏后，保存 `ProjectPBZ/PBZModLoader/mods/` 下的 JS/TS 或依赖文件，切回游戏按 **Alt+F5**。仅游戏窗口在前台时响应，按住不连发，不监听文件变化。JS 线程每秒接收一次重载请求，TS 会先编译。本地构建的 MOD 需先把新产物覆盖到安装目录。完成后左上角显示约 4 秒提示，区分成功、失败或跳过；提示不拦截鼠标。

每次快捷键重载整组 MOD（包括未修改的 MOD），以独立版本目录隔离 CommonJS 入口及相对依赖缓存。加载新入口前，先调用并等待所有旧实例导出的 `stop()`，支持 Promise；MOD 须在其中清除定时器、取消事件订阅并释放持有的资源。无持久资源的 MOD 也应导出空 `stop()`。缺少该函数或清理抛错时保留旧实例并跳过该 MOD，新版本不会重复注册。挂起的 stop 会等待其完成，期间不会启动另一轮重载。切图和游戏退出不触发 stop。

新增、删除及 `[Mods] ID=0` 的变化按 Alt+F5 后同样生效；删除或禁用前也会调用 stop。TS 编译失败时保留旧实例并显示失败提示，修复后再次按 Alt+F5 重试。请保存完成后再触发重载，编译期间避免继续改写文件。JS 入口执行异常可能已经产生副作用且无法取得其导出，因此失败实例在本次游戏运行中不再自动重试，修复后需重启。MOD 应自行清理初始化失败前产生的资源。

临时产物在 `Content/JavaScript/PBZModLoader/generated-reloads/`，版本目录保留至下一次启动清理，以支持旧实例和延迟 require；长时间大量重载会增加磁盘和模块缓存占用。仅 MOD 目录内的相对依赖随版本隔离，勿用加载器缓存绝对路径跨版本引用。日志查找 `hot reload published`、`stopped`、`reload complete` 和 `reload blocked`。2026-10-29 已通过 24 项 JS 测试、原生与代理宿主回归，并在 Steam 游戏主菜单以 1280×720 窗口模式验证当时的 Ctrl+F5 热键、依赖更新、stop 顺序、旧定时器停止、成功/失败屏幕提示和编译失败保留旧实例；本次未验证切图。实测证据保存在 build/hot-reload-evidence。
