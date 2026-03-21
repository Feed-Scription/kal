<div align="center">

<img src="assets/kal-logo.png" alt="KAL Logo" width="400">

# KAL — Kal AI Layer

**A flow engine for AI-native games and interactive applications**

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

*Define game logic in JSON. Let the engine handle the rest.*

[Quick Start](#quick-start) · [How It Works](#how-it-works) · [CLI](#cli-tools) · [Examples](#examples) · [Docs](#documentation)

**[中文文档](./README.zh-CN.md)**

</div>

---

## What is KAL?

KAL is a flow engine that lets you build AI-driven games and interactive applications by writing JSON instead of code. You declare **what** should happen — state changes, LLM calls, branching logic — and the engine handles **how** it runs.

Three layers, each with a clear job:

```
Session    "When does the player interact?"     State machine for multi-turn dialogue
   ↓
Flow       "What happens each turn?"            DAG workflows in JSON
   ↓
Node       "How is each step executed?"         Composable units: state I/O, LLM, transforms
```

Batteries included: runtime, CLI toolchain (12 commands, 71+ subcommands), Studio workbench, HTTP API, and example games.

## How It Works

A KAL project is three JSON files + an optional `node/` directory:

```
my-game/
├── initial_state.json     # State declarations (all keys must be pre-declared)
├── session.json           # Session state machine (player journey)
├── kal_config.json        # Engine + LLM configuration
├── flow/                  # Flow DAG definitions
│   ├── main.json
│   ├── narrate.json
│   └── ...
└── node/                  # Custom nodes (optional, TypeScript)
```

**State** — flat key-value store with typed values and constraints:
```json
{
  "playerName": { "type": "string", "value": "" },
  "health":     { "type": "number", "value": 100, "min": 0, "max": 200 },
  "inventory":  { "type": "array",  "value": ["sword"] }
}
```

**Flow** — DAG of nodes wired together. Each flow has a `meta` (inputs/outputs) and `data` (nodes + edges):
```
SignalIn → PromptBuild → Message → GenerateText → JSONParse → WriteState → SignalOut
```

**Session** — state machine that drives multi-turn interaction using 6 step types:
`RunFlow` · `Prompt` · `Choice` · `DynamicChoice` · `Branch` · `End`

```
intro(RunFlow) → turn(Prompt) → check(Branch) → turn | death(End) | victory(End)
```

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                       KAL Architecture                        │
├──────────────────────────────────────────────────────────────┤
│  apps/                                                        │
│  ├── engine/          CLI + HTTP API + TUI host               │
│  └── studio/          Visual Studio workbench                 │
├──────────────────────────────────────────────────────────────┤
│  packages/                                                    │
│  ├── core/            Flow runtime + Session mgmt + Nodes     │
│  └── create-kal-game/ Project scaffolding (kal init)          │
├──────────────────────────────────────────────────────────────┤
│  examples/                                                    │
│  ├── dnd-adventure/        DND text adventure (9 flows)       │
│  ├── showcase-signal-watch/ Storm beacon keeper (3 flows)     │
│  └── castaway/             Survival game (7 flows)            │
└──────────────────────────────────────────────────────────────┘
```

## Core Features

### 17 Built-in Nodes

| Category | Nodes | Purpose |
|----------|-------|---------|
| **Signal** | SignalIn, SignalOut, Timer | I/O channels and event handling |
| **State** | ReadState, WriteState | State read/write operations |
| **LLM** | PromptBuild, Message, GenerateText, GenerateImage, UpdateHistory, CompactHistory | AI model invocation and prompt engineering |
| **Transform** | Regex, JSONParse, PostProcess, SubFlow | Data processing and flow composition |
| **Utility** | Constant, ComputeState | Static values and computed state |

### Flow JSON Runtime
- **Declarative** — `meta + data` structure with input/output contracts
- **Visual orchestration** — DAG workflows with conditional branching
- **SubFlow reuse** — Break complex logic into reusable sub-flows

### Session Layer
- **Multi-turn dialogue** — 6 step types cover all interaction patterns
- **State persistence** — Auto-save and restore game progress
- **Multiple interfaces** — CLI, TUI, HTTP API, Studio

### Extensibility
- **Custom nodes** — TypeScript nodes in `node/` directory, auto-discovered by the engine
- **Any LLM provider** — OpenAI, DeepSeek, Ollama, or any OpenAI-compatible API

## Quick Start

### Prerequisites
- Node.js >= 18
- pnpm (recommended) or npm

### One-liner Setup
```bash
# 1. Clone
git clone https://github.com/Feed-Scription/kal.git
cd kal

# 2. Install dependencies and link the CLI
pnpm run setup

# 3. Configure (supports any OpenAI-compatible provider)
kal config init

# 4. Play
kal play examples/dnd-adventure
```

### Manual Setup
```bash
# 1. Clone
git clone https://github.com/Feed-Scription/kal.git
cd kal

# 2. Install dependencies (this also builds engine/core/studio)
pnpm install

# 3. Link the CLI globally
pnpm run link:global

# 4. Configure API key
kal config init          # interactive
# or directly:
kal config set-key openai sk-your-api-key
```

### Configuration

```bash
# List all config
kal config list

# Set API keys
kal config set-key openai sk-xxx
kal config set-key deepseek sk-xxx

# Set custom API endpoint
kal config set openai.baseUrl https://api.deepseek.com/v1

# View / remove config
kal config get openai.apiKey
kal config remove openai.apiKey
```

## CLI Tools

KAL ships with 12 commands covering the full development lifecycle:

```
kal init  →  kal lint  →  kal play / debug  →  kal studio  →  kal serve
 create      validate      test & debug        visual edit     deploy
```

### Project

| Command | Description |
|---------|-------------|
| `kal init <name>` | Scaffold a new project (`--template minimal\|game`) |
| `kal config` | Manage user-level config (`init`, `set`, `get`, `list`, `remove`, `set-key`) |

### Develop & Test

| Command | Description |
|---------|-------------|
| `kal lint [path]` | Static analysis — session validation, unused flows, state refs, node config |
| `kal smoke [path]` | Automated smoke test (`--steps N`, `--input`, `--dry-run`) |
| `kal eval` | Prompt A/B testing (`nodes`, `render`, `run`, `compare`) |
| `kal schema` | Introspect node types and session step schemas |

### Run & Debug

| Command | Description |
|---------|-------------|
| `kal play [path]` | Interactive TUI player (`--lang en\|zh-CN`) |
| `kal debug` | Step-by-step debugging with state inspection (`start`, `step`, `continue`, `state`, `diff`, `retry`, `skip`) |

### Serve & Edit

| Command | Description |
|---------|-------------|
| `kal serve [path]` | HTTP API server (`--host`, `--port`) |
| `kal studio [path]` | Studio workbench — visual flow editor, session editor, state inspector, debug UI |

### Data Manipulation

| Command | Description |
|---------|-------------|
| `kal flow` | CRUD for flows, nodes, edges, and prompt fragments |
| `kal session` | CRUD for session definition and steps |

All commands support `--format json` for structured output. See [CLI Reference](./docs/reference/cli.md) for the full command tree.

## Examples

### DND Adventure
A complete single-player DND-style text adventure — 9 flows, 2 custom nodes:

```bash
kal play examples/dnd-adventure
```

- Dynamic character creation with preset classes
- AI-driven narrative with prompt caching (static/dynamic split)
- Turn-based combat, inventory management, multiple endings

<details>
<summary>Gameplay preview</summary>

**Character creation:**
```
Welcome to the DND Adventure!

Create your character:
Name: Aria
Class: [1] Warrior [2] Mage [3] Rogue
Choice: 1

Warrior Aria created!
Stats (20 points total):
STR: 8, DEX: 6, INT: 3, CON: 3
HP: 30/30
```

**AI narrative:**
```
You step into an ancient dungeon...

Strange sounds echo through the dim corridor. Ancient runes
are carved into the stone walls. Suddenly, a goblin leaps
from the shadows!

What do you do?
[1] Attack the goblin
[2] Try to communicate
[3] Look for another path
```

**Combat:**
```
Battle start!

Aria (HP: 30/30) vs Goblin (HP: 15/15)

Your turn:
[1] Normal attack [2] Skill attack [3] Defend

> Attack...
Roll: 15 (Success!)
You deal 8 damage to the goblin!
```

</details>

### Storm Beacon Watch
A 15-minute survival showcase — manage fuel, tower integrity, and crew morale across 4 storm nights:

```bash
kal play examples/showcase-signal-watch
```

### Castaway
A survival game with resource management and branching narrative:

```bash
kal play examples/castaway
```

## HTTP API

```bash
kal serve examples/dnd-adventure
```

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/project` | Project snapshot |
| `GET` | `/api/flows` | List flows |
| `GET` | `/api/session` | Session definition |
| `GET` | `/api/state` | Current state snapshot |
| `GET` | `/api/diagnostics` | Lint / diagnostics |
| `POST` | `/api/executions` | Execute a flow |
| `POST` | `/api/runs` | Create a managed run |
| `POST` | `/api/runs/:id/advance` | Advance a run |
| `GET` | `/api/runs/:id/state` | Inspect run state |
| `GET` | `/api/runs/:id/stream` | Subscribe to run events (SSE) |

See [server.ts](./apps/engine/src/server.ts) for the full endpoint list (55+ endpoints).

## Development

```bash
# Run tests
pnpm --filter @kal-ai/core test
pnpm --filter @kal-ai/engine test

# Build
pnpm --filter @kal-ai/core build
pnpm --filter @kal-ai/engine build
pnpm --filter studio build
```

### Custom Nodes

Create custom business nodes in your project's `node/` directory:

```typescript
// node/ability-check.ts
export default {
  type: 'AbilityCheck',
  execute: async (input, context) => {
    const { ability, difficulty } = input;
    const stats = context.state.player.stats;
    const roll = Math.floor(Math.random() * 20) + 1;
    const total = roll + stats[ability];
    return { roll, total, success: total >= difficulty };
  }
};
```

Nodes are auto-discovered — drop a `.ts` file in `node/` and the engine picks it up.

## Documentation

| Document | Description |
|----------|-------------|
| [Getting Started](./docs/getting-started.md) | Quick start guide |
| [Core Concepts](./docs/concepts.md) | Node, Flow, State, Session |
| [Project Structure](./docs/project-structure.md) | File-by-file breakdown |
| [CLI Reference](./docs/reference/cli.md) | Full command reference |
| [Node Reference](./docs/reference/nodes.md) | Built-in node schemas |
| [Session Steps](./docs/reference/session-steps.md) | Session step types |
| [Config Reference](./docs/reference/config.md) | Configuration options |
| [Custom Nodes Guide](./docs/guides/custom-nodes.md) | Writing custom nodes |
| [Design Patterns](./docs/guides/design-patterns.md) | Common flow patterns |
| [Troubleshooting](./docs/guides/troubleshooting.md) | Common issues and fixes |
| [Extension API](./docs/extension-api.md) | Programmatic API |
| [Extension Guide](./docs/extension-guide.md) | Building extensions |

## Project Status

**Current version**: v0.1.0 (early development)

KAL is in early stage. The core runtime works, but APIs and config formats may change.

**Implemented:**
- Core Flow runtime (DAG execution, conditional branching, SubFlow)
- Session layer (multi-turn dialogue, state persistence)
- 17 built-in nodes (Signal, State, LLM, Transform, Utility)
- CLI toolchain (12 commands, 71+ subcommands, structured JSON output)
- Studio workbench (flow editor, session editor, state inspector, debug UI, packages)
- HTTP API (55+ endpoints, SSE streaming, capability-based access control)
- 3 example games (dnd-adventure, showcase-signal-watch, castaway)

**In progress:**
- Documentation
- Test coverage
- Onboarding experience

## FAQ

<details>
<summary><strong>How is KAL different from other game engines?</strong></summary>

KAL focuses on AI-native game development:

- **Data-driven** — Game logic lives in JSON, not code. No recompilation needed.
- **AI-first** — Built-in LLM nodes with prompt engineering, history management, and caching
- **State-driven** — Optimized for multi-turn dialogue and typed state management
- **Lightweight** — Text games and interactive fiction, no graphics rendering

</details>

<details>
<summary><strong>Which LLM providers are supported?</strong></summary>

KAL supports any OpenAI-compatible API:

- **Cloud** — OpenAI, DeepSeek, Azure OpenAI, Anthropic Claude, Google Gemini (via adapters)
- **Local** — Ollama, LocalAI, vLLM
- **Custom** — Any service implementing the OpenAI chat completions format

</details>

<details>
<summary><strong>How does KAL handle LLM non-determinism?</strong></summary>

KAL uses multiple layers to keep game logic controllable:

- **Rule separation** — Critical game logic uses deterministic nodes (Branch, WriteState, ComputeState)
- **Output constraints** — LLM nodes support JSON output parsing and validation
- **Fallbacks** — Default handling when AI generation fails
- **State checks** — Typed state with min/max constraints ensures consistency

</details>

<details>
<summary><strong>Can I use KAL for commercial projects?</strong></summary>

Yes. KAL is Apache 2.0 licensed — free for commercial use, modification, and distribution. You must include the license notice and state any changes made.

</details>

## Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes
4. Push and open a Pull Request

Please follow existing code style, add tests for new features, and make sure all tests pass.

## License

[Apache 2.0 License](LICENSE)

---

<div align="center">

**[Star](https://github.com/Feed-Scription/kal) · [Docs](./docs/) · [Issues](https://github.com/Feed-Scription/kal/issues) · [Discussions](https://github.com/Feed-Scription/kal/discussions)**

Made with care for AI-native game developers

</div>
