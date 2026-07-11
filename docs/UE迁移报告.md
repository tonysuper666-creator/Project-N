# Project N → Unreal Engine 迁移技术报告

> 作者：Technical Director（技术总监）
> 日期：2026-07-11
> 对象：Project N —— 浏览器 Three.js (r0.160) FPS 刷宝射击（looter-shooter），原生 JavaScript / ES Module / 无构建步骤
> 目标引擎：Unreal Engine 5（并标注与 UE4 的差异）
> 本报告基于对 `test/src/*.js`（world / player / weapons / viewmodel / models / character / enhance / inventory / ui / account / audio / missions）与 `docs/设定总结.md` 的实际通读，非泛泛而谈。

---

## 1. 结论与建议（Executive Summary）

**一句话结论：技术上完全可以迁到 UE5，但对「Project N 现阶段的产品形态」而言，这是一次「重写引擎层 + 放弃最大卖点」的高成本升级，不建议在「网页轻量分享」仍是核心路线时进行。**

- **若决定迁移，选 UE5（具体到 5.6 LTS 方向），不要选 UE4。** UE4 已进入维护末期，新项目从 UE4 起步等于一出生就背负技术债；UE5 的 Enhanced Input、现代渲染、持续更新都对本项目有利，且硬件门槛对一款竞技场式 FPS 完全可控（可全程不开 Nanite/Lumen）。
- **范围（scope）现实认知**：这不是「移植」，而是**用 UE 重做一遍游戏**。能带走的只有 **设计 + 数值 + 美术资源 + 开发经验**；`test/src/` 下**全部 ~15 个 JS 模块（引擎相关代码）需要重写**，没有一行能直接复用。
- **最重要的一句诚实忠告（放在最前面）**：

> ⚠️ **UE5 没有网页/浏览器导出。** 迁到 UE5 意味着 Project N **失去「发一个链接、点开即玩、零安装」这一当前最大的、也是设定总结里被反复强调为「最看重」的优势**。UE 版本只能作为需要下载安装的 PC / 主机 / 移动端 App 发布。如果「网页即玩」仍是产品主线，**这一条几乎可以单独否决 UE 迁移**（见第 2、第 9 节）。

**我的推荐**：除非明确决定「放弃网页路线、要做画质/上架的下载版」，否则**现在不要迁 UE**；把设计、数值、关卡、美术这些保值资产继续做扎实（设定总结第 21 节已是正确判断）。若确要升级引擎且仍想保留网页分享能力，**Godot 是比 UE 更平滑、性价比更高的中间目标**（Godot 有 Web 导出）。**这是你的决定——你最清楚产品愿景与商业目标；本报告负责把代价讲透。**

---

## 2. ⚠️ 关键代价（Critical Trade-offs）

迁 UE 前必须清醒接受以下代价，按重要性排序：

### 2.1 失去「网页即玩」——这是本项目现阶段的第一卖点
- **事实核对**：Epic **自 UE 4.24 起就移除了官方 HTML5 导出**；UE5 从未提供 HTML5 / WebAssembly 目标平台。社区维护的 HTML5 Platform Extension 最多延续到 UE4.27，且非官方、不可长期依赖。
- Epic 对「网页跑 UE」的官方答案是 **Pixel Streaming**：游戏跑在云端 GPU 服务器上，把**视频流**推给浏览器。这**不是**本地 WebAssembly 执行——它需要**每个并发玩家一台 GPU 云主机**，成本极高、有网络延迟，完全不适合「免费发链接给朋友随便玩」的场景。
- **后果**：UE 版 Project N 只能是**下载安装的客户端**（Windows 为主，可扩展到主机/移动端）。设定总结第 20 节把「网页即玩、秒开、零安装、发链接即分享」列为**当前最看重的点**——迁 UE 等于主动放弃它。

### 2.2 所有引擎相关代码都要重写
- 现有代码是**手写引擎逻辑**：`clampToArea` 分段并集碰撞、`damageAt` 射线命中、`spawnRocket`/`updateRockets` 投射物、viewmodel 双相机清深度、GLB 运行时加载与朝向归一化、DOM/CSS 的整套 UI……**这些在 UE 里全部由引擎子系统提供，写法完全不同，无法逐行翻译**。
- 语言从 JavaScript 换到 **C++ 和/或 蓝图（Blueprint）**。JS 的动态、无类型、`setTimeout`、闭包式模块风格，与 UE 的 UObject/Actor/GC/反射/资产引用体系是两套世界观。**保值的是「怎么调数值、怎么设计手感」这种 know-how，不是代码本身。**

