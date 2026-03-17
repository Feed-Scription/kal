# Design Patterns

Common game patterns and how to implement them with KAL's flow + session architecture.

## Turn-Based Loop

The most common pattern: player acts → game responds → check win/lose → repeat.

### Session Structure

```json
{
  "steps": [
    { "id": "intro", "type": "RunFlow", "flowRef": "intro", "next": "turn" },
    {
      "id": "turn",
      "type": "Prompt",
      "flowRef": "main",
      "inputChannel": "playerInput",
      "promptText": "Your action?",
      "next": "check"
    },
    {
      "id": "check",
      "type": "Branch",
      "conditions": [
        { "when": "state.health <= 0", "next": "game-over" },
        { "when": "state.questStage == 'completed'", "next": "victory" }
      ],
      "default": "turn"
    },
    { "id": "game-over", "type": "RunFlow", "flowRef": "outro-death", "next": "end" },
    { "id": "victory", "type": "RunFlow", "flowRef": "outro-win", "next": "end" },
    { "id": "end", "type": "End" }
  ]
}
```

Key points:
- `turn` → `check` → `turn` forms the core loop
- `Branch` step evaluates state conditions to break out of the loop
- Each iteration calls the `main` flow which handles LLM interaction and state updates

### Main Flow Pattern

```
SignalIn(playerInput) → PromptBuild(system context) → Message → GenerateText → JSONParse → WriteState → SignalOut
```

The `main` flow receives player input, builds a prompt with game context, calls the LLM, parses the structured response, and writes state changes back.

**See:** `examples/dnd-adventure/flow/main.json`

## Branching Narrative

Use `Choice` steps to let players pick between options, then `Branch` to route based on their selection.

### Session Structure

```json
{
  "steps": [
    {
      "id": "crossroads",
      "type": "Choice",
      "promptText": "You reach a fork in the road:",
      "options": [
        { "label": "Take the forest path", "value": "forest" },
        { "label": "Follow the river", "value": "river" },
        { "label": "Climb the mountain", "value": "mountain" }
      ],
      "stateKey": "pathChoice",
      "next": "route"
    },
    {
      "id": "route",
      "type": "Branch",
      "conditions": [
        { "when": "state.pathChoice == 'forest'", "next": "forest-scene" },
        { "when": "state.pathChoice == 'river'", "next": "river-scene" }
      ],
      "default": "mountain-scene"
    },
    { "id": "forest-scene", "type": "RunFlow", "flowRef": "forest", "next": "converge" },
    { "id": "river-scene", "type": "RunFlow", "flowRef": "river", "next": "converge" },
    { "id": "mountain-scene", "type": "RunFlow", "flowRef": "mountain", "next": "converge" },
    { "id": "converge", "type": "RunFlow", "flowRef": "next-chapter", "next": "..." }
  ]
}
```

Key points:
- `Choice` writes the selected value to `stateKey`
- `Branch` reads state to determine the next step
- Branches can converge back to a shared step

## Character Creation

A multi-step wizard that collects player choices and generates character attributes.

### Session Structure

```json
{
  "steps": [
    {
      "id": "choose-race",
      "type": "Choice",
      "promptText": "Choose your race:",
      "options": [
        { "label": "Human", "value": "human" },
        { "label": "Elf", "value": "elf" },
        { "label": "Dwarf", "value": "dwarf" }
      ],
      "stateKey": "race",
      "next": "choose-class"
    },
    {
      "id": "choose-class",
      "type": "Choice",
      "promptText": "Choose your class:",
      "options": [
        { "label": "Warrior", "value": "warrior" },
        { "label": "Mage", "value": "mage" },
        { "label": "Rogue", "value": "rogue" }
      ],
      "stateKey": "class",
      "next": "input-name"
    },
    {
      "id": "input-name",
      "type": "Prompt",
      "stateKey": "playerName",
      "promptText": "Name your character:",
      "next": "generate"
    },
    {
      "id": "generate",
      "type": "RunFlow",
      "flowRef": "character-creation",
      "next": "adventure-start"
    }
  ]
}
```

