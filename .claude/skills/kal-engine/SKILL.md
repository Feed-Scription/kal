---
name: kal-engine
description: KAL-AI Flow Engine technical reference and CLI guide. Covers architecture (Node → Flow → Session), all 17 built-in nodes, 6 session step types, 12 CLI commands (71+ subcommands), HTTP API, and common design patterns. Use when the user asks about KAL engine internals, CLI usage, node schemas, flow/session JSON format, debugging, linting, smoke testing, or any KAL technical question. Triggers on "kal", "flow engine", "session.json", "flow json", "kal play", "kal studio", "kal debug", "kal lint", "kal smoke", "kal serve", "kal schema", "kal eval", "kal config", "kal init", "initial_state.json", "kal_config.json", "SignalIn", "WriteState", "GenerateText", "PromptBuild". Does NOT cover game design methodology — use the project-level `build-game` skill for game design (MDA framework, Design Depth Tier, soul design).
---

# KAL-AI Flow Engine — Technical Reference

KAL is a data-driven engine for AI-native games and interactive applications. Game logic lives in JSON (not code) across three layers: **Node → Flow → Session**.

## Architecture

```
Session (state machine — player journey)
  ↓ executes
Flow (DAG of nodes — game logic)
  ↓ reads/writes
State (flat key-value store — game data)
```

**Project structure:**
```
my-game/
├── kal_config.json        # Engine + LLM config
├── initial_state.json     # State declarations (all keys pre-declared)
├── session.json           # Session state machine
├── flow/                  # Flow DAG definitions
│   └── *.json
└── node/                  # Custom nodes (optional)
    └── *.ts
```

## Implementation Order

When building a KAL project, follow this order — each step depends on the previous:

1. **State** → `initial_state.json` — Declare all keys
2. **Flows** → `flow/*.json` — Build DAGs for each game action
3. **Session** → `session.json` — Wire steps into a state machine
4. **Config** → `kal_config.json` — Set LLM provider
5. **Validate** → `kal lint <project>` — Check for errors
6. **Test** → `kal smoke <project> --dry-run` then `kal play <project>`

## Debug Workflow

```bash
kal debug start
kal debug step --input "player action"
kal debug state                          # inspect state snapshot
kal debug diff --diff-run <other-id>     # compare states
```

## Key Patterns

For detailed node schemas, session step types, CLI commands, and design patterns, read the reference files:

- **[references/nodes.md](references/nodes.md)** — All 17 built-in nodes with inputs/outputs/config schemas
- **[references/session-steps.md](references/session-steps.md)** — 6 session step types with field specs
- **[references/cli.md](references/cli.md)** — Full CLI command reference (12 commands, 71+ subcommands)
- **[references/patterns.md](references/patterns.md)** — Common flow patterns and design recipes

### LLM Flow Pattern (most common)

```
SignalIn → PromptBuild → Message → GenerateText → JSONParse → WriteState → SignalOut
```

- `SignalIn` receives player input via `config.channel`
- `PromptBuild` assembles system prompt from `config.fragments`
- `Message` combines system + history + user message (`historyKey`, `summaryKey`)
- `GenerateText` calls LLM, auto-appends to history (`historyKey`)
- `JSONParse` extracts structured data (`extractFromCodeBlock: true`, `fixCommonErrors: true`)
- `WriteState` applies changes (`path`, `allowedKeys`, `constraints`, `operations`)
- `SignalOut` outputs result via `config.channel`

### Turn-Based Loop Pattern

```
Session: intro(RunFlow) → turn(Prompt) → check(Branch) → turn | end(End)
```

### State Design Rules

- Flat structure — no nesting inside values
- Pre-declare ALL keys the LLM might write to
- Always include `history` (array) and `summary` (string) for conversation management
- Supported types: `string`, `number`, `boolean`, `object`, `array`
- Use `min`/`max` constraints for numeric values

### Custom Nodes

