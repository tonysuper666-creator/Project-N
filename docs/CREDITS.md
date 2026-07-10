# 素材署名 / Asset Credits

本项目使用了以下第三方开源素材，在此致谢并保留署名。

## 3D 角色模型

- **Soldier / "vanguard"**（`*/assets/models/Soldier.glb`）
  - 来源：three.js 官方示例资源库（<https://github.com/mrdoob/three.js> · `examples/models/gltf/Soldier.glb`），角色由 Adobe **Mixamo** 生成绑定。
  - 用途：游戏内敌人与个人信息页的 3D 人物（骨骼动画：Idle / Walk / Run）。
  - 署名：按 Creative Commons Attribution（CC-BY）方式署名处理。若正式发行需更严格的授权，可无缝替换为 CC0 模型（如 Quaternius <https://quaternius.com>，CC0 公有领域），加载代码 `src/character.js` 无需改动，只需替换 `assets/models/` 下的 glb 文件。

> 注：程序化生成的几何体、canvas 贴图、Web Audio 合成音效均为本项目原创，无第三方素材。
