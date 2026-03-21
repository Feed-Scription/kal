---
name: build-game
description: SOP for building a complete game with KAL-AI Flow engine. Includes an integrated game design phase (MDA framework, Design Depth Tier, soul design, genre patterns) with multi-round dialogue for idea refinement, then proceeds to technical implementation (State → Flow → Session → Config → Lint → Test). Use when the user wants to create a new game, design a game, add game features, or needs guidance on KAL-AI game development workflow. For pure technical reference (node schemas, CLI commands, session step types), use the `kal-engine` skill instead.
---

# KAL-AI Game Building SOP

You are an expert KAL-AI game developer. Follow this SOP to build high-quality text games efficiently.

**User request:** $ARGUMENTS

---

## Foundational Rules

> **KAL-AI architecture**: A game is a project directory containing JSON configuration files. The engine reads these files and drives the game. The three layers are: Session (interaction rhythm), Flow (DAG logic), Node (composable units). Large language models generate creative content at runtime; game rules validate and constrain it.

> **Project structure**: Every KAL-AI game project is a directory with `kal_config.json`, `initial_state.json`, `session.json`, `flow/*.json`, and optionally `node/` for custom nodes.

---

## Workflow Overview

```
/build-game "game idea"
    ↓
Phase 0: Game Design
├─ Step 1: Guided dialogue → refine idea (multi-round)
├─ Step 2: Save design/ folder to project directory
├─ Step 3: User confirms (implement / modify / stop)
└─ Step 4: Extract technical requirements from design/ files
    ↓
Phase 1-7: Technical Implementation
├─ Phase 1: Create project directory + kal_config.json
├─ Phase 2: Design initial_state.json (from design/rules.md + design/subsystems.md)
├─ Phase 3: Design session.json (interaction skeleton)
├─ Phase 4: Implement Flow files (DAG logic + LLM integration)
├─ Phase 5: Add custom nodes if needed (from design/rules.md)
├─ Phase 6: Add game content + fallback prompts (from design/content.md + design/ai-plan.md)
└─ Phase 7: Testing & polish
```

---

## Phase 0: Game Design Phase

Before writing any JSON, engage the user in a structured game design process.

### Step 1: Guided design dialogue

> **CRITICAL — First Action**: You MUST use the Read tool to read the full contents of `game-design-guide.md` (located in the same directory as this SKILL.md) BEFORE starting any dialogue with the user. This file contains the MDA framework, core loop types, design dialogue workflow, and behavioral guidelines. Do NOT proceed without reading it first.

Follow the methodology-driven design process in [game-design-guide.md](game-design-guide.md). The guide includes a **Design Depth Tier** system (Quick/Standard/Deep) to match design depth to game ambition. The 4-phase dialogue:

1. **Phase 0a 发现** — 识别美学信号，确认核心循环方向，**确定 Depth Tier**（1-3 轮）
2. **Phase 0b 方案生成** — 2-3 个方向不同的方案供选择（1 轮）
3. **Phase 0c 深化** — 细化资源、进程、内容、结局等关键设计；**Deep tier 追加子系统设计、系统交织、后期新鲜感、隐藏内容、数值深度、交互层次**（Quick/Standard: 2-4 轮, Deep: 4-8 轮）
4. **Phase 0d 验证与输出** — 质量检查 + 蓝图输出（1-2 轮）

Reference files loaded on demand during the dialogue:
- [genre-patterns.md](game-design-references/genre-patterns.md) — Phase 0c: genre-specific design patterns
- [design-toolkit.md](game-design-references/design-toolkit.md) — When facing specific design challenges
- [blueprint/](game-design-references/blueprint/) — Phase 0d: output template + quality checklist (folder with 3 files)
- [ai-integration-guide.md](game-design-references/ai-integration-guide.md) — Phase 0c/3/4: AI application patterns, fallback strategies
- [soul-design-guide.md](game-design-references/soul-design-guide.md) — Phase 0c/0d/4/6: emotional design, AI-native experience, moment feel, player identity, discovery architecture

> **Important**: Do NOT rush through this phase. The quality of the design folder directly determines the quality of the implementation. Let the user drive the pace.

#### Mandatory: EVERY question MUST use `AskUserQuestion`

> **CRITICAL RULE**: In the entire game design phase, **every single question** you ask the user **MUST** be presented via the `AskUserQuestion` tool with clickable options. There are **NO exceptions**. Even questions that seem "open-ended" should have 2-4 common directions as options — the user can always select "Other" to provide free-form input.