### 2.3 硬件、磁盘、构建时间成本陡增
- **开发机**：UE5 舒适开发需要较强 GPU（建议 RTX 3060/相当以上）、32GB 内存、SSD。当前 Three.js 项目一台笔记本 + 浏览器即可。
- **磁盘**：引擎本体十几 GB，加上项目、DDC（Derived Data Cache）、Shader 缓存，几十 GB 起步。当前项目整个仓库以 MB 计。
- **构建/迭代**：C++ 改动需要编译；首次打开地图要编译海量 shader（几分钟到几十分钟）；打包一个可分发版本以分钟计。当前项目**零构建**——保存文件、刷新浏览器即见效。这个「改一行→立即看到」的迭代速度会显著下降。

### 2.4 学习曲线
- UE 是一个庞大的专业引擎：Actor/Component 生命周期、GC 与资产引用、Animation Blueprint、Behavior Tree、UMG、Niagara、DataTable、打包与平台设置……对一个来自「手写 Three.js」的小团队，**达到当前项目功能对等所需的学习期，本身就是数月量级的投入**（见第 8 节工作量）。

### 2.5 迁移不迁玩家/存档
- 当前 `account.js` 用 **localStorage** 存档（浏览器本地）。UE 版是独立 App，**现有网页玩家的本地存档无法带过去**；如果未来要账号/云存档，还要额外做后端（见第 4 节 save 一行）。

---

## 3. 能带走 vs 必须重写（What Transfers vs What's Rewritten）

### 3.1 能带走（保值资产）
| 资产 | 能否带走 | 迁移方式与注意点 |
|---|---|---|
| **glTF/GLB 模型**（Kenney Blaster 枪械、Soldier、RobotExpressive） | ✅ 能 | UE5 原生支持 **glTF 导入**（Interchange 框架）。更稳妥的做法是先在 Blender 里打开 .glb 校正朝向/比例/中心点，再导 **FBX 或 glTF** 进 UE。当前 JS 里「运行时自动归一化朝向」的逻辑，在 UE 里改为**导入时/资产里一次性摆正**，不再运行时算。 |
| **贴图**（Poly Haven CC0 沥青/砖墙/鹅卵石/石灰岩/屋瓦 .jpg） | ✅ 能 | 直接导入为 Texture2D。注意 **sRGB 标记**（albedo 勾 sRGB，法线/粗糙度不勾）。当前用 `RepeatWrapping + repeat.set`，UE 里用材质节点的 UV Tiling。**当前大量「用 Canvas 程序化画的贴图」**（facade 窗户、Big Ben 钟面、Union Jack、地铁 roundel、云、天空渐变）**不能带走**——要么导成静态贴图，要么在 UE 里用 Material/贴图重做。 |
| **音频**（`audio.js` 目前是 WebAudio 程序化合成音效） | ⚠️ 部分 | 当前音效多为**代码合成**（WebAudio oscillator/noise），**这套合成逻辑不能带走**。要么导出为 wav 素材，要么在 **MetaSounds** 里用程序化节点重建。真正的 wav/ogg 素材可直接导入。 |
| **字体**（Rajdhani woff2） | ✅ 能 | 导入为 Font 资产供 UMG 使用（可能需转 ttf/otf）。 |
| **骨骼动画**（Soldier=Mixamo，RobotExpressive 的 Idle/Walk/Run/Punch clips） | ⚠️ 能但要重定向 | glTF 里的 skeleton + animation clip 能导入 UE，但要**建立 Skeleton 资产并做动画重定向（Retargeting）**。UE5.4+ 的 **IK Retargeter** 可把 Mixamo/RobotExpressive 的动画重定向到统一骨架，让 world.js 里「用统一 Idle/Walk/Run 逻辑名驱动两个物种」的做法在 UE 里通过 **共享 AnimBP + 重定向** 实现。这是**有工作量、有坑**的一环（骨骼命名、根骨运动 root motion、比例差异）。 |
| **设计文档 / 数值 / 调参** | ✅ 100% | 武器 DEFS（伤害/射速/弹匣/后坐/射程）、部位倍率（头 2.5/胸 1.3/身 1.0/臂 0.7/腿 0.65）、强化成功率曲线、护甲减伤档位、敌人 tier 数值、掉落表、关卡路径点——**全部是纯数字/规则，直接搬进 UE 的 DataTable / DataAsset**。这是迁移中最省心、最值钱的部分。 |
| **开发经验 / 手感认知** | ✅ | 后坐力恢复、bloom 扩散、spin-up、beam DPS 节奏、近战挥砍弧线……这些「怎样才手感对」的 know-how 全部保值，只是换个引擎重新实现。 |

