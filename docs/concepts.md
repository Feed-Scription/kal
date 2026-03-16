# Core Concepts

KAL is a data-driven game engine where game logic is defined in JSON, not code. Four core objects work together to make this happen.

## The Four Objects

```
┌─────────────────────────────────────────────────┐
│                   Session                        │
│  (state machine — controls the player journey)   │
│                                                  │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐  │
│   │  Prompt   │───▶│ RunFlow  │───▶│  Branch  │  │
│   │  Step     │    │  Step    │    │  Step    │  │
│   └──────────┘    └────┬─────┘    └──────────┘  │
│                        │                         │
│                        ▼                         │
│              ┌─────────────────┐                 │
│              │      Flow       │                 │
│              │  (DAG of nodes) │                 │
│              │                 │                 │
│              │  ┌────┐ ┌────┐ │                 │
│              │  │Node│→│Node│ │                 │
│              │  └────┘ └────┘ │                 │
│              └────────┬────────┘                 │
│                       │                          │
│                       ▼                          │
│              ┌─────────────────┐                 │
│              │     State       │                 │
│              │  (game data)    │                 │
│              └─────────────────┘                 │
└─────────────────────────────────────────────────┘
```

## Node

A node is the smallest unit of logic. Each node has typed inputs, typed outputs, and optional config. KAL ships with 17 built-in nodes across 5 categories:

| Category | Nodes | Purpose |
|----------|-------|---------|
| Signal | SignalIn, SignalOut, Timer | I/O channels between flows and the outside world |
| State | ReadState, WriteState, ComputeState | Read and write game state |
| LLM | PromptBuild, Message, GenerateText, GenerateImage, UpdateHistory, CompactHistory | Build prompts, call LLMs, manage conversation history |
| Transform | Regex, JSONParse, PostProcess, SubFlow | Parse, transform, and delegate |
| Utility | Constant | Output fixed values |

You can also write custom nodes in TypeScript and place them in the `node/` directory.

See [Built-in Nodes Reference](reference/nodes.md) for the full specification of each node.

## Flow

A flow is a directed acyclic graph (DAG) of nodes connected by edges. Each edge wires one node's output to another node's input. When a flow executes, the engine resolves the graph topologically and runs nodes in dependency order.

Flows are defined in JSON files under the `flow/` directory:

```json
{
  "meta": {
    "schemaVersion": "1.0.0",
    "name": "narrate",
    "inputs": [{ "name": "playerInput", "type": "string" }],
    "outputs": [{ "name": "response", "type": "string" }]
  },
  "data": {
    "nodes": [ ... ],
    "edges": [
      {
        "source": "node-a",
        "sourceHandle": "text",
        "target": "node-b",
        "targetHandle": "input"
      }
    ]
  }
}
```

A typical LLM flow follows this pattern:

```
SignalIn → PromptBuild → Message → GenerateText → JSONParse → WriteState → SignalOut
```

Flows can call other flows via the `SubFlow` node, keeping each flow focused on a single responsibility.

## State

State is a flat key-value store that holds all game data. Each key maps to a typed value:

```json
{
  "health": { "type": "number", "value": 100 },
  "inventory": { "type": "array", "value": ["sword", "torch"] },
  "currentLocation": { "type": "string", "value": "town square" }
}
```

Supported types: `string`, `number`, `boolean`, `object`, `array`.

State is initialized from `initial_state.json` at the start of a session. Nodes read and write state during flow execution. The `WriteState` node is the primary way LLM output gets written back to state — it only modifies keys that already exist and supports type coercion, clamping constraints, and allowlists.

Key design rules:
- State is flat — no nesting inside values
- Pre-declare all keys the LLM might write to
- Always include `history` (array) and `summary` (string) for conversation management

## Session

A session is a state machine that orchestrates the player experience. It defines a sequence of steps that control what the player sees, what input they provide, which flows run, and how the game branches.

Six step types are available:

| Step | Purpose |
|------|---------|
| `RunFlow` | Execute a flow |
| `Prompt` | Ask the player for text input, optionally run a flow with it |
| `Choice` | Present multiple-choice options |
| `DynamicChoice` | Choice with conditionally visible options |
| `Branch` | Route to different steps based on state conditions |
| `End` | Terminate the session |

Steps are connected by `next` fields (or `conditions` for Branch). The engine walks through steps sequentially, executing flows and collecting input as needed.

```json
{
  "id": "turn",
  "type": "Prompt",
  "flowRef": "main",
  "inputChannel": "playerInput",
  "promptText": "What do you do?",
  "next": "check"
}
```

See [Session Steps Reference](reference/session-steps.md) for the full specification.

## How They Fit Together

1. The **session** starts at its entry step and walks through the state machine
2. When a step references a flow, the engine loads and executes that **flow**
3. Inside the flow, **nodes** process data — building prompts, calling LLMs, parsing responses
4. Nodes read and write **state**, which persists across steps and flows
5. The session uses state values in Branch conditions to decide what happens next

This separation means you can change game logic (flows), game data (state), and game structure (session) independently — all in JSON, without touching code.