**Pattern:**
1. First, use a brief text sentence to introduce the question context
2. Then **immediately** call `AskUserQuestion` with 2-4 concise, distinct options
3. Wait for the user's selection before asking the next question
4. **One question at a time** — never batch multiple questions in one message
5. Total questions by **Design Depth Tier**: Quick **6-8**, Standard **8-12**, Deep **12-20** — don't ask what can be inferred

### Step 2: Save the design document

When the design blueprint is finalized through dialogue, **save it as a folder of layered markdown files** — NOT a single monolithic file. This folder serves as the single source of truth for all subsequent implementation phases.

**Save path**: `{game-name}/design/`

Create the directory first (`mkdir -p {game-name}/design`).

#### Folder structure

```
design/
├── README.md              # 设计定位 + 一句话描述 + 核心玩法 + 文件索引（必须）
├── rules.md               # 游戏规则 + 资源与指标 + 结局设计（必须）
├── content.md             # 游戏元素（角色/NPC/事件/物品等）+ 游戏流程（必须）
├── ai-plan.md             # AI 应用规划 + 后备内容需求 + AI 架构要点（必须）
├── soul.md                # 灵魂设计：情感核心 + AI 原生体验 + 玩家身份与发现（必须）
├── subsystems.md          # 子系统设计 + 系统交织 + 数值公式（Standard/Deep）
└── progression.md         # 后期新鲜感 + 阶段解锁 + 策略转换点 + 隐藏内容（Deep）
```

**README.md 必须包含文件索引**，列出每个文件的内容摘要和适用阶段，让实现阶段能按需加载：

```markdown
## 文件索引

| 文件 | 内容 | 实现阶段参考 |
|------|------|------------|
| rules.md | 游戏规则、资源指标、结局 | Phase 2 (State), Phase 4 (Flows) |
| content.md | 角色、事件、游戏流程 | Phase 6 (Content) |
| ai-plan.md | AI 应用范围、后备需求 | Phase 4 (Flows), Phase 5 (Nodes) |
| soul.md | 情感设计、AI 原生体验 | Phase 4 (Prompts), Phase 6 (Content) |
| subsystems.md | 子系统、公式、交互 | Phase 2 (State), Phase 4 (Flows) |
| progression.md | 阶段解锁、隐藏内容 | Phase 4 (Flows), Phase 6 (Content) |
```

**File content**: Follow the templates in [blueprint/design-template.md](game-design-references/blueprint/design-template.md), which defines the content for each file.

**Tier determines which files are required:**
- **Quick**: README.md + rules.md + content.md + ai-plan.md + soul.md (5 files)
- **Standard**: + subsystems.md (6 files)
- **Deep**: + subsystems.md + progression.md (7 files)

After saving, inform the user:
> "Design documents saved to `{game-name}/design/`. This folder will be the reference for all implementation decisions. Each implementation phase only loads the files it needs."

### Step 3: Confirm next steps

After the design folder is saved, ask the user:

- "The design documents are ready and saved. Shall we proceed to implement this game with KAL-AI?"
- "Or would you like to adjust the design first?"

**User options:**
- **Proceed with implementation** → Continue to Phase 1
- **Modify design** → Continue iterating on the design, re-save when done
- **Design document only** → Stop here, the saved design folder is the deliverable

### Step 4: Extract technical requirements

Before moving to Phase 1, read the design folder's key files and analyze them:

1. **State schema** — Read `design/rules.md` + `design/subsystems.md` → What state keys are needed in `initial_state.json`?
2. **Session skeleton** — Read `design/content.md` → What is the interaction flow? (intro → character creation → turn loop → endings)
3. **Flow list** — Read `design/rules.md` + `design/content.md` → What Flow files are needed? (main turn, narration, character creation, endings, etc.)
4. **Custom nodes** — Read `design/rules.md` + `design/subsystems.md` → Are there game rules that need custom Node implementations?
5. **AI integration scope** — Read `design/ai-plan.md` → Which Flows use LLM nodes? What prompt strategies? (see [ai-integration-guide.md](game-design-references/ai-integration-guide.md))

Only load the files needed for each phase — don't read the entire folder at once.

---

## Phase 1: Project Setup

Create the game project directory with the required configuration.

