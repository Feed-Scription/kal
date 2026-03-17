# Project Structure

A KAL project is a directory containing JSON configuration files that define your game. No code is required for a basic project — all logic is expressed declaratively.

## Directory Layout

```text
my-game/
├── kal_config.json        # Engine + LLM configuration (required)
├── initial_state.json     # Game state initialization (required)
├── session.json           # Interaction state machine (required for kal play)
├── flow/                  # Flow definitions (required)
│   ├── main.json
│   ├── intro.json
│   └── ...
└── node/                  # Custom node implementations (optional)
    └── dice-roll.ts
```

## Files

### `kal_config.json`

Engine and LLM provider configuration. This is the only file that touches infrastructure concerns.

```json
{
  "name": "my-game",
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
    "retry": { "maxRetries": 2, "initialDelayMs": 1000, "maxDelayMs": 10000, "backoffMultiplier": 2, "jitter": true },
    "cache": { "enabled": false }
  }
}
```

String values support `${ENV_VAR}` substitution — the engine replaces them with environment variables at load time.

See [Configuration Reference](reference/config.md) for all fields and defaults.

### `initial_state.json`

Flat key-value map that defines all game state at the start of a session. Each key is a `{ type, value }` pair.

```json
{
  "playerName": { "type": "string", "value": "" },
  "health":     { "type": "number", "value": 100 },
  "inventory":  { "type": "array",  "value": ["sword"] },
  "history":    { "type": "array",  "value": [] },
  "summary":    { "type": "string", "value": "" }
}
```

Guidelines:
- Pre-declare every key the LLM might write to — `WriteState` only modifies existing keys
- Always include `history` (array) and `summary` (string) for conversation management
- Keep it flat — no nesting inside `value`
- Supported types: `string`, `number`, `boolean`, `object`, `array`

### `session.json`

State machine that defines the player journey. Each step has an `id`, a `type`, and a `next` pointer (or conditions for branching).

```json
{
  "schemaVersion": "1.0.0",
  "name": "My Game",
  "steps": [
    { "id": "intro",  "type": "RunFlow", "flowRef": "intro", "next": "turn" },
    { "id": "turn",   "type": "Prompt",  "flowRef": "main", "inputChannel": "playerInput", "promptText": "What do you do?", "next": "check" },
    { "id": "check",  "type": "Branch",  "conditions": [{ "when": "state.health <= 0", "next": "end" }], "default": "turn" },
    { "id": "end",    "type": "End" }
  ]
}
```

See [Session Steps Reference](reference/session-steps.md) for all step types.

### `flow/*.json`

Each file defines a single flow — a DAG of nodes connected by edges. Flows are referenced by name (filename without `.json`) from session steps and SubFlow nodes.

A minimal flow:

```json
{
  "meta": {
    "schemaVersion": "1.0.0",
    "name": "intro",
    "inputs": [],
    "outputs": [{ "name": "result", "type": "string" }]
  },
  "data": {
    "nodes": [
      {
        "id": "prompt-build",
        "type": "PromptBuild",
        "inputs": [{ "name": "data", "type": "object", "defaultValue": {} }],
        "outputs": [{ "name": "messages", "type": "ChatMessage[]" }, { "name": "text", "type": "string" }, { "name": "estimatedTokens", "type": "number" }],
        "config": {
          "fragments": [{ "type": "base", "id": "intro", "content": "Welcome to the game!", "role": "system" }]
        }
      },
      {
        "id": "out",
        "type": "SignalOut",
        "inputs": [{ "name": "data", "type": "string" }],
        "outputs": [{ "name": "data", "type": "string" }],
        "config": { "channel": "result" }
      }
    ],
    "edges": [
      { "source": "prompt-build", "sourceHandle": "text", "target": "out", "targetHandle": "data" }
    ]
  }
}
```

See [Built-in Nodes Reference](reference/nodes.md) for all available node types.

### `node/*.ts` (optional)

Custom nodes written in TypeScript. Each file exports a `CustomNode` object:

```typescript
import type { CustomNode } from '@kal-ai/core';

export const DiceRoll: CustomNode = {
  type: 'DiceRoll',
  label: 'Roll Dice',
  category: 'utility',
  inputs: [{ name: 'sides', type: 'number', required: true }],
  outputs: [{ name: 'result', type: 'number' }],
  async execute(inputs) {
    return { result: Math.floor(Math.random() * inputs.sides) + 1 };
  },
};
```

The engine auto-discovers and loads custom nodes from this directory.

## See Also

- [Core Concepts](concepts.md) — Node, Flow, State, Session
- [Custom Nodes Guide](guides/custom-nodes.md) — create your own nodes
- [Configuration Reference](reference/config.md) — all config fields
