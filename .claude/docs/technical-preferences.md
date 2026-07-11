# Technical Preferences

<!-- Populated by /setup-engine. Updated as the user makes decisions throughout development. -->
<!-- All agents reference this file for project-specific standards and conventions. -->

## Engine & Language

- **Engine**: Three.js (r0.160) — 浏览器 / WebGL，非传统引擎
- **Language**: JavaScript (ES Modules，无构建步骤)
- **Rendering**: Three.js WebGLRenderer + EffectComposer (Bloom/SMAA)
- **Physics**: 自研简易运动/碰撞 (clampToArea 分段并集 + 射线命中)

## Input & Platform

<!-- Written by /setup-engine. Read by /ux-design, /ux-review, /test-setup, /team-ui, and /dev-story -->
<!-- to scope interaction specs, test helpers, and implementation to the correct input methods. -->

- **Target Platforms**: Web (桌面浏览器优先)
- **Input Methods**: Keyboard/Mouse
- **Primary Input**: Keyboard/Mouse (FPS)
- **Gamepad Support**: None
- **Touch Support**: None
- **Platform Notes**: [TO BE CONFIGURED — any platform-specific UX constraints]

## Naming Conventions

- **Classes**: JavaScript (ES Modules，无构建步骤)
- **Variables**: JavaScript (ES Modules，无构建步骤)
- **Signals/Events**: JavaScript (ES Modules，无构建步骤)
- **Files**: JavaScript (ES Modules，无构建步骤)
- **Scenes/Prefabs**: JavaScript (ES Modules，无构建步骤)
- **Constants**: JavaScript (ES Modules，无构建步骤)

## Performance Budgets

- **Target Framerate**: JavaScript (ES Modules，无构建步骤)
- **Frame Budget**: JavaScript (ES Modules，无构建步骤)
- **Draw Calls**: JavaScript (ES Modules，无构建步骤)
- **Memory Ceiling**: JavaScript (ES Modules，无构建步骤)

## Testing

- **Framework**: JavaScript (ES Modules，无构建步骤)
- **Minimum Coverage**: JavaScript (ES Modules，无构建步骤)
- **Required Tests**: Balance formulas, gameplay systems, networking (if applicable)

## Forbidden Patterns

<!-- Add patterns that should never appear in this project's codebase -->
- [None configured yet — add as architectural decisions are made]

## Allowed Libraries / Addons

<!-- Add approved third-party dependencies here -->
- [None configured yet — add as dependencies are approved]

## Architecture Decisions Log

<!-- Quick reference linking to full ADRs in docs/architecture/ -->
- [No ADRs yet — use /architecture-decision to create one]

## Engine Specialists

<!-- Written by /setup-engine when engine is configured. -->
<!-- Read by /code-review, /architecture-decision, /architecture-review, and team skills -->
<!-- to know which specialist to spawn for engine-specific validation. -->

- **Primary**: Three.js (r0.160) — 浏览器 / WebGL，非传统引擎
- **Language/Code Specialist**: JavaScript (ES Modules，无构建步骤)
- **Shader Specialist**: JavaScript (ES Modules，无构建步骤)
- **UI Specialist**: JavaScript (ES Modules，无构建步骤)
- **Additional Specialists**: JavaScript (ES Modules，无构建步骤)
- **Routing Notes**: JavaScript (ES Modules，无构建步骤)

### File Extension Routing

<!-- Skills use this table to select the right specialist per file type. -->
<!-- If a row says JavaScript (ES Modules，无构建步骤), fall back to Primary for that file type. -->

| File Extension / Type | Specialist to Spawn |
|-----------------------|---------------------|
| Game code (primary language) | JavaScript (ES Modules，无构建步骤) |
| Shader / material files | JavaScript (ES Modules，无构建步骤) |
| UI / screen files | JavaScript (ES Modules，无构建步骤) |
| Scene / prefab / level files | JavaScript (ES Modules，无构建步骤) |
| Native extension / plugin files | JavaScript (ES Modules，无构建步骤) |
| General architecture review | Primary |