### 1a. Create project directory

```bash
mkdir -p {game-name}/flow
mkdir -p {game-name}/node  # only if custom nodes are needed
```

### 1b. Create kal_config.json

```json
{
  "name": "{game-name}",
  "version": "1.0.0",
  "engine": {
    "logLevel": "warn",
    "maxConcurrentFlows": 1,
    "timeout": 60000
  },
  "llm": {
    "provider": "openai",
    "apiKey": "${OPENAI_API_KEY}",
    "baseUrl": "${OPENAI_BASE_URL}",
    "defaultModel": "gpt-4o-mini",
    "retry": {
      "maxRetries": 2,
      "initialDelayMs": 1000,
      "maxDelayMs": 10000,
      "backoffMultiplier": 2,
      "jitter": true
    },
    "cache": {
      "enabled": false
    }
  }
}
```

Environment variables (`${VAR}`) are resolved at runtime by the engine's `ConfigLoader`.

### 1c. Verify the project runs

```bash
node apps/engine/dist/bin.js serve {game-name}
```

---

## Phase 2: Design Initial State

**This is the most critical design decision.** The state shape determines everything else.

### Map design rules to state schema

Translate `design/rules.md`'s resources/metrics and `design/subsystems.md`'s system attributes into `initial_state.json`:

```json
{
  "playerName": { "type": "string", "value": "冒险者" },
  "health":     { "type": "number", "value": 100 },
  "maxHealth":  { "type": "number", "value": 100 },
  "gold":       { "type": "number", "value": 50 },
  "inventory":  { "type": "array",  "value": ["铁剑", "火把"] },
  "questStage": { "type": "string", "value": "arrived" },
  "history":    { "type": "array",  "value": [] },
  "summary":    { "type": "string", "value": "" }
}
```

### State design principles

1. **Flat structure** — Each key is a top-level `{ type, value }` pair. No nesting.
2. **Supported types** — `string`, `number`, `boolean`, `object`, `array`
3. **JSON serializable** — Only plain values. No class instances, functions, or Maps.
4. **Include `history`** — Always include a `history` array for LLM conversation context. `GenerateText` auto-manages it.
5. **Include `summary`** — For long games, include a `summary` string for compressed history context.
6. **Design for WriteState** — State keys that LLM output should update must exist in initial state. `WriteState` only modifies existing keys.

### Design → State mapping

| Design Element | State Key Pattern | Example |
|---------------|------------------|---------|
| Player stats | `health`, `strength`, `dexterity` | `{ "type": "number", "value": 100 }` |
| Resources | `gold`, `energy` | `{ "type": "number", "value": 50 }` |
| Progress flags | `questStage`, `createMode` | `{ "type": "string", "value": "arrived" }` |
| Inventory/collections | `inventory`, `skills` | `{ "type": "array", "value": [] }` |
| Location | `currentLocation` | `{ "type": "string", "value": "town_square" }` |
| Conversation history | `history` | `{ "type": "array", "value": [] }` |
| Compressed context | `summary` | `{ "type": "string", "value": "" }` |
| Character info | `playerName`, `race`, `class` | `{ "type": "string", "value": "" }` |

---

## Phase 3: Design Session

The Session is the **interaction skeleton** — it defines the player-facing flow of the game using a simple state machine.

### Session step types

| Step Type | Purpose | Key Fields |
|-----------|---------|------------|
| `RunFlow` | Execute a Flow (no player input needed) | `flowRef`, `next` |
| `Prompt` | Ask player for text input, optionally trigger a Flow | `promptText`, `stateKey?`, `flowRef?`, `inputChannel?`, `next` |
| `Choice` | Present options to player, optionally trigger a Flow | `promptText`, `options[]`, `stateKey?`, `flowRef?`, `inputChannel?`, `next` |
| `Branch` | Conditional jump based on state | `conditions[]`, `default` |
| `End` | End the game | — |

### Session design patterns

**Turn loop** (most common for RPG/adventure):
```
intro → character_setup → turn → check_end → turn (loop)
                                    ↓
                              death / victory → end
```

**Prompt + Flow** pattern: `Prompt` collects player input, passes it to a Flow via `inputChannel`, the Flow processes it (LLM call, state updates), and returns output to display.

**Choice + Flow** pattern: `Choice` presents options, the selected value is passed to a Flow via `inputChannel` for processing.

