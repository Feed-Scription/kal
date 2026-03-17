# Design Patterns

Common game patterns and how to implement them in KAL.

## Turn-Based Loop

The most common pattern: player acts → engine responds → check win/lose → repeat.

**Session structure:**

```json
{
  "steps": [
    { "id": "setup", "type": "RunFlow", "flowRef": "intro", "next": "turn" },
    {
      "id": "turn", "type": "Prompt",
      "flowRef": "main", "inputChannel": "playerInput",
      "promptText": "Your action?", "next": "check"
    },
    {
      "id": "check", "type": "Branch",
      "conditions": [
        { "when": "state.health <= 0", "next": "game-over" },
        { "when": "state.questComplete == true", "next": "victory" }
      ],
      "default": "turn"
    },
    { "id": "game-over", "type": "RunFlow", "flowRef": "outro-death", "next": "end" },
    { "id": "victory", "type": "RunFlow", "flowRef": "outro-win", "next": "end" },
    { "id": "end", "type": "End" }
  ]
}
```

**Key nodes in the `main` flow:**

- `SignalIn` receives player input
- `PromptBuild` assembles the system prompt with game rules and current state
- `Message` combines system/context/user into ChatMessage array
- `GenerateText` calls the LLM
- `WriteState` persists state changes from the LLM response

**Example:** `examples/dnd-adventure` uses this exact pattern.

## Branching Narrative

Use `Branch` steps to route players through different story paths based on state.

```json
{
  "id": "crossroads", "type": "Branch",
  "conditions": [
    { "when": "state.hasKey == true", "next": "unlock-door" },
    { "when": "state.strength >= 15", "next": "break-door" }
  ],
  "default": "find-another-way"
}
```

For player-driven choices, use `Choice` steps:

```json
{
  "id": "choose-path", "type": "Choice",
  "promptText": "Which way?",
  "options": [
    { "label": "Enter the cave", "value": "cave" },
    { "label": "Follow the river", "value": "river" }
  ],
  "stateKey": "chosenPath",
  "next": "route-choice"
}
```

## Character Creation

Combine `Choice`, `Prompt`, and `RunFlow` steps for multi-stage character creation.

```json
[
  { "id": "pick-race", "type": "Choice", "promptText": "Race:", "stateKey": "race",
    "options": [
      { "label": "Human", "value": "human" },
      { "label": "Elf", "value": "elf" }
    ], "next": "pick-class" },
  { "id": "pick-class", "type": "Choice", "promptText": "Class:", "stateKey": "class",
    "options": [
      { "label": "Warrior", "value": "warrior" },
      { "label": "Mage", "value": "mage" }
    ], "next": "enter-name" },
  { "id": "enter-name", "type": "Prompt", "stateKey": "playerName",
    "promptText": "Name your character:", "next": "generate-stats" },
  { "id": "generate-stats", "type": "RunFlow", "flowRef": "character-creation", "next": "start" }
]
```

The `character-creation` flow can use `ComputeState` or `WriteState` to derive stats from race/class.

**Example:** `examples/dnd-adventure` implements preset + custom character creation with LLM-enriched backgrounds.

## Conversation History Management

For multi-turn LLM conversations, use the history/compact pattern:

1. `GenerateText` with `historyKey: "history"` automatically appends user/assistant messages to state
2. `Message` with `historyKey: "history"` injects past messages between system and user
3. When history grows too long, run a `compact-history` flow using `CompactHistory` node

**Session pattern for auto-compaction:**

```json
{ "id": "check-history", "type": "Branch",
  "conditions": [{ "when": "state.history.length >= 10", "next": "compact" }],
  "default": "turn" },
{ "id": "compact", "type": "RunFlow", "flowRef": "compact-history", "next": "turn" }
```

## Item / Inventory System

Use array-typed state keys with `WriteState` (mode: `append`) and `ComputeState`:

**initial_state.json:**
```json
{
  "inventory": { "type": "array", "value": ["torch", "bread"] },
  "gold": { "type": "number", "value": 50 }
}
```

The LLM can output state changes as JSON, which `JSONParse` + `WriteState` applies:

```json
{ "stateChanges": { "inventory": ["torch", "bread", "silver-dagger"], "gold": 35 } }
```

## SubFlow Delegation

Extract reusable logic into separate flows and call them via `SubFlow` nodes:

```
main.json:  SignalIn → SubFlow(narrate) → JSONParse → WriteState → SignalOut
narrate.json:  SignalIn → PromptBuild → Message → GenerateText → SignalOut
```

This keeps flows focused and testable. Use `kal eval` to test individual flows in isolation.