### 3.2 必须重写（引擎层，全部）
- **全部 `test/src/*.js` 游戏/渲染/UI 逻辑**：world、player、weapons、viewmodel、models、character、enhance、inventory、ui、account、audio、missions、textures、main（引导装配）。
- 渲染管线（Three.js WebGLRenderer + EffectComposer/Bloom/SMAA/toonify）→ 换成 UE 的渲染/后处理。
- DOM/CSS/HTML 的整套界面 → 换成 UMG。
- 手写碰撞/移动/命中/投射物 → 换成 UE 物理与 trace。

**一句话**：**资产 + 数字 + 脑子里的知识过河，代码全部沉底。**

---

## 4. 系统逐一映射（System-by-System Mapping）

下表把 Project N 里**实际存在的构造**（左）映射到 UE5 等价物（中），并给出**针对本项目的具体说明**（右）。

| Three.js / 现有实现 | UE5 等价物 | 针对 Project N 的说明 |
|---|---|---|
| `THREE.Scene` 场景图 + `Group`（londonGroup/parisGroup/moscowGroup 用可见性切换） | **Level / World + Actor 层级**；地图切换用 **Level Streaming** 或独立关卡 | 现在「三张图用极远 X 偏移放同一 scene、靠 group.visible 切换」是为规避 raycast 串扰的 hack。UE 里**每张图做成独立 Level**（或 sublevel），彻底不需要 X 偏移把戏。 |
| `THREE.Mesh` + BoxGeometry/Cylinder/Extrude/Lathe 程序化几何 | **StaticMesh Actor**；程序化几何 → 在 Blender 建模或用 UE **Geometry Script / Modeling Mode** | world.js 里成百上千个程序化 box/柱/torus/bevelPanel 搭出来的基地与街景，**在 UE 里更适合用真实静态网格 + 少量模块化拼装**，而不是逐个代码生成。`InstancedMesh`（路灯/护栏批量）→ UE 的 **InstancedStaticMesh / HISM**。 |
| 蒙皮角色 GLB（Soldier / RobotExpressive）+ animation clips | **SkeletalMesh + Skeleton + AnimSequence + Animation Blueprint** | 见 3.1 重定向说明。`CLIP_MAP`（逻辑名→各物种真实 clip 名）→ AnimBP 状态机 + 重定向。 |
| **自研玩家移动/碰撞**（`player.js`：velX/velZ 平滑、gravity、jump、crouch、slide、sprint、head-bob、look-sway；地面锁 y=0） | **Character + CharacterMovementComponent + CapsuleComponent** | UE 的 CMC 免费提供行走/跳跃/蹲伏/加速度平滑/落地；**滑铲（slide）、head-bob、look-sway、FOV kick 需要自定义**（CMC 无内建滑铲，需扩展或自写）。当前的「无高低差、y=0 地面锁定」在 UE 里自然由地形/碰撞体解决。 |
| **分段并集碰撞 `clampToArea`**（把玩家/敌人夹在矩形段的并集内，实现直角转弯走廊） | **碰撞几何（墙体 Collision）+ NavMesh 边界**；或 **Blocking Volume** | 这是本项目最巧的 hack 之一。UE 里**不需要它**——直接用**关卡里的墙**挡住玩家，用 **NavMeshBoundsVolume** 约束敌人寻路。巴黎的折线走廊在 UE 里就是「摆好带拐弯的墙」。 |
| **铁门 stage gate**（清怪后升降、动态加/删 collider box） | **Actor + Timeline/动画 + 可开关 Collision**；逻辑放关卡蓝图或 GameMode | closeGate/openGate 动态往 colliders 数组塞 Box3 → UE 里就是 SetActorEnableCollision + 播放开合动画。 |
| **命中射线 `damageAt` / `ray.intersectObjects`** | **`LineTraceByChannel` / `LineTraceSingleByChannel`** | hitscan 武器（步枪/手枪/冲锋枪/加特林/狙击）全部用 LineTrace。**spread cone**（按 base+bloom+移动惩罚偏移方向）照搬为对 trace 方向加随机偏移。**pierce 穿透（联狙一线穿多敌）** → `LineTraceMultiByChannel` 遍历命中、遇实体墙停。 |
| **持续激光 beam**（`beamTick`：逐帧 DPS + 耗弹 + 稳定光束视觉） | 逐帧 LineTrace + `ApplyDamage(DPS*dt)` + **Niagara Beam** 视觉 | beamContinuous 的「damage 即 DPS、每帧扣血扣弹」直接对应 UE 每帧 trace。光束/光管视觉换成 Niagara Ribbon/Beam。 |
| **火箭投射物**（`spawnRocket`/`updateRockets`：重力、逐帧线段 raycast、`explodeAt` AOE） | **Projectile Actor + ProjectileMovementComponent（含重力）+ 命中后 `ApplyRadialDamage`** | 火箭筒/连发火箭筒的 projSpeed/projGravity 直接映射到 PMC 的 InitialSpeed/ProjectileGravityScale；aoeRadius/aoeDamage → RadialDamage + 半径衰减。逐帧线段自碰撞由 PMC 的 sweep 自动处理。 |
| **每部位伤害倍率**（enemy userData.part = head/chest/limb，mult 2.5/1.3/1.0/0.7/0.65） | **PhysicsAsset 骨骼碰撞体 + Hit Bone 判定**，在受击时按 `HitResult.BoneName` 查倍率表 | 当前靠给身体不同 Mesh 打 userData 标记。UE 里给 SkeletalMesh 配 **PhysicsAsset**（每根骨一个碰撞体），trace 命中返回 BoneName，用 DataTable 查「头/胸/臂/腿」倍率。**这是把当前系统做得更真实的机会**。 |
| **第一人称 viewmodel**（`viewmodel.js`：独立相机、清深度渲染，枪不穿墙；按武器载 GLB；idle/walk sway、后坐、换弹 dip 全代码驱动） | **FP 手臂/武器 SkeletalMesh 挂相机 + Animation Blueprint**；「枪不穿墙」用 **单独渲染 pass / custom depth / FP mesh 关闭深度写入** 的标准 UE 做法 | 当前用「第二相机清深度」保证枪不穿墙——UE 里是成熟套路（FirstPerson 模板自带）。当前**纯代码算的 sway/recoil/reload 动作**，UE 里更适合做成 **Animation（Additive / 手 K 或程序化 Control Rig）+ 少量代码**混合。 |
| **枪口闪光 / 曳光 / 弹壳 / 命中火花 / 撞击 spark**（Line/Sprite/小 Mesh + 手写生命周期数组 `impacts[]`） | **Niagara**（muzzle flash / tracer / impact / shell eject 全部 Niagara 特效）+ Muzzle light 用 SpotLight/PointLight | 当前逐帧手动更新 impacts 数组、算重力、fade opacity——UE 里全交给 Niagara，性能与观感都更好。曳光的 `spawnPlayerTracer` → Niagara Beam/Ribbon。 |
| **敌人 AI**（逼近玩家、进近战距离触发前冲挥砍；tier 决定血/伤/速；Boss 更快更肉） | **AIController + Behavior Tree + Blackboard + NavMesh（NavMeshBoundsVolume）**；感知用 **AIPerception** | 当前 AI 是 world.js 里手写的「朝玩家走→到距离播 Punch」。UE 里标准做法：BT 里 MoveTo(玩家) → 到攻击范围 → 播攻击 Montage → ApplyDamage。tier 数值放 DataTable。**Boss 顶部血条**用 UMG。 |
| **武器名录**（DEFS + PRIMARY_DEFS：rifle/pistol/knife/smg/laser/minigun/sniper/lasersniper/rocket/autorocket，字段化定义） | **DataTable（Row Struct = 武器定义）或 Primary DataAsset** | 现在武器就是一堆结构体字面量——**这是最适合搬 DataTable 的系统**。mode(auto/semi/melee)、damage、fireRate、mag、recoil、range、projectile、beam、scope、spinup 等字段一一对应 struct 字段。逻辑（开火行为）在武器基类 C++/BP 里按字段分支。 |
| **武器强化 RNG**（`enhance.js`：部位 mag/core/barrel/muzzle/stock，每级成功率曲线，失败耗材不升级，稀有度=最高档部位；`effectiveMods` 实时合成有效武器，不污染基础定义） | **纯 gameplay 逻辑：C++/BP + DataTable（PARTS 成功率/花费曲线）+ SaveGame（部位等级）** | 这套系统**与引擎无关**，是最容易迁移的逻辑之一。`makeEffectiveDef`「装备时实时合成有效武器、不改基础 def」的模式在 UE 里就是「运行时算 EffectiveWeaponStats 结构体」。**不需要 GAS**（见下）。 |
| **掉落 / 背包 / 护甲 / gear**（`inventory.js`：ITEM_DB、分图掉落表 LONDON/PARIS/MOSCOW_LOOT、`rollLoot`、护甲减伤档、换弹加速 gear、复活币） | **Struct + DataTable（物品/掉落表）+ Inventory Component（Actor Component）** | 掉落表按图分是纯数据 → DataTable。背包/装备是一个挂在 PlayerState/Character 的 InventoryComponent。护甲减伤、gear 换弹加速 → 装备时改角色属性。 |
| **存档**（`account.js`：localStorage，存装备/金币/等级/任务/强化等级，离线单机） | **`USaveGame` 子类 + `SaveGameToSlot`/`LoadGameFromSlot`**（本地存档文件） | 直接对应。**注意**：这是本地存档；若将来要「账号系统 / 云存档 / 防作弊 / 赛季服务器」，需要**额外自建后端**（UE 本身不提供后端，需接 PlayFab/自研 API）——这与当前 localStorage 一样都是单机，但迁移不会自动带来联机能力。 |
| **地图（程序化街道）**（world.js 逐段生成街道、露台、地标；巴黎折线 6 点路径） | **手工搭建 Level（推荐）** 或 **PCG（Procedural Content Generation）框架** | 两条路：(A) **手搭关卡** —— 对「三张固定地图 + 固定 Boss」这种**关卡即内容**的设计，手搭 Level 质量最高、最可控，**推荐**。(B) **PCG 框架**（UE5.2+ 生产可用，5.4+ 成熟）——若未来要「赛季随机街区」才值得投入。**现阶段建议手搭**，把程序化生成留给远期赛季化。 |
| **UI（DOM/CSS/HTML）**（`ui.js`+`styles.css`+`index.html`：HUD、商人、背包、任务、部署、结算、伤害数字、准星、血条） | **UMG（Widget Blueprint）**；跨平台/手柄导航用 **CommonUI** | 整套 DOM UI 全部重写为 UMG。伤害飘字用 WidgetComponent 或屏幕空间 UMG。**CommonUI** 在需要手柄/多平台输入焦点管理时更省心（若只做键鼠 PC，纯 UMG 足够）。 |
| **音频**（`audio.js`：WebAudio 程序化合成枪声/激光/换弹/UI） | **MetaSounds（程序化音频，推荐）** 或 **SoundCue** + wav 素材 | MetaSounds 正好对应「程序化合成」思路，能把现在用 oscillator/noise 合成的枪声在图形化节点里重建；不想重建就录/找 wav 用 SoundCue。 |
| **后处理**（EffectComposer：Bloom + SMAA；toonify 卡通着色；sky 渐变 + 云 sprite） | **PostProcessVolume（Bloom、AA 用 TSR/TAA/FXAA）+ 色调映射（默认 ACES/Filmic）**；卡通用 **PostProcess 材质 / 自定义 Shading**；天空用 **SkyAtmosphere + Volumetric Clouds** 或简易天空盒 | Bloom/色调映射 UE 内建更好。**toonify 卡通描边**需要用 PostProcess 材质重做（UE 无一键 toon，社区方案成熟）。云 sprite → Volumetric Clouds 或便宜的卡片云。**是否上 Lumen 见第 6 节——本项目可以不开**。 |