### Example session.json

```json
{
  "schemaVersion": "1.0.0",
  "name": "Game Name",
  "description": "Game description",
  "steps": [
    { "id": "intro", "type": "RunFlow", "flowRef": "intro", "next": "turn" },
    {
      "id": "turn", "type": "Prompt",
      "flowRef": "main", "inputChannel": "playerInput",
      "promptText": "你的行动？", "next": "check"
    },
    {
      "id": "check", "type": "Branch",
      "conditions": [
        { "when": "state.health <= 0", "next": "death" },
        { "when": "state.questStage == 'completed'", "next": "victory" }
      ],
      "default": "turn"
    },
    { "id": "death", "type": "RunFlow", "flowRef": "outro-death", "next": "end" },
    { "id": "victory", "type": "RunFlow", "flowRef": "outro-win", "next": "end" },
    { "id": "end", "type": "End" }
  ]
}
```

### Session design principles

1. **Keep Session thin** — Session is the "interaction shell". Complex logic belongs in Flows, not Session.
2. **Turn loop = game heartbeat** — The `Prompt → Flow → Branch → Prompt` cycle is the core game loop.
3. **Branch on state** — Use `Branch` steps to check win/lose conditions after each turn.
4. **History compaction** — For long games, add a Branch to check `state.history.length >= N` and run a compaction Flow.

---

## Phase 4: Implement Flows

Flows are the **logic core**. Each Flow is a JSON DAG (directed acyclic graph) of nodes connected by edges.

### Flow structure

```json
{
  "meta": {
    "schemaVersion": "1.0.0",
    "name": "flow-name",
    "description": "What this flow does",
    "inputs": [{ "name": "playerInput", "type": "string", "required": true }],
    "outputs": [{ "name": "result", "type": "object" }]
  },
  "data": {
    "nodes": [...],
    "edges": [...]
  }
}
```

### Available built-in nodes

> **Technical reference**: For full node API (inputs/outputs/config schemas for all 17 nodes), CLI commands, and session step types, use the `kal-engine` skill or run `kal schema nodes`.

| Category | Node | Purpose |
|----------|------|---------|
| Signal | `SignalIn` / `SignalOut` | Flow input/output ports |
| State | `ReadState` / `WriteState` / `ComputeState` | Read/write game state |
| LLM | `PromptBuild` / `Message` / `GenerateText` / `GenerateImage` / `UpdateHistory` / `CompactHistory` | Build prompts, assemble messages, call LLM, manage history |
| Transform | `JSONParse` / `PostProcess` / `Regex` / `SubFlow` | Parse, transform, and delegate |
| Utility | `Constant` | Output fixed values |

### The core LLM chain pattern

This is the most important pattern — calling LLM and applying results to state:

```
SignalIn (playerInput)
    ↓
PromptBuild (system prompt + state data via fragments)
    ↓
Message (inject conversation history from state)
    ↓
GenerateText (call LLM, auto-manage history)
    ↓
JSONParse (extract structured data from LLM response)
    ↓
WriteState (write stateChanges back to StateStore)
    ↓
SignalOut (return result for display)
```

### PromptBuild fragment system

`PromptBuild` uses fragments to compose prompts:

| Fragment Type | Purpose | Example |
|--------------|---------|---------|
| `base` | Static text (rules, world description) | System prompt, game rules |
| `field` | Dynamic data from state (`state.xxx`) | `state.health`, `state.inventory` |
| `when` | Conditional inclusion based on state | Include combat rules only when in combat |
| `randomSlot` | Random selection (with seed support) | Random flavor text |
| `budget` | Token budget control | Limit history context size |

### WriteState pattern

Let LLM return structured JSON with a `stateChanges` object, then use `WriteState` to safely write back:

```
LLM returns: { "narrative": "...", "stateChanges": { "health": 85, "gold": 60 } }
    ↓
JSONParse extracts the object
    ↓
WriteState config: { "path": "stateChanges", "allowedKeys": ["health", "gold", "currentLocation"] }
    ↓
Only existing state keys in the allowedKeys whitelist are updated
```

### SubFlow pattern

Break complex logic into reusable sub-flows:

```
main.json → SubFlow node (ref: "narrate") → narrate.json
```

The SubFlow node's `inputs`/`outputs` must match the referenced Flow's `meta.inputs`/`meta.outputs`.

### Flow design principles

