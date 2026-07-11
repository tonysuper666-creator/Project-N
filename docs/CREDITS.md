# 素材署名 / Asset Credits

本项目使用了以下第三方开源素材，在此致谢并保留署名。

## 3D 角色模型

- **Soldier / "vanguard"**（`*/assets/models/Soldier.glb`）
  - 来源：three.js 官方示例资源库（<https://github.com/mrdoob/three.js> · `examples/models/gltf/Soldier.glb`），角色由 Adobe **Mixamo** 生成绑定。
  - 用途：游戏内敌人（士兵种类）与个人信息页的 3D 人物（骨骼动画：Idle / Walk / Run）。
  - 署名：按 Creative Commons Attribution（CC-BY）方式署名处理。若正式发行需更严格的授权，可无缝替换为 CC0 模型（如 Quaternius <https://quaternius.com>，CC0 公有领域），加载代码 `src/character.js` 无需改动，只需替换 `assets/models/` 下的 glb 文件。

- **RobotExpressive**（`*/assets/models/RobotExpressive.glb`）
  - 来源：three.js 官方示例资源库（<https://github.com/mrdoob/three.js> · `examples/models/gltf/RobotExpressive/RobotExpressive.glb`）。
  - 授权：**CC0 / 公有领域**（three.js 官方示例资源，可自由用于商业与非商业用途）。
  - 用途：游戏内第二类敌人（战斗机器人 / 机甲），骨骼动画（Idle / Walking / Running / Punch）经 `src/character.js` 映射到统一的 Idle/Walk/Run 接口，为小怪形象增加多样性。

## 3D 武器模型 / Weapon models

- **Kenney "Blaster Kit"**（`*/assets/models/guns/blaster-*.glb` + `Textures/colormap.png`）
  - 来源：Kenney（<https://kenney.nl/assets/blaster-kit>）。
  - 授权：**CC0（Creative Commons Zero，公有领域）**，可自由用于个人、教育与商业用途、无需署名（此处署名仅为致谢）。见 `assets/models/guns/KENNEY_LICENSE.txt`。
  - 用途：第一人称手持武器模型（步枪 / 冲锋枪 / 激光步枪 / 加特林 / 狙击枪 / 激光狙 / 火箭筒 / 连发火箭 / 手枪），由 `src/viewmodel.js` 按武器加载对应 glb 并自动归一化朝向。

## 场景贴图 / Environment textures

伦敦街区场景使用 **Poly Haven**（<https://polyhaven.com>）的 **CC0 公有领域**照片级贴图，可自由用于商业与非商业用途、无需署名（此处署名仅为致谢）：

- `red_brick_03` → `assets/textures/brick_red.jpg`（红砖排屋外墙）
- `brick_wall_006` → `assets/textures/brick_wall.jpg`（砖墙）
- `concrete_wall_008` → `assets/textures/stone.jpg`（石材/地标外墙）
- `asphalt_02` → `assets/textures/asphalt.jpg`（沥青路面）
- `pavement_02` → `assets/textures/pavement.jpg`（人行道）
- `cobblestone_floor_04` → `assets/textures/cobble.jpg`（石板路 / 巴黎鹅卵石）
- `plastered_stone_wall` → `assets/textures/limestone.jpg`（巴黎奥斯曼石灰岩外墙）
- `roof_tiles_14` → `assets/textures/roof.jpg`（巴黎芒萨尔屋顶）
- `beige_wall_001` → `assets/textures/paris_wall.jpg`（米色墙面点缀）

以上均为 Poly Haven CC0（Creative Commons Zero，公有领域）授权的真实照片贴图，合法可嵌入并离线使用。

> 注：程序化生成的几何体、canvas 贴图、Web Audio 合成音效均为本项目原创，无第三方素材。