---

## 5. C++ vs 蓝图（Blueprint）——推荐与分工

对一个**从 JavaScript 出发的独立/小团队**，我的推荐是**「蓝图为主起步，C++ 只做核心与热点」的混合模式**，具体分工：

**先用蓝图快速搭（迭代快、可视化、贴近现在改数值就见效的体验）：**
- 关卡逻辑、门/触发器、任务流程（missions）、UI（UMG）、掉落/交互、Boss 编排、动画状态机（AnimBP）、Niagara 特效绑定。

**建议用 C++ 承担（结构性、性能敏感、易失控的部分）：**
- 武器系统基类与开火逻辑（10 把枪的行为分支、trace/beam/projectile 调度）——这是核心，值得强类型。
- 强化/背包/存档等**数据密集、需可测试**的系统（符合项目「public 方法可单测、数据驱动」的编码规范）。
- 敌人属性/伤害结算的基类。

**理由与权衡：**
- **纯蓝图**：上手最快、迭代最像现在（改完即玩），但**大型逻辑在蓝图里会变成难以维护的「意大利面连线」**，且不便做单元测试——这与项目 `coding-standards.md` 里「public 方法可单测、依赖注入优先」冲突。
- **纯 C++**：最贴合现有「代码即一切」的习惯，可测试性强，但**编译等待 + 缺可视化**会拖慢早期探索，学习期更长。
- **混合（推荐）**：C++ 定基类/接口/数据结构，蓝图继承 C++ 类做具体资产与关卡拼装——这是 UE 社区对小团队的主流最佳实践，兼顾迭代速度与可维护性。