1. **One Flow per concern** — Separate intro, main turn, narration, character creation, endings into different Flows.
2. **AI generation + rule validation** — LLM generates creative content, game rules (via WriteState allowedKeys, custom nodes) validate and constrain it. Never let LLM directly set arbitrary state.
3. **Every LLM call needs fallback thinking** — Design prompts carefully. Use `JSONParse` with `fixCommonErrors: true` and `fixTruncated: true` to handle malformed LLM output.
4. **History management is automatic** — `GenerateText` auto-appends to `state.history`. Use `Message` node's `historyKey` and `maxHistoryMessages` to control context.
5. **Use SubFlow for reuse** — If multiple Flows share the same narration logic, extract it into a SubFlow.

### AI prompt design (from soul-design-guide)

> **Soul-aware prompts**: When writing AI system prompts in `PromptBuild` fragments, read `design/soul.md` for emotional hooks and AI-native techniques. Use the prompt templates in [soul-design-guide.md](game-design-references/soul-design-guide.md).

Every AI system prompt should include:
- **Tone instructions** — Clear narrative style (humorous/cold/warm/ironic)
- **Callback instructions** — "Must reference at least 1 historical decision"
- **Three-beat structure** — "Events follow: normalcy → twist → dilemma"
- **Prohibition list** — What NOT to do (don't expose numbers directly, don't be too verbose, etc.)
- **Surprise space** — "Occasionally (10% chance) add an unexpected but reasonable element"
- **Emotional anchors** — "Choices should involve specific people, not abstract metrics"

---

## Phase 5: Custom Nodes (if needed)

When built-in nodes don't cover specific game rules, create custom nodes in the `node/` directory.

### When to use custom nodes

- Complex game rule calculations (combat formulas, skill checks)
- Domain-specific logic that doesn't fit into the standard LLM chain
- Validation logic that goes beyond WriteState's allowedKeys

### Custom node interface

```typescript
import type { CustomNode, NodeContext } from '@kal-ai/core';

const myNode: CustomNode = {
  type: 'dice-roll',
  label: 'Dice Roll',
  category: 'game-rules',
  inputs: [
    { name: 'sides', type: 'number' },
    { name: 'modifier', type: 'number' },
  ],
  outputs: [
    { name: 'result', type: 'number' },
    { name: 'critical', type: 'boolean' },
  ],
  configSchema: { sides: { type: 'number', default: 20 } },
  defaultConfig: { sides: 20 },
  async execute(inputs, config, context: NodeContext) {
    const sides = inputs.sides ?? config.sides;
    const roll = Math.floor(Math.random() * sides) + 1;
    const result = roll + (inputs.modifier ?? 0);
    return { result, critical: roll === sides };
  },
};

export default myNode;
```

Place custom node files in `{game-name}/node/`. The engine auto-discovers `.ts`/`.js` files in this directory.

### Custom node design principles

1. **Keep nodes focused** — One node, one responsibility.
2. **Use NodeContext** — Access `context.state` for StateStore, `context.llm` for LLM calls, `context.flow.execute` for SubFlow execution.
3. **Pure computation preferred** — Custom nodes work best for deterministic game rules. Use built-in LLM nodes for AI generation.

---

## Phase 6: Add Game Content & Fallback Prompts

> **Critical**: AI-powered games need carefully designed prompts AND well-structured state to enable graceful degradation. See [ai-integration-guide.md](game-design-references/ai-integration-guide.md) for fallback strategies.

### Translate design document to game content

> **Soul-aware content**: When creating game content, read `design/soul.md` for emotional hooks, AI-native techniques, and discovery architecture. Use the prompt templates in [soul-design-guide.md](game-design-references/soul-design-guide.md).

Read `design/content.md` and `design/ai-plan.md` to convert narrative elements into:

**PromptBuild fragments** — The system prompts that drive LLM behavior:
- World description and rules (as `base` fragments)
- Dynamic state injection (as `field` fragments referencing `state.xxx`)
- Conditional context (as `when` fragments)

**Initial state content** — Pre-populated state values:
- Character presets (in state or as Choice options in Session)
- Starting inventory, location, quest stage

**Flow-level content** — Events, scenes, and narrative structures encoded in Flow logic:
- Intro Flow with opening narrative
- Character creation Flow with preset options
- Ending Flows with different narrative tones

### AI prompt templates

