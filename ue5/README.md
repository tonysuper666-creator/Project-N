# Project N — UE5 移植骨架（Phase 0/1 起步）

这是 Project N 从浏览器 Three.js 版**移植到 Unreal Engine 5** 的 C++ 工程骨架。
它给你一个能打开、能编译、能试玩的**垂直切片地基**：第一人称角色 + 一把命中制武器 + 一个近战敌人 + 游戏模式。

> ⚠️ **诚实提醒**：这份 C++ 是在没有 UE 编译器的环境里写的，**第一次编译大概率要来回改几轮**（缺头文件、API 版本差异等）。这是跨引擎移植的正常过程——把编译报错发给我，我来逐个修。目标引擎版本：**UE 5.3**（其它 5.x 也行，可能个别 API 要调）。

---

## 一、这份骨架包含什么（以及它对应网页版的哪个文件）

| UE5 文件 | 作用 | 对应网页版 |
|---|---|---|
| `Source/ProjectN/PNCharacter.*` | 第一人称角色：移动、相机、生命、开火/换弹输入 | `player.js` + `main.js` |
| `Source/ProjectN/PNWeaponComponent.*` | 命中制武器：射线检测开火、换弹、弹药 | `weapons.js` |
| `Source/ProjectN/PNWeaponData.h` | 数据驱动武器定义（DataTable 行结构） | `weapons.js` 的 DEFS |
| `Source/ProjectN/PNEnemyCharacter.*` | 近战敌人 AI：逼近 + 近战攻击 | `world.js` 敌人逻辑 |
| `Source/ProjectN/PNGameMode.*` | 默认游戏模式（指定玩家 Pawn） | `main.js` 引导 |
| `Config/DefaultInput.ini` | WASD/鼠标/开火/换弹按键 | 网页版输入 |
| `Config/DefaultEngine.ini` | 默认游戏模式 + 渲染设置 | — |

**还没做的**（后续阶段，我会陆续给你）：武器强化系统、掉落/背包、UI(UMG)、三张地图、Boss、音效、资源导入。见仓库根 `docs/UE-Migration-Report.md` 的完整路线图。

---

## 二、Windows 环境安装（一步步）

### 1. 装工具链（PowerShell 用 winget，能自动化的部分）
以**管理员**身份打开 PowerShell，逐条运行：

```powershell
winget install --id Git.Git -e
winget install --id EpicGames.EpicGamesLauncher -e
winget install --id Microsoft.VisualStudio.2022.Community -e --override "--add Microsoft.VisualStudio.Workload.NativeGame --add Microsoft.VisualStudio.Workload.ManagedDesktop --includeRecommended"
```

> 第三条装的是 **Visual Studio 2022** 并勾选「使用 C++ 的游戏开发」工作负载（UE 编译必需）。装完可能要重启。

### 2. 装 UE 引擎本体（这步是图形界面，必须你手动）
1. 打开 **Epic Games Launcher** → 登录/注册 Epic 账号。
2. 左侧 **Unreal Engine** → **Library（库）** → 点 **+** → 选择 **5.3.x** → 安装（约 **100 GB**，挑个大硬盘）。
3. 装完在 Library 里能看到 UE 5.3。

### 3. 拿到这个工程
```powershell
git clone https://github.com/tonysuper666-creator/Project-N.git
cd Project-N\ue5
```
（这个 UE 工程在仓库的 `ue5/` 子目录里，和网页版 `test/`/`final/` 并存、互不影响。）

### 4. 生成 VS 工程 & 编译
1. 右键 `ue5\ProjectN.uproject` → **Generate Visual Studio project files**
   （如果右键没这项：先双击 `.uproject`，它会提示是否重新生成/编译，点是）。
2. 双击生成的 `ProjectN.sln` 用 Visual Studio 打开，顶部配置选 **Development Editor** + **Win64**，按 **F5 / Build**。
   - **或者**直接双击 `ProjectN.uproject`，UE 会自动编译模块后打开编辑器。
3. 编译若报错 → 把报错整段发我，我改代码。

### 5. 第一次在编辑器里跑起来（图形操作）
UE 打开后：
1. **新建关卡**：File → New Level → Basic（带地面）。
2. 从 Content Drawer/放置面板拖一个 **PlayerStart** 到地面上。
3. 顶部 **Play（▶）** —— 你应该能用 **WASD 走、鼠标看、左键开火（画黄色射线）、R 换弹、空格跳**。
4. 拖几个 **PNEnemyCharacter** 到关卡里（在 Place Actors 搜 "PNEnemy"）——它们会朝你走过来近战；你开火能把它们打掉（默认 60 血，步枪 14 伤）。

> 敌人/角色现在是**默认胶囊体+无网格**（没模型也能测逻辑）。下一步再给它们挂 CC0 的 `.glb` 模型（那些资源可直接导入 UE）。

---

## 三、跑通之后，Phase 1 的下一步（我来带你做）
1. **导入 CC0 资源**：把 `test/assets/models/` 里的 `.glb`（士兵/机器人/枪）拖进 UE Content Browser（UE 原生支持 glTF 导入），挂到角色/武器上。
2. **武器 DataTable**：新建 Data Table（行类型选 `FPNWeaponData`），把网页版各枪的数值填进去，武器组件读取它。
3. **多把武器 + 切枪**、**强化系统**、**掉落/背包**、**UMG 界面**、**三张地图**、**Boss**、**音效**——按迁移报告路线图逐块推进。

---

## 四、我们怎么配合
- 我在这里写/改 UE 的 C++ 与逻辑、给你编辑器操作步骤。
- 你在 UE 里编译、导资源、连蓝图、试玩，把**编译错误 / 运行报错 / 截图**发我。
- 一轮轮迭代，直到垂直切片跑顺，再往上堆内容。

有任何一步卡住（装环境、编译报错、编辑器不会操作），直接把信息发我。
