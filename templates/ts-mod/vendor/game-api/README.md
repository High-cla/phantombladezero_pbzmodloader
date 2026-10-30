# PBZ TypeScript 游戏 API

`@pbz-mod-loader/game-api` 0.3.0 是 MOD 开发使用的类型声明包，为游戏提供的 `ue`、`puerts` 模块补全和检查类型。包内没有运行时代码，发布 MOD 时只携带编译后的 MOD 文件。

适用构建：Steam Win64 `CL-301524_JKS-17219`，EXE SHA256 为 `7b4fcd286a350780faf0824d73aa150b21cbf1bccde883e6a96386cbe09973b4`。其他游戏构建和 WeGame 尚未验证。

## 安装与使用

复制仓库的 `templates/ts-mod/`，在副本中执行 `npm ci`、`npm run check`、`npm run build`，即可使用随模板提供的 SDK。

已有 MOD 工程可安装离线包：

```powershell
# 在 PBZModLoader 仓库中生成压缩包
npm run sdk:pack
# 将 build/sdk/pbz-mod-loader-game-api-0.3.0.tgz 复制到 MOD 的 vendor/ 后
npm install --save-dev ./vendor/pbz-mod-loader-game-api-0.3.0.tgz
```

MOD 的 `tsconfig.json` 至少包含以下配置；保持完整声明检查，不需要 `skipLibCheck`：

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "lib": ["ES2020"],
    "types": ["@pbz-mod-loader/game-api"],
    "strict": true,
    "noEmitOnError": true
  },
  "include": ["src/**/*.ts", "types/**/*.d.ts"]
}
```

直接导入游戏模块，不要 `import '@pbz-mod-loader/game-api'`。不要引入 DOM 或 `@types/node`，游戏没有这些宿主 API。旧项目应移除重复的 `ue`/`puerts` 全局声明，自定义接口可以保留在 `types/custom.d.ts`。

```ts
import * as UE from 'ue';
import { argv, $ref, $unref } from 'puerts';

const gi = argv.getByName('GameInstance');
if (!gi) throw new Error('GameInstance missing');
const pawn = UE.GameplayStatics.GetPlayerPawn(gi, 0);
if (pawn && UE.KismetSystemLibrary.IsValid(pawn)) {
    const x = $ref(0), y = $ref(0), z = $ref(0);
    UE.KismetMathLibrary.BreakVector(pawn.K2_GetActorLocation(), x, y, z);
    console.log(`position=${$unref(x)},${$unref(y)},${$unref(z)}`);
}
const sum: bigint = UE.KismetMathLibrary.Add_Int64Int64(9007199254740993n, 2n);
const values = UE.NewArray(UE.BuiltinInt);
values.Add(1, 2); // 原生容器使用 Num/Get/Add 等方法，不是 JS 数组。
```

## 蓝图与路径索引

`type-index.json` 将反射完整路径关联到声明文件、类型符号和验证状态。原生类型可以直接使用 `UE.PBZGameInstance` 等名称；蓝图使用 `ReflectedTypes`/`ReflectedClasses` 的路径键，避免重名和猜测运行时命名空间。

```ts
import * as UE from 'ue';
import { argv, blueprint } from 'puerts';

type GameInstanceBP = UE.ReflectedTypes['/Game/PBZContent/Blueprint/BP_GameInstance.BP_GameInstance_C'];
// 仅在已确认对象实际类型时断言；断言不会执行运行时转换。
const gi = argv.getByName('GameInstance') as GameInstanceBP | undefined;
console.log(gi?.AllowedMap.Num());