For each LLM-calling Flow, design the `PromptBuild` fragments carefully:

**Turn simulation prompt** (in main Flow's PromptBuild):
```
base fragment: "You are the narrator of a {genre} game. Given the player's action and current state, generate the outcome as JSON..."
field fragment: state.health, state.inventory, state.currentLocation
field fragment: state.history (with window/sample for context control)
when fragment: "Include combat rules when state.questStage == 'combat'"
```

**Structured output instruction** (in PromptBuild):
```
base fragment: "Output MUST be valid JSON with this structure:
{
  \"narrative\": \"what happened (2-3 sentences)\",
  \"stateChanges\": { \"health\": <new value>, \"gold\": <new value>, ... }
}"
```

### History compaction

For games longer than ~10 turns, implement a history compaction Flow:

```
ReadState (get history array)
    ↓
PromptBuild ("Summarize these events into 2-3 sentences")
    ↓
GenerateText (generate summary)
    ↓
ModifyState (write summary to state.summary, clear history)
```

Trigger this from Session via a Branch step checking `state.history.length >= 10`.

---

## Phase 7: Testing & Polish

### Test with the TUI

```bash
node apps/engine/dist/bin.js play {game-name}
```

Built-in TUI commands:
- `/state` — View current state
- `/quit` — Exit
- `/help` — Help

### Test with the HTTP API

```bash
node apps/engine/dist/bin.js serve {game-name}
# Then use the Editor or curl to test individual Flows
```

### Testing checklist

- [ ] Game starts correctly (intro Flow runs, initial state is correct)
- [ ] Character creation works (if applicable)
- [ ] Core turn loop works (player input → LLM response → state update → display)
- [ ] Win/lose conditions trigger correctly (Branch steps in Session)
- [ ] History compaction works (if applicable)
- [ ] LLM output is properly parsed (JSONParse handles edge cases)
- [ ] WriteState only updates allowed keys (no unexpected state mutations)
- [ ] State values stay in reasonable ranges
- [ ] Game ends properly (End step reached)
- [ ] All Flows have valid meta.inputs/outputs contracts
- [ ] SubFlow contracts match parent Flow node definitions
- [ ] Custom nodes (if any) handle edge cases

### Common issues

| Issue | Cause | Fix |
|-------|-------|-----|
| LLM returns malformed JSON | Prompt not clear enough | Add explicit JSON format instruction in PromptBuild; enable `fixCommonErrors` in JSONParse |
| State not updating | WriteState allowedKeys missing the key | Add the key to allowedKeys whitelist |
| History grows too large | No compaction | Add history compaction Flow + Branch trigger in Session |
| LLM ignores game rules | Rules not in prompt | Add game rules as `base` fragments in PromptBuild |
| SubFlow contract mismatch | inputs/outputs don't match | Verify SubFlow node's handles match the referenced Flow's meta |

---

## Quick Reference

For game design workflow:
- [game-design-guide.md](game-design-guide.md) — Phase 0 methodology framework (MDA, core loops, Design Depth Tier, 4-phase dialogue)
- [genre-patterns.md](game-design-references/genre-patterns.md) — Genre-specific design patterns + Depth Scaling patterns (simulation, narrative, dialogue, board)
- [design-toolkit.md](game-design-references/design-toolkit.md) — Actionable design frameworks: interlocking systems, anti-monotony, numerical design, replayability, multi-layer interaction, pitfall checklist, AI game anti-patterns
- [blueprint/](game-design-references/blueprint/) — design/ folder output template, quality checklist (20 items), assessment trap anti-pattern (folder with 3 files)

For game soul (emotional design & AI-native experience):
- [soul-design-guide.md](game-design-references/soul-design-guide.md) — Five pillars (emotional hook, AI-native magic, moment feel, player identity, discovery architecture), soul review checklist (12 items), implementation patterns with prompt templates, AI system prompt soul checklist

For AI integration:
- [ai-integration-guide.md](game-design-references/ai-integration-guide.md) — AI application scenarios, architecture patterns (AI+rule validation, graceful degradation, state compression), fallback content guidelines, implementation checklist

For KAL-AI technical reference:
- Use the `kal-engine` skill (user-level) — All 17 node schemas, 6 session step types, 12 CLI commands (71+ subcommands), design patterns, and project file templates
- Or run `kal schema nodes` / `kal schema node <type>` / `kal schema session` for live schema introspection