> 从 JS 到 C++ 的心智跳跃是真实成本（手动内存/UObject 生命周期、UPROPERTY 反射标记、头文件）。若团队对 C++ 完全陌生，可**第一阶段几乎全蓝图**跑通垂直切片，等瓶颈/规模显现再把核心下沉到 C++。

---

## 6. UE4 vs UE5——对本项目真正重要的差异

**明确推荐 UE5（5.6 方向）。** 逐条说明哪些差异对 Project N 真正有意义：

| 维度 | UE4 | UE5 | 对本项目的意义 |
|---|---|---|---|
| **Nanite**（虚拟几何） | 无 | 有 | 对一款**低多边形 CC0 资产 + 程序化简单几何**的竞技场 FPS，Nanite **基本用不上**，甚至该关掉以省开销。**不是迁 UE5 的理由。** |
| **Lumen**（动态全局光照） | 无（用 Lightmass 烘焙） | 有 | 画质提升明显，但**吃 GPU**。本项目当前是烘焙感/卡通风，**完全可以不开 Lumen**，用静态光照烘焙保证低端机也能跑。**按需选用，不是必须。** |
| **Enhanced Input** | 旧 Input（4.26+ 起可选 Enhanced） | **默认 Enhanced Input** | 对键鼠 FPS 很实用（上下文映射、修饰键、可重绑定）。UE5 原生就位，是**实打实的加分**。 |
| **动画/工具链** | 较旧 | Control Rig、IK Retargeter、Motion Matching、更好的 Sequencer | **角色动画重定向（Soldier/RobotExpressive）在 UE5 的 IK Retargeter 下明显更顺**——直接利好第 3.1 节那道坎。 |
| **硬件门槛** | 较低 | **较高**（编辑器与新特性更吃配置） | UE5 开发机要求更高；但**运行时**只要不开 Nanite/Lumen，UE5 打出的包在中端机上跑一款 FPS 没问题。 |
| **成熟度/寿命** | **维护末期**，社区与插件逐步迁走 | **主线，持续更新**（5.6 主打性能，60FPS 大世界） | 新项目**不应**押注 UE4；UE5 是未来数年的主线。 |
| **迁移风险** | 起步即欠债 | 跟随官方主线 | 选 UE4 = 一年后还要再迁 UE5，纯浪费。 |

