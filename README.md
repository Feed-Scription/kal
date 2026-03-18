<div align="center">

<img src="assets/kal-logo.png" alt="KAL Logo" width="400">

# KAL — Kal AI Layer

**A flow engine for AI-native games and interactive applications**

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

*Make AI-driven game development simple and controllable*

[Quick Start](#quick-start) · [Examples](#examples) · [Docs](#documentation) · [Roadmap](#roadmap)

**[中文文档](./README.zh-CN.md)**

</div>

---

## What is KAL?

KAL (Kal AI Layer) is a flow engine designed for AI-native games. It uses a three-layer architecture to make complex AI interactions simple and controllable:

- **Node layer** — Composable nodes for state I/O, LLM calls, sub-flow reuse, and business rules
- **Flow layer** — Describe DAG workflows in JSON for orchestration
- **Session layer** — A lightweight state machine that drives multi-turn interaction

Batteries included: runtime, engine host, Studio workbench, and example games.

## Use Cases

| Type | Description | Examples |
|------|-------------|----------|
| **Turn-based text games** | Rule-based game logic + AI narrative | DND adventures, text RPGs |
| **AI interactive fiction** | Dynamic story generation with branching | Interactive novels, story games |
| **State-driven prototypes** | Apps with complex state management | Character sims, management games |
| **Hybrid orchestration** | Deep integration of rules and LLMs | Smart assistants, educational games |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      KAL Architecture                       │
├─────────────────────────────────────────────────────────────┤
│  apps/                                                      │
│  ├── engine/     CLI + HTTP API + TUI host                  │
│  └── studio/     Studio workbench                           │
├─────────────────────────────────────────────────────────────┤
│  packages/                                                  │
│  └── core/       Flow runtime + Session mgmt + Node system  │
├─────────────────────────────────────────────────────────────┤
│  examples/                                                  │
│  └── dnd-adventure/  Complete DND adventure game            │
└─────────────────────────────────────────────────────────────┘
```

## Core Features

### Flow JSON Runtime
- **Declarative** — `meta + data` structure with input/output contracts
- **Visual orchestration** — DAG workflows with conditional branching
- **SubFlow reuse** — Break complex logic into reusable sub-flows

### Built-in Node System
- **State nodes** — State read/write and data transformation
- **LLM nodes** — AI model invocation and prompt engineering
- **Signal nodes** — User interaction and event handling
- **Transform nodes** — Data processing and format conversion

### Session Layer
- **Multi-turn dialogue** — `RunFlow / Prompt / Choice / Branch / End`
- **State management** — Auto-save and restore game progress
- **Multiple interfaces** — CLI, TUI, HTTP API

### Developer Friendly
- **Custom nodes** — Extend with business logic in `node/` directory
- **Node manifest** — Engine exports node catalog for the Studio workbench
- **Hot reload** — Live preview during development

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

# 3. Configure
kal config init
# Prompts for API key — supports any OpenAI-compatible provider

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
kal config set openai.apiKey sk-xxx...
kal config set deepseek.apiKey sk-xxx...

# Set API endpoints
kal config set openai.baseUrl https://api.deepseek.com/v1

# View / remove config
kal config get openai.apiKey
kal config remove openai.apiKey
```

### Launch Studio

```bash
# Option A: Studio mode (engine + studio in one command)
kal studio examples/dnd-adventure

# Option B: Separate processes
kal serve examples/dnd-adventure
cd apps/studio && pnpm dev
```

## Examples

### DND Adventure
A complete single-player DND-style adventure game showcasing KAL's core capabilities:

```bash
kal play examples/dnd-adventure
```

- Dynamic character creation and stat allocation
- AI-driven narrative and NPC dialogue
- Turn-based combat system
- Inventory management
- Multiple story endings

See [examples/dnd-adventure](./examples/dnd-adventure) for the full source.

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

### HTTP API

```bash
kal serve examples/dnd-adventure

# Endpoints
GET    /api/project              # Project snapshot for Studio / tools
GET    /api/flows               # List flows
GET    /api/session             # Load session definition
GET    /api/state               # Current state snapshot
GET    /api/diagnostics         # Lint / diagnostics summary
POST   /api/executions          # Execute one flow
POST   /api/runs                # Create managed run
POST   /api/runs/:id/advance    # Advance managed run
GET    /api/runs/:id/state      # Inspect managed run state
GET    /api/runs/:id/stream     # Subscribe to managed run events (SSE)
```

## Documentation

| Document | Description |
|----------|-------------|
| [Getting Started](./docs/getting-started.md) | Quick start guide |
| [Core Concepts](./docs/concepts.md) | Node, Flow, State, Session |
| [Project Structure](./docs/project-structure.md) | File-by-file breakdown |
| [Reference](./docs/reference/) | API reference docs |
| [TODO](./docs/internal/todo.md) | Project TODO list |

## Project Status

**Current version**: v0.1.0 (early development)

KAL is in early stage. The core runtime works, but APIs and config formats may change.

**Implemented:**
- Core Flow runtime (DAG execution, conditional branching, SubFlow)
- Session layer (multi-turn dialogue, state persistence)
- 17 built-in nodes (State, LLM, Signal, Transform, Utility)
- CLI tools (play, serve, debug, lint, smoke, eval, studio)
- Studio workbench (flow/session/state/config/debug/review/packages)
- 2 example games (dnd-adventure, showcase-signal-watch)

**In progress:**
- Documentation
- Test coverage
- Onboarding experience

## TODO

See [docs/internal/todo.md](./docs/internal/todo.md) for the full TODO list.

## FAQ

<details>
<summary><strong>How is KAL different from other game engines?</strong></summary>

KAL focuses on AI-native game development:

- **AI-first design** — Built-in LLM invocation and prompt engineering
- **Declarative flows** — Game logic in JSON, not code
- **State-driven** — Optimized for multi-turn dialogue and state management
- **Lightweight** — Text games and interactive fiction, no graphics rendering

</details>

<details>
<summary><strong>Which LLM providers are supported?</strong></summary>

KAL supports any OpenAI-compatible API:

- **Official** — OpenAI GPT-3.5/4, Azure OpenAI
- **Local models** — Via Ollama, LocalAI, vLLM
- **Cloud** — Anthropic Claude, Google Gemini (via adapters)
- **Custom** — Any service implementing the OpenAI API format

</details>

<details>
<summary><strong>How does KAL handle LLM non-determinism?</strong></summary>

KAL uses multiple layers to keep game logic controllable:

- **Rule separation** — Critical game logic uses deterministic nodes
- **Output constraints** — LLM nodes support formatted output and validation
- **Fallbacks** — Default handling when AI generation fails
- **State checks** — Ensure game state consistency

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
