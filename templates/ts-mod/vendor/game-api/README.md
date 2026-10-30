# PBZ TypeScript 游戏 API

`@pbz-mod-loader/game-api` 0.3.2 是 MOD 开发使用的类型声明包，为游戏提供的 `ue`、`puerts` 模块补全和检查类型。包内没有运行时代码，发布 MOD 时只携带编译后的 MOD 文件。

适用构建：Steam Win64 `CL-301524_JKS-17219`，EXE SHA256 为 `7b4fcd286a350780faf0824d73aa150b21cbf1bccde883e6a96386cbe09973b4`。其他游戏构建和 WeGame 尚未验证。

## 安装与使用

复制仓库的 `templates/ts-mod/`，在副本中执行 `npm ci`、`npm run check`、`npm run build`，即可使用随模板提供的 SDK。

已有 MOD 工程可安装离线包：

```powershell
# 在 PBZModLoader 仓库中生成压缩包
npm run sdk:pack
# 将 build/sdk/pbz-mod-loader-game-api-0.3.2.tgz 复制到 MOD 的 vendor/ 后
npm install --save-dev ./vendor/pbz-mod-loader-game-api-0.3.2.tgz
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

本版合并原主菜单与 `PBZ_Xigu_WP` 两次采集，以及 27 批资产加载、一次定向属性复核后的有效采集，生成 **34,597 个类型**（18,453 个原生类型、16,144 个资产类型）、**49,540 个声明函数**及 **119,260 个已映射属性**，并保留原 SDK 的手工实测补充层。计数不展开继承成员，也不重复计算手工补充成员。

- `generation-report.json`：输入文件哈希、采集构建、合并变化、继承覆盖、排除项和未解析项。
- `type-index.json`：每个类型的完整路径、声明位置及 `reflection-generated` 状态。
- `api-surface.json`：原手工接口证据及本版运行测试；区分反射生成、绑定可见、调用验证。

生成声明不代表每项 API 都经过调用测试，也不代表所有蓝图都已采集。未加载资产、未反射且未注册绑定的成员不在覆盖范围内。函数只使用参数与返回字段，局部变量不进入声明。

55 个属性保留为只读 `$Unresolved<Path>`：51 个 OptionalProperty、3 个 Utf8StrProperty、1 个 AnsiStrProperty。所有目标均确认有 getter/setter 绑定；Optional 与 UTF-8 的可实例化样本读值（含写入后读回）为 undefined，其余只检查了绑定，不能宣称可用映射。另有 5434 个内部蓝图入口/委托签名、352 个临时类型及 1 个丢失精度的大整数枚举值被排除。

本次资产加载共处理 12,400 个登记表已确认的未覆盖路径，12,399 个成功。PBZCombatAsset、Game、HuaShira 三个优先目录全部完成；其余目录中 `Narrative/NarrativeUI/Widgets/Editor/WBP_DefaultQuestNode_C` 对应的类加载返回空值，未生成声明。具体完整路径和结果见仓库 `build/type-batches-20261030/final/report.md`；不代表全部游戏脚本或未反射 C++ API 已覆盖。

部分 FName 属性在不同运行中出现大小写拼写差异；仅在其余反射结构一致时提供可选别名，并在 `memberNameVariants` 中记录。使用前应确认本次运行实际提供的拼写。

0.3.1 修复了 10 个空 UEnum 指针字段的解析：底层整数描述完整，实测读值为 number，声明保留数字存储并标注枚举名称元数据缺失，不猜测枚举常量。新增 19 个 FieldPath 属性映射及 `KismetSystemLibrary.SetFieldPathPropertyByName` 签名。完整逐项证据见 `property-mapping-verification.json`。

FieldPath 映射为字符串，形如 `/Script/Engine.Actor:bHidden`；读取未设置字段可能得到空字符串，但写入空字符串会抛 `invalid FieldPath`。实测临时 `GameplayAttribute` 的读写回环，以及该函数的空对象目标参数转换；0.3.2 另在新建临时 UObject 的嵌套 GameplayAttribute 字段上完成两次直接写入并读回；不修改现有游戏对象或类默认对象。

## 0.3.2 绑定调查与安全边界

逐项结果和来源哈希见 [binding-support-verification.json](binding-support-verification.json)。

- **55 个属性仍保留只读未解析声明**：55 个访问器均存在，35 个可实例化结构字段均读出 undefined；Optional 的整数、字符串、Name 与 UTF-8 样本赋值后仍读出 undefined。其余 20 项没有取得实例，包括含 ANSI 字符串的 Map，不能宣称已验证其值映射。此行为与上游 PuerTS 未支持类型的空转换器一致，但上游源码不是游戏的精确版本；无法仅靠补 TypeScript 声明修复运行时转换。
- **补入 7 个精确的大整数枚举标志位**：ESkeletalMeshAsyncProperties 的 2^53 至 2^59 均实测为 number，并用 BigInt(number) 对照原始十进制整数确认精确。它们不是 bigint，不应使用 JS 的 32 位位运算。_MAX 的原始值为 576460752303423489，游戏转换后却为 576460752303423488，与 TargetMeshDeformers 相等，继续排除。
- **FieldPath 的有效对象写入已验证**：在临时 GEAR_AttributeRange 对象上，通过 obj.Attribute.Attribute 连续设置两个有效路径，重新读取均一致。MapProperty/ArrayProperty 的临时字段也完成匹配种类的路径回环。该游戏的转换器还接受了不匹配种类的路径，因此 string 类型并不能保证目标种类正确；生成声明现在显示反射要求的种类。
- **SetFieldPathPropertyByName 标记为 deprecated**：向有效临时对象传入嵌套名 Attribute.Attribute 时进程在调用内退出，不能靠 JS try/catch 兜底。已采集记录中没有直接持有 FieldPath 字段的 UObject 类，所以没有取得该函数成功写入的证据。优先使用已知对象上的直接字段赋值，不把空目标测试当成有效目标测试，也不假设错误字段名会被忽略。
- **上轮异常退出仍未定因**：旧日志只有批次开始，旧转储已不在崩溃目录；本轮对首个目标在两个进程中分步复测均成功。本轮嵌套名崩溃是独立发现，不能倒推为旧退出的原因。新转储为游戏自定义 KZ1 格式，尚无可读取的原生调用栈。

完整通过的复测日志与中途退出日志分开保存，后者不计作成功验证。测试保持 1280×720 普通窗口；游戏已退出，原 MOD 配置恢复且哈希一致，临时探针已移出游戏目录。

## 映射约定

| 反射类型或行为 | 声明 |
| --- | --- |
| 普通数值 / 64 位整数 | `number` / `bigint` |
| 字符串、Name、Text、FieldPath | `string`（FieldPath 输入需有效路径） |
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