**结论**：**UE5。** 且对本项目「竞技场式 looter-shooter」的体量，**可以刻意保持轻量**（关 Nanite、按需 Lumen、优先静态烘焙），让 UE5 的现代工具链为你所用，而不被高端渲染特性拖累帧率与硬件门槛。

---

## 7. 分阶段迁移路线图（Phased Roadmap）

> 前提：团队已具备或愿意投入基础 UE 学习。每阶段给出目标、关键 UE 子系统、粗略工作量档（S=数天，M=数周，L=1-2 月，XL=2 月+，均按 1-2 人小团队估）。

### Phase 0 — 环境与学习（Setup & Learning）｜工作量：M
- **目标**：装好 UE5.6、跑通 First Person 模板、把 CC0 资产（1 把枪、1 个敌人、几张贴图）成功导入并在场景里显示与播放动画；建立 Git + LFS（UE 二进制资产必须用 Git LFS）。
- **关键子系统**：Interchange/glTF 导入、Skeleton/Retargeter、项目设置、Source Control。
- **产出**：一名成员能独立在 UE 里「导入资产 → 摆进关卡 → 播动画 → 打个包」。

### Phase 1 — 垂直切片（Vertical Slice）｜工作量：L
- **目标**：**一张图（伦敦）+ 一把枪（步枪 hitscan）+ 一种基础敌人（逼近+近战）+ 第一人称控制器（走/跳/蹲/看）**，能从基地部署、清一段怪、走到撤离点结算。证明「手感与核心循环」在 UE 里立得住。
- **关键子系统**：Character + CMC + Capsule、Enhanced Input、LineTrace 开火、Niagara 枪口/曳光/命中、AIController + Behavior Tree + NavMesh、基础 UMG HUD（血/弹/准星）、一个 Boss 或段落门。
- **风险闸门**：**这是 go/no-go 关口**——若这里就觉得迭代太慢、手感难还原、团队学习吃力，应重新评估是否继续迁移。

