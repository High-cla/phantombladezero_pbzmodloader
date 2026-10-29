# PBZ TypeScript 游戏 API

`@pbz-mod-loader/game-api` 是仅供开发的类型声明包，为 `ue`、`puerts` 和游戏脚本全局提供补全与严格类型检查。
运行时仍由游戏自带的 PuerTS 执行调用；SDK 不包含游戏实现，也不需要安装到玩家目录。

## 在模板中使用

新版 `templates/ts-mod/` 已包含 `vendor/game-api/` 和本地开发依赖。复制整个模板后：

```powershell
npm ci
npm run check
npm run build
```

编写代码时直接引用游戏模块：

```ts
import { argv } from 'puerts';
import { GameplayStatics, KismetSystemLibrary } from 'ue';

const gi = argv.getByName('GameInstance');
if (!gi) throw new Error('GameInstance missing');
const pawn = GameplayStatics.GetPlayerPawn(gi, 0);
if (pawn && KismetSystemLibrary.IsValid(pawn)) {
    const location = pawn.K2_GetActorLocation();
    console.log(`[PBZMOD] position=${location.X},${location.Y},${location.Z}`);
}
```

不要写 `import '@pbz-mod-loader/game-api'`：这个包没有运行时代码，通过 `tsconfig.json` 自动载入声明。
只在开发依赖中安装 SDK；发布时携带构建后的 MOD 目录。

## 已有项目接入

在 PBZModLoader 仓库根目录生成可离线转交的 npm 包：

```powershell
npm run sdk:pack
```

把生成的 `build/sdk/pbz-mod-loader-game-api-0.1.0.tgz` 复制到 MOD 工程的 `vendor/`，然后在该工程执行：

```powershell
npm install --save-dev ./vendor/pbz-mod-loader-game-api-0.1.0.tgz
```

`tsconfig.json` 的配置至少包含：

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "lib": ["ES2020"],
    "types": ["@pbz-mod-loader/game-api"],
    "strict": true,
    "noEmitOnError": true
  }
}
```

旧模板需删除 `types/ue.d.ts`、`types/puerts.d.ts`、`types/globals.d.ts` 中原有的重复声明。
自己的扩展声明可保留在 `types/custom.d.ts`，并继续将 `types/**/*.d.ts` 放入 `include`。
不要为游戏代码引入 DOM 或 `@types/node`，它们会让实际不存在的运行时 API 看起来可用。

## 覆盖范围与版本

这是依据本机游戏实测维护的接口子集，不是完整反射导出。验证构建、方法清单、排除项记录在 `api-surface.json`。
目前覆盖：

- 对象名称、类型、Outer、GameInstance/World。
- 当前地图、玩家控制器/Pawn/Character/CameraManager、GameMode/GameState。
- 世界时间、暂停状态、Actor 位置/旋转/缩放/速度、Pawn 控制器。
- 对象路径、显示名称、有效性检查、引擎版本及游戏名称。
- 当前显示分辨率与窗口模式。
- PuerTS 启动参数及 `$ref` / `$unref` / `$set`，console 与定时器。

UE 对象用接口描述，不宣称具有可调用的 JS 构造器。可能为空的对象返回值保留 `null | undefined`；
在主菜单中 `GetPlayerCharacter()` 就可能为空。切图后重新获取对象，长期持有的包装对象应先检查 `IsValid()`。
`UObject` 是原最小模板的兼容类型别名，PuerTS 对应的正式类型名是 `Object`。

未声明的方法并不代表游戏一定不支持，只表示本包尚未核实。`PlayerController.GetPawn()` 已探测失败，
获取玩家 Pawn 请使用 `GameplayStatics.GetPlayerPawn()`。对其他游戏构建、WeGame 平台及写入/生成对象等接口不作兼容承诺。

## 维护与扩展

`sdk/` 是声明的唯一编辑源。修改后执行 `npm run sdk:sync`，重建模板内的副本，再执行 `npm test`。
`vendor/game-api/` 是生成目录，不要在其中放自己的文件；自定义声明放在 `types/custom.d.ts`。
接口变更须更新版本、`api-surface.json` 和相应锁文件；游戏探测源文件位于 `tests/api-probe.js`，不会随加载器发布。
自动化测试检查模板副本一致性、独立安装、类型约束以及 CommonJS 输出，不能替代新接口的游戏验证。

游戏松散文件中没有发现可直接使用的游戏 `.d.ts`；主 Pak 索引加密，因此尚未判断包内是否有声明。
后续完整导出应读取游戏构建对应的反射信息并适配 PuerTS 类型映射，不能仅靠枚举 JS 属性推断参数和返回类型。
PuerTS 上游的声明生成依赖编辑器流程，参见[开发环境文档](https://github.com/Tencent/puerts/blob/master/doc/unreal/en/dev_environment.md)。
