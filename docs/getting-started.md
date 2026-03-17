# Getting Started

This guide walks you through building a minimal Q&A game from scratch, then points you to the `dnd-adventure` example for a more complete project.

## Prerequisites

Make sure you've completed the setup from the root README:

```bash
# Clone and install
git clone <repo-url> && cd kal
pnpm install

# Build the engine
pnpm build

# Set your LLM provider credentials
export OPENAI_API_KEY=your_key
export OPENAI_BASE_URL=https://your-openai-compatible-endpoint  # optional
```

## Part 1: Build a Minimal Q&A Game

We'll create a game where the player asks questions and an LLM answers — the simplest possible KAL project.

### 1. Create the project directory

```bash
mkdir -p my-game/flow
```

### 2. `my-game/kal_config.json`

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

### 3. `my-game/initial_state.json`

We need `history` and `summary` for conversation management, plus any game-specific state:

```json
{
  "history": { "type": "array", "value": [] },
  "summary": { "type": "string", "value": "" }
}
```

### 4. `my-game/flow/answer.json`

This flow takes the player's question, builds a prompt, calls the LLM, and outputs the response:

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
      {
        "id": "in",
        "type": "SignalIn",
        "inputs": [],
        "outputs": [{ "name": "data", "type": "string" }],
        "config": { "channel": "question" }
      },
      {
        "id": "prompt",
        "type": "PromptBuild",
        "inputs": [{ "name": "data", "type": "object", "defaultValue": {} }],
        "outputs": [
          { "name": "messages", "type": "ChatMessage[]" },
          { "name": "text", "type": "string" },
          { "name": "estimatedTokens", "type": "number" }
        ],
        "config": {
          "defaultRole": "system",
          "fragments": [
            {
              "type": "base",
              "id": "role",
              "content": "You are a helpful assistant. Answer the user's question concisely.",
              "role": "system"
            }
          ]
        }
      },
      {
        "id": "msg",
        "type": "Message",
        "inputs": [
          { "name": "system", "type": "ChatMessage[]" },
          { "name": "user", "type": "string" }
        ],
        "outputs": [{ "name": "messages", "type": "ChatMessage[]" }],
        "config": { "historyKey": "history", "summaryKey": "summary" }
      },
      {
        "id": "gen",
        "type": "GenerateText",
        "inputs": [{ "name": "messages", "type": "ChatMessage[]", "required": true }],
        "outputs": [
          { "name": "text", "type": "string" },
          { "name": "usage", "type": "object" }
        ],
        "config": { "historyKey": "history" }
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
      { "source": "in", "sourceHandle": "data", "target": "msg", "targetHandle": "user" },
      { "source": "prompt", "sourceHandle": "messages", "target": "msg", "targetHandle": "system" },
      { "source": "msg", "sourceHandle": "messages", "target": "gen", "targetHandle": "messages" },
      { "source": "gen", "sourceHandle": "text", "target": "out", "targetHandle": "data" }
    ]
  }
}
```

The data flow: `SignalIn` receives the player's question → `PromptBuild` creates the system prompt → `Message` assembles the full message array (system + history + user) → `GenerateText` calls the LLM and auto-appends to history → `SignalOut` outputs the response.

### 5. `my-game/session.json`

A simple loop: ask a question, run the flow, repeat.

```json
{
  "schemaVersion": "1.0.0",
  "name": "Q&A",
  "steps": [
    {
      "id": "ask",
      "type": "Prompt",
      "flowRef": "answer",
      "inputChannel": "question",
      "promptText": "Ask me anything:",
      "next": "ask"
    }
  ]
}
```

The `next: "ask"` creates an infinite loop — the player keeps asking questions until they quit.

### 6. Run it

```bash
# Validate the project first
kal lint my-game

# Play interactively
kal play my-game
```

In the TUI, type your questions and see LLM responses. Type `/quit` to exit.

You can also use debug mode for step-by-step execution:

```bash
kal debug my-game --start
kal debug my-game --continue "What is the capital of France?"
kal debug my-game --state
```

## Part 2: Explore the DND Adventure Example

The `examples/dnd-adventure/` project demonstrates a full-featured game with:

- Character creation (preset selection or custom input)
- LLM-driven narration with state tracking (health, gold, inventory, location)
- Branching session flow (win/death conditions)
- History compaction for long sessions
- Custom nodes for character generation

```bash
# Run the example
kal play examples/dnd-adventure
```

Key patterns to study:

| Pattern | Where to look |
|---------|---------------|
| Preset character selection via Choice step | `session.json` → `choose-mode` step |
| LLM narration with JSON output + state update | `flow/narrate.json` → `flow/main.json` |
| SubFlow composition | `flow/main.json` calls `flow/narrate.json` via SubFlow |
| History compaction | `session.json` → `compact-check` branch + `flow/compact-history.json` |
| Custom nodes | `node/CharacterGen.ts`, `node/PresetCharacter.ts` |
| State-driven branching | `session.json` → `check` step (health ≤ 0 → death, questStage == completed → victory) |

## Next Steps

- [Core Concepts](concepts.md) — understand Node, Flow, State, Session
- [Project Structure](project-structure.md) — file-by-file reference
- [Built-in Nodes Reference](reference/nodes.md) — all 17 built-in nodes
- [CLI Reference](reference/cli.md) — all commands and options