const cls = UE.Class.Load('/Game/PBZContent/Blueprint/BP_GameInstance.BP_GameInstance_C');
if (cls) {
    const jsType = blueprint.tojs(cls);
    console.log(jsType.StaticClass().GetName());
}
```

`$Blueprint`、`$Static` 和 `ReflectedTypes` 等是声明辅助类型，没有可直接读取的运行时值。`Class.Load` 得到类对象，`blueprint.tojs` 得到 PuerTS 类型包装；它们不创建实例。`Load` 可能加载资产，调用方需选择适当场景。未采集路径只能使用保守的 `Class` 类型。

## 覆盖与验证程度

本版合并原主菜单与 `PBZ_Xigu_WP` 两次采集，以及 27 批资产加载后的有效采集，生成 **34,597 个类型**（18,453 个原生类型、16,144 个资产类型）、**49,539 个声明函数**及 **119,231 个已映射属性**，并保留原 SDK 的手工实测补充层。计数不展开继承成员，也不重复计算手工补充成员。

- `generation-report.json`：输入文件哈希、采集构建、合并变化、继承覆盖、排除项和未解析项。
- `type-index.json`：每个类型的完整路径、声明位置及 `reflection-generated` 状态。
- `api-surface.json`：原手工接口证据及本版运行测试；区分反射生成、绑定可见、调用验证。

生成声明不代表每项 API 都经过调用测试，也不代表所有蓝图都已采集。未加载资产、未反射且未注册绑定的成员不在覆盖范围内。函数只使用参数与返回字段，局部变量不进入声明。

84 个属性保留为只读 `$Unresolved<Path>`：其中 10 个反射解析失败，74 个尚无已验证的 PuerTS 映射。另有 5435 个函数成员被排除（含内部蓝图入口/委托签名及无法映射的函数），352 个类型被排除，8 个大整数枚举值被排除。具体原因与路径见报告，不使用 `any` 兜底。

本次资产加载共处理 12,400 个登记表已确认的未覆盖路径，12,399 个成功。PBZCombatAsset、Game、HuaShira 三个优先目录全部完成；其余目录中 `Narrative/NarrativeUI/Widgets/Editor/WBP_DefaultQuestNode_C` 对应的类加载返回空值，未生成声明。具体完整路径和结果见仓库 `build/type-batches-20261030/final/report.md`；不代表全部游戏脚本或未反射 C++ API 已覆盖。

部分 FName 属性在不同运行中出现大小写拼写差异；仅在其余反射结构一致时提供可选别名，并在 `memberNameVariants` 中记录。使用前应确认本次运行实际提供的拼写。

## 映射约定

| 反射类型或行为 | 声明 |
| --- | --- |
| 普通数值 / 64 位整数 | `number` / `bigint` |
| 字符串、Name、Text | `string` |
| 对象、接口、弱引用与延迟引用 | 目标类型加 `null \| undefined` |
| 数组、集合、映射、定长数组 | `TArray`、`TSet`、`TMap`、`FixSizeArray` |
| 非 const 的 out 参数 | `puerts.$Ref<T>`；使用 `$ref`/`$unref` |
| const 引用参数 | 直接传值，不加 `$Ref` |
| 软引用 | `TSoftObjectPtr<T>` / `TSoftClassPtr<T>`，保留可空返回 |
| 委托 | 使用反射签名的 `$Delegate` / `$MulticastDelegate` |

不推测默认参数；没有默认值证据的参数均必填。对象输入和输出使用保守的可空声明，原有实测补充接口保留原先约束。类属性是实例成员，静态函数放在类型值上；继承时同名成员以派生类型签名为准，并在报告中记录。静态函数目前在声明它的类型上提供，请通过该类型调用。

只有 `new UE.Vector(x, y, z)` 被声明为可构造。游戏没有 `Cast()` 方法；`PlayerController.GetPawn()` 也未通过旧版探测，获取玩家 Pawn 使用 `GameplayStatics.GetPlayerPawn()`。容器创建辅助函数当前支持内建基础类型，反射返回的对象/结构容器仍有完整元素类型。切图后重新获取对象，使用前检查 `IsValid()`。

## 维护与重建

仓库的 `sdk/` 是发布源，`types/ue.d.ts` 为手工补充层，`types/runtime.d.ts` 为 PuerTS 包装类型。`types/generated/`、`types/generated.d.ts`、类型索引与生成报告由脚本维护，不直接编辑。

在仓库根目录使用 Node.js 24+ 重建：

```powershell
$captures = (Get-Content sdk/generation-report.json -Raw | ConvertFrom-Json).captures | ForEach-Object { Join-Path 'build/reflection' $_.name }
npm run sdk:generate -- @captures
npm run sdk:sync
npm test
npm run sdk:pack
```

原始采集是本地 `build/` 产物，不随 npm 包分发；生成结果和来源哈希随源码保留。重新采集参见仓库的 `scripts/REFLECTION.md`。生成器拒绝未通过校验、混用构建或签名冲突的输入；PuerTS mixin 别名及仅实现标志变化会规范化，新增成员取并集并报告。

`npm test` 覆盖生成器边界、可用原始数据的可重复生成、完整声明检查、模板同步一致性、离线 npm 安装和独立 MOD 编译。游戏探测源位于 `tests/generated-api-probe.js`，验证工具为 `tests/verify-generated-api.cjs`，仅供开发测试。
