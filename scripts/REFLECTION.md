# 当前构建反射导出

`reflection_export.py` 是独立的开发工具，只使用 Python 标准库和 Windows 只读进程 API。
不注入 DLL、不附加调试器、不执行游戏函数、不写进程内存；不会改变加载器或已发布 SDK。

支持 Steam Win64 `CL-301524_JKS-17219`，EXE SHA256：
`7b4fcd286a350780faf0824d73aa150b21cbf1bccde883e6a96386cbe09973b4`。
先核对正在运行进程对应的 EXE 哈希，再读取相对模块基址的地址。其他构建直接拒绝。

## 使用

需要 Windows x64、64 位 Python 3.10+。按项目约束启动游戏：

```powershell
& 'D:\Program Files\Steam\Steam.exe' -applaunch 4115450 -windowed -ResX=1280 -ResY=720
```

确认实际为 1280×720 窗口模式，等待主菜单或存档地图加载稳定，再在仓库根目录执行：

```powershell
./scripts/export-reflection.ps1 -Python 'C:\path\to\python.exe' -Label PBZ_Xigu_WP
```

脚本自动选择 `platform/steam/PBZ.exe`，不会误选 `steam/PBZ.exe` 启动包装进程。
也可传 `-GamePid 12345 -Output build/reflection/my-capture`，输出目录必须尚不存在。
Label 是调用方提供的场景标注，应根据游戏 UI/加载器日志填写，不由导出器自动推断。
工具还会读取实际 `PBZSettingsLocal` 的分辨率和窗口模式，条件不满足则拒绝导出。

Python 直接入口：

```powershell
python scripts/reflection_export.py --pid 12345 --label main-menu --output build/reflection/my-capture
python tests/reflection_test.py
```

退出码：`0` 为校验通过且无解析失败；`2` 为校验通过、清单已生成但存在未解析项；
`1` 为构建、读取或一致性校验失败。自动化应保留 `2` 的输出并检查失败报告，不把它当作无条件通过。

## 输出

| 文件 | 内容 |
| --- | --- |
| `reflection.json` | 完整反射记录及采集清单，后续声明生成器的输入 |
| `inventory.csv` | 每个类型/函数一行，便于搜索、筛选、统计 |
| `summary.json` | 构建、解析配置、采集时间、场景标注、校验结果、数量统计 |
| `failures.json` | 失败阶段、所属类型、成员名、地址、错误原因及无法解析属性的原始字段 |

记录包含类、结构、枚举和独立函数（包括委托签名）；默认对象 CDO 不作为声明。
成员包括继承关系、声明属性、函数成员列表、参数顺序、返回/输入输出/引用标志、
容器元素与键值类型、对象/结构/枚举/委托引用、枚举名称及有符号 64 位值。
函数 properties 也可能包含蓝图局部字段；以 `parameter`、`return` 区分参数和返回值。
继承成员只记录在声明它的父类型上，不在每个派生类中重复展开。

`path` 是完整 Outer 链形成的稳定标识，包含包路径。嵌套成员标识用于清单关联，
不是承诺可以直接传给游戏资源加载函数的路径。
`source=native` 表示 `/Script/` 包中的记录；`asset-or-runtime` 包含蓝图资产和临时运行时类型，
不等于全部都是持久蓝图资产。`objectIndex`、错误中的地址仅用于单次采集诊断。

未解析字段保留在所属类型中并标记 `unresolved`，不补成 `any`，不默默丢弃。
`declaredProperties` 不含函数字段；`functionFields` 包含参数、返回及局部字段；
`propertyKinds` 还包含容器的嵌套描述符，不能直接当作顶层成员总数。

## 范围与一致性

覆盖对象数组中已注册的原生反射类型和当时已加载的蓝图反射类型。
不主动加载资产、不读取未加载蓝图、不恢复未反射 C++ 成员、不解析 PuerTS 静态绑定表，
也不验证 PuerTS 可调用性。此阶段输出元数据，不修改 `sdk/types/*.d.ts`。

布局取自当前构建的实际内存，包括该构建的对象数组布局、FField Next/Owner 顺序、
ArrayProperty Inner 偏移及枚举分离的名称/数值数组。不能直接复用到其他 UE 5.7 游戏。
校验包括名称池、对象索引、链表循环、引用解析、参数数量/缓冲区边界/返回偏移、
Vector 字段、Actor 继承、GetPlayerPawn 签名、EAxis 枚举。

采集前后检查对象数组头、反射对象槽位/身份以及继承/成员链头；检测到切图或 GC/运行时
反射重建会拒绝发布清单并输出 fatal 报告。等场景稳定后使用新目录重试。
这是只读实时采集，不是冻结引擎的原子快照；上述检查不能排除所有并发修改。

## 扩展

更换游戏构建应重新定位并验证布局，添加新的哈希配置和对应回归样本，不能仅修改哈希跳过限制。
新增属性类型时保留显式失败处理。后续可以在此原始清单之上增加资产加载补全和 PuerTS 类型转换。