```typescript
import type { CustomNode } from '@kal-ai/core';

export default {
  type: 'MyNode',
  label: 'My Node',
  category: 'utility',
  inputs: [{ name: 'input', type: 'string', required: true }],
  outputs: [{ name: 'result', type: 'string' }],
  async execute(inputs, config, context) {
    // context.state.get(key), context.llm.invoke(messages)
    return { result: 'value' };
  },
} satisfies CustomNode;
```

## Minimal Working Example

A Q&A game — the simplest possible KAL project:

**initial_state.json:**
```json
{
  "history": { "type": "array", "value": [] },
  "summary": { "type": "string", "value": "" }
}
```

**session.json:**
```json
{
  "schemaVersion": "1.0.0",
  "name": "Q&A",
  "steps": [
    { "id": "ask", "type": "Prompt", "flowRef": "answer", "inputChannel": "question", "promptText": "Ask me anything:", "next": "ask" }
  ]
}
```

**flow/answer.json** — 5-node DAG:
```json
{
  "meta": {
    "schemaVersion": "1.0.0",
    "name": "answer",
    "inputs": [{ "name": "question", "type": "string", "required": true }],
    "outputs": [{ "name": "result", "type": "string" }]
  },
  "data": {
    "nodes": [
      { "id": "in", "type": "SignalIn", "inputs": [], "outputs": [{ "name": "data", "type": "string" }], "config": { "channel": "question" } },
      { "id": "prompt", "type": "PromptBuild", "inputs": [{ "name": "data", "type": "object", "defaultValue": {} }], "outputs": [{ "name": "messages", "type": "ChatMessage[]" }, { "name": "text", "type": "string" }, { "name": "estimatedTokens", "type": "number" }], "config": { "defaultRole": "system", "fragments": [{ "type": "base", "id": "role", "content": "You are a helpful assistant.", "role": "system" }] } },
      { "id": "msg", "type": "Message", "inputs": [{ "name": "system", "type": "ChatMessage[]" }, { "name": "user", "type": "string" }], "outputs": [{ "name": "messages", "type": "ChatMessage[]" }], "config": { "historyKey": "history", "summaryKey": "summary" } },
      { "id": "gen", "type": "GenerateText", "inputs": [{ "name": "messages", "type": "ChatMessage[]", "required": true }], "outputs": [{ "name": "text", "type": "string" }, { "name": "usage", "type": "object" }], "config": { "historyKey": "history" } },
      { "id": "out", "type": "SignalOut", "inputs": [{ "name": "data", "type": "string" }], "outputs": [{ "name": "data", "type": "string" }], "config": { "channel": "result" } }
    ],
    "edges": [
      { "source": "in", "sourceHandle": "data", "target": "msg", "targetHandle": "user" },
      { "source": "prompt", "sourceHandle": "messages", "target": "msg", "targetHandle": "system" },
      { "source": "msg", "sourceHandle": "messages", "target": "gen", "targetHandle": "messages" },
      { "source": "gen", "sourceHandle": "text", "target": "out", "targetHandle": "data" }
    ]
  }
}
```

## CLI Quick Reference

```bash
kal init <name> --template game|minimal   # Scaffold project
kal config set-key openai sk-xxx          # Set API key
kal lint <project> --format json          # Validate (JSON output for agents)
kal smoke <project> --dry-run --steps 10  # Dry-run test
kal play <project> --lang zh-CN           # Interactive TUI
kal debug start / step / state / diff     # Step-by-step debug
kal studio <project>                      # Visual editor + API
kal serve <project>                       # HTTP API only
kal schema nodes                          # List all node types
kal eval run <flow> --node <id> --runs 5  # Prompt A/B testing
kal flow list / show / create / execute   # Manage flow definitions
kal flow node list / add / patch / remove # Manage nodes within flows
kal flow edge list / add / remove         # Manage edges within flows
kal session show / set / validate         # Manage session.json
kal session step list / add / patch       # Manage session steps
```

For the complete CLI reference with all subcommands and options, see [references/cli.md](references/cli.md).