### Character Creation Flow

```
ReadState(race) → CharacterGen(custom node) → WriteState(strength, dexterity, ...)
ReadState(class) ↗
```

Use a custom node (like `CharacterGen` in dnd-adventure) to compute derived stats from player choices, then write them to state.

**See:** `examples/dnd-adventure/node/CharacterGen.ts`, `examples/dnd-adventure/flow/character-creation.json`

## Inventory System

Track items using an array state key. Use `WriteState` with `path` to update specific fields from LLM responses.

### State Definition

```json
{
  "inventory": { "type": "array", "value": ["torch", "bread x2"] },
  "gold": { "type": "number", "value": 50 }
}
```

### Flow Pattern for Item Changes

In the main game flow, the LLM returns structured JSON including inventory changes:

```json
{
  "narrative": "You buy a sword from the blacksmith.",
  "stateChanges": {
    "inventory": ["torch", "bread x2", "iron sword"],
    "gold": 35
  }
}
```

The `WriteState` node with `allowedKeys` config ensures only permitted state keys are modified:

```json
{
  "id": "apply-state",
  "type": "WriteState",
  "config": {
    "path": "stateChanges",
    "allowedKeys": ["health", "gold", "inventory", "currentLocation", "questStage"]
  }
}
```

## Conversation History Management

For games with ongoing dialogue, use `historyKey` to maintain conversation context across turns.

### Flow Setup

```
SignalIn → PromptBuild(system prompt) → Message(historyKey: "history") → GenerateText(historyKey: "history") → ...
```

Key config:
- `Message` node: `"historyKey": "history"` — appends past messages to the prompt
- `GenerateText` node: `"historyKey": "history"` — saves the new exchange to history
- `GenerateText` node: `"assistantPath": "narrative"` — extracts a specific field from JSON response for history storage

### History Compaction

When history grows too long, use a compaction flow to summarize it:

```json
{
  "id": "compact-check",
  "type": "Branch",
  "conditions": [
    { "when": "state.history.length >= 10", "next": "do-compact" }
  ],
  "default": "turn"
},
{
  "id": "do-compact",
  "type": "RunFlow",
  "flowRef": "compact-history",
  "next": "turn"
}
```

The `compact-history` flow uses `CompactHistory` node to summarize old messages and `summaryKey` on `Message` to prepend the summary.

**See:** `examples/dnd-adventure/flow/compact-history.json`

## SubFlow Composition

Break complex flows into reusable sub-flows using the `SubFlow` node.

### Main Flow

```json
{
  "id": "narrate",
  "type": "SubFlow",
  "config": { "ref": "narrate" },
  "inputs": [{ "name": "playerInput", "type": "string", "required": true }],
  "outputs": [{ "name": "response", "type": "string" }]
}
```

### Benefits

- **Reusability:** The same sub-flow can be called from multiple parent flows
- **Separation of concerns:** Prompt engineering lives in the sub-flow, orchestration in the parent
- **Testability:** Sub-flows can be tested independently with `kal debug`

**See:** `examples/dnd-adventure/flow/main.json` (calls `narrate` sub-flow)

## Preset / Template Pattern

Offer pre-built options alongside custom creation using a `Choice` + `Branch` pattern.

```json
{
  "id": "choose-mode",
  "type": "Choice",
  "promptText": "Choose your character:",
  "options": [
    { "label": "Arthur — Human Warrior", "value": "knight" },
    { "label": "Sylvie — Elf Rogue", "value": "shadow" },
    { "label": "Custom — Create your own", "value": "custom" }
  ],
  "flowRef": "apply-preset",
  "inputChannel": "choice",
  "next": "check-mode"
},
{
  "id": "check-mode",
  "type": "Branch",
  "conditions": [
    { "when": "state.createMode == 'custom'", "next": "custom-creation" }
  ],
  "default": "start-game"
}
```

The `apply-preset` flow uses a custom `PresetCharacter` node that maps preset IDs to pre-configured character data.

**See:** `examples/dnd-adventure/node/PresetCharacter.ts`