### Phase 2 — 系统对等（Systems Parity）｜工作量：XL
- **目标**：把**全部 10 把武器**（含 beam 激光、spin-up 加特林、scope 狙击、pierce 联狙、rocket/autorocket 投射物）、**武器强化 RNG**、**掉落/背包/护甲/gear**、**存档（SaveGame）**、**完整 UI**（商人/任务/背包/部署/结算/伤害数字/Boss 血条）做到与现网页版功能对等。
- **关键子系统**：武器 DataTable + 武器基类（C++）、ProjectileMovementComponent + RadialDamage、PhysicsAsset 部位伤害、Inventory Component、UMG/CommonUI 全套、USaveGame、MetaSounds。
- **说明**：这是**最大的一块**，因为要复刻多年积累的手感细节（后坐恢复、bloom、sway、reload 动作、各枪独特行为）。

### Phase 3 — 内容（Content：三图 + Boss）｜工作量：L–XL
- **目标**：搭出**伦敦 / 巴黎（折线路线 + 凯旋门/环岛/塞纳河桥/铁塔）/ 莫斯科**三张关卡与三个 Boss；配齐两个敌人物种（Soldier + Robot）与 tier 分级；分图掉落表。
- **关键子系统**：Level 搭建（模块化静态网格 / 可选 PCG）、NavMesh、Level Streaming、光照烘焙、Boss 行为树。

### Phase 4 — 打磨与发布（Polish & Ship）｜工作量：L
- **目标**：性能优化（帧时间/内存预算、LOD、批次）、后处理（Bloom/色调映射/可选 Lumen/卡通描边）、音频混音、设置菜单、打包与分发（Windows 优先，可选 Steam/主机/移动）、崩溃与存档兼容测试。
- **关键子系统**：PostProcessVolume、Scalability 设置、打包与平台配置、性能分析（Unreal Insights / stat 命令）。

---

## 8. 工作量与风险（Effort & Risks）

