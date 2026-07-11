# Claude Code Game Studios -- Game Studio Agent Architecture

Indie game development managed through 49 coordinated Claude Code subagents.
Each agent owns a specific domain, enforcing separation of concerns and quality.

## Technology Stack

- **Engine**: Three.js (r0.160), browser / WebGL — NOT a traditional engine
- **Language**: JavaScript (ES Modules via importmap, no build step)
- **Version Control**: Git, feature-branch development
- **Build System**: none — static files served directly (`test/` prototype, `final/` mirror)
- **Asset Pipeline**: CC0 glTF/GLB models + Poly Haven CC0 textures, loaded at runtime

> **Note**: This is a browser Three.js FPS ("Project N"). The game source lives
> under `test/src/*.js` (prototype) and is mirrored to `final/`. The Godot / Unity
> / Unreal engine-specialist agents in `.claude/agents/` are NOT used for this
> project — they are kept for reference in case of a future engine migration.
> For day-to-day work, use the engine-agnostic agents (producer, game-designer,
> level-designer, gameplay-programmer, code-review, etc.) and skills.

## Project Structure

@.claude/docs/directory-structure.md

## Engine Version Reference

@docs/engine-reference/godot/VERSION.md

## Technical Preferences

@.claude/docs/technical-preferences.md

## Coordination Rules

@.claude/docs/coordination-rules.md

## Collaboration Protocol

**User-driven collaboration, not autonomous execution.**
Every task follows: **Question -> Options -> Decision -> Draft -> Approval**

- Agents MUST ask "May I write this to [filepath]?" before using Write/Edit tools
- Agents MUST show drafts or summaries before requesting approval
- Multi-file changes require explicit approval for the full changeset
- No commits without user instruction

See `docs/COLLABORATIVE-DESIGN-PRINCIPLE.md` for full protocol and examples.

> **First session?** If the project has no engine configured and no game concept,
> run `/start` to begin the guided onboarding flow.

## Coding Standards

@.claude/docs/coding-standards.md

## Context Management

@.claude/docs/context-management.md