### 8.1 现实工作量区间（1–2 人小团队，含学习）
- **能玩的垂直切片（Phase 0–1）**：约 **1.5–3 个月**。
- **功能对等 + 三图内容（到 Phase 3）**：约 **6–12 个月**（团队 UE 经验越浅越靠上限）。
- **打磨到可对外发布（到 Phase 4）**：**9–15+ 个月**总量。
- **注意**：这些是**重做一个已有游戏**的估计，不是从零设计——**设计已定、数值已调**能省掉大量返工，但引擎层要全部重建。若团队此前**零 UE 经验**，把上述数字乘 1.3–1.5 更安全。

### 8.2 头号风险与缓解
| 风险 | 影响 | 缓解 |
|---|---|---|
| **失去网页分享是产品定位错配**（最大风险） | 可能整个迁移方向错误 | 迁移前先和 Creative Director/发行策略确认：产品主线是否已从「网页分享」转向「下载版画质/上架」。**若否，不迁。** |
| **手感还原难于预期** | 多年调出来的射击手感在 UE 里需重新调，可能「像但不对」 | Phase 1 就死磕手感闸门；把 sway/recoil/bloom 参数当一等公民，早做 A/B 对比。 |
| **动画重定向踩坑**（Soldier vs Robot 骨骼/比例/root motion 不一致） | 敌人动作错位、脚滑 | 早在 Phase 0 用 IK Retargeter 验证两个物种；必要时统一到一套 UE 标准骨架。 |
| **小团队 C++ 学习期** | 进度不确定性 | Phase 1 尽量蓝图跑通，核心再下沉 C++；控制过早优化。 |
| **迭代速度骤降打击士气** | 团队不适应编译/打包节奏 | 善用蓝图热重载、Live Coding；接受「不再是刷新浏览器即见效」。 |
| **资产/版本管理膨胀**（UE 二进制资产 + 大仓库） | Git 仓库失控 | 一开始就上 **Git LFS**，规划 DDC 与缓存策略。 |
| **范围蔓延**（「反正都重做了，顺便加联机/开放世界」） | 无限期 | 严守「先做到与现版本功能对等」再谈新特性；联机是另一个数量级工程。 |

---

## 9. 备选方案（Alternatives）

如果**「网页即玩、发链接分享」对 Project N 仍然重要**，UE 并非唯一升级路径，应把决策放在完整选项里看：**(A) 留在 Three.js**——现阶段体量完全够用，网页优势零成本保留，代价是画质与大型 3D 生态天花板较低（设定总结第 20 节的判断依然成立）；**(B) 迁 Godot**——免费开源、上手快、FPS 所需系统齐全，节点树/编辑器工作流与 UE 相近，**且原生支持 Web 导出**（网页导出偏重但能用），可同时导出桌面/手机/主机，是从 Three.js 出发**最平滑、性价比最高、又不丢网页能力**的中间目标；**(C) 迁 UE**——只有当明确要「顶级画质 / 主机上架 / 放弃网页」时才划算，对当前竞技场体量属「杀鸡用牛刀」。**一句话**：想升级画质又想留网页，先看 Godot；铁了心做下载版高画质，再上 UE。

---

## 参考来源（Sources）

- [UE5 Export to HTML5 — Epic Developer Community Forums](https://forums.unrealengine.com/t/ue5-export-to-html5/1625616)
- [Does HTML5 export work for Unreal 4-27 and 5? — Epic Forums](https://forums.unrealengine.com/t/does-html5-export-work-for-unreal-4-27-and-5/503734)
- [Does Unreal Engine Have Plans for Browser Gaming? — fpsio.com](https://fpsio.com/2025/08/17/does-unreal-engine-have-plans-for-browser-gaming/)
- [UE 5.6 Deep Dive: 60 FPS Open Worlds with Nanite, Lumen — StraySpark](https://www.strayspark.studio/blog/ue-5-6-deep-dive-60fps-open-worlds-nanite-lumen)
- [Unreal Engine 5.6 Performance Highlights — Tom Looman](https://tomlooman.com/unreal-engine-5-6-performance-highlights/)
- [The truth of the Gameplay Ability System — Devtricks](https://vorixo.github.io/devtricks/gas/)
- [GASDocumentation — tranek (GitHub)](https://github.com/tranek/GASDocumentation)
- [Unreal Engine 5 — Wikipedia](https://en.wikipedia.org/wiki/Unreal_Engine_5)
