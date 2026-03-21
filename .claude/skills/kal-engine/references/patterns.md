# Design Patterns

Common patterns for building KAL games. Each pattern includes the flow structure and key config.

## 1. Basic LLM Narration

The most common pattern — take player input, generate AI narrative, update state.

**Flow DAG:**
```
SignalIn → PromptBuild → Message → GenerateText → JSONParse → WriteState → SignalOut
```

**Key configs:**
- `PromptBuild.fragments`: system prompt with game rules, world description, output format instructions
- `Message.historyKey`: `"history"` — includes conversation context
- `Message.summaryKey`: `"summary"` — includes compacted summary
- `GenerateText.responseFormat`: `"json"` — force structured output
- `GenerateText.assistantPath`: `"narrative"` — only store narrative text in history (not full JSON)
- `JSONParse.fixCommonErrors`: `true` — handle LLM JSON quirks
- `WriteState.path`: `"stateChanges"` — extract nested object from LLM response
- `WriteState.allowedKeys`: whitelist of modifiable state keys
- `WriteState.constraints`: `{ "health": { "min": 0, "max": 100 } }`

**LLM output format to request in prompt:**
```json
{
  "narrative": "The goblin lunges at you...",
  "stateChanges": {
    "health": 85,
    "location": "dark_cave"
  }
}
```

## 2. Character Creation with Presets

Use Choice step + dedicated flow for preset selection.

**Session steps:**
```json
[
  { "id": "choose-mode", "type": "Choice", "promptText": "Choose creation mode:",
    "options": [
      { "label": "Quick Start (Warrior)", "value": "warrior" },
      { "label": "Quick Start (Mage)", "value": "mage" },
      { "label": "Custom", "value": "custom" }
    ],
    "stateKey": "creationMode", "next": "create-branch" },
  { "id": "create-branch", "type": "Branch",
    "conditions": [{ "when": "state.creationMode == 'custom'", "next": "custom-create" }],
    "default": "preset-create" },
  { "id": "preset-create", "type": "RunFlow", "flowRef": "preset-character", "next": "adventure" },
  { "id": "custom-create", "type": "Prompt", "flowRef": "custom-character",
    "inputChannel": "description", "promptText": "Describe your character:", "next": "adventure" }
]
```

## 3. Turn-Based Game Loop

The core loop pattern for most games.

**Session steps:**
```json
[
  { "id": "intro", "type": "RunFlow", "flowRef": "opening", "next": "turn" },
  { "id": "turn", "type": "Prompt", "flowRef": "main",
    "inputChannel": "playerInput", "promptText": "What do you do?", "next": "check" },
  { "id": "check", "type": "Branch",
    "conditions": [
      { "when": "state.health <= 0", "next": "death" },
      { "when": "state.questComplete == true", "next": "victory" }
    ],
    "default": "turn" },
  { "id": "death", "type": "End", "message": "Game Over." },
  { "id": "victory", "type": "End", "message": "You win!" }
]
```

## 4. History Compaction

Prevent token overflow in long sessions by periodically summarizing history.

**Session steps (insert after main loop):**
```json
{ "id": "compact-check", "type": "Branch",
  "conditions": [{ "when": "state.turnCount % 10 == 0", "next": "compact" }],
  "default": "turn" },
{ "id": "compact", "type": "RunFlow", "flowRef": "compact-history", "next": "turn" }
```

**compact-history flow:**
```
ReadState(history,summary) → PromptBuild("Summarize...") → Message → GenerateText → CompactHistory
```

The `CompactHistory` node clears `history` and writes the new summary to `summary`.

## 5. SubFlow Composition

Break complex flows into reusable sub-flows.

**Main flow calls sub-flow via SubFlow node:**
```json
{
  "id": "narrate",
  "type": "SubFlow",
  "inputs": [{ "name": "playerInput", "type": "string" }],
  "outputs": [{ "name": "result", "type": "string" }],
  "config": { "ref": "narrate" }
}
```

SubFlow inputs/outputs are wired via edges just like any other node. The child flow's `SignalIn`/`SignalOut` channels map to the SubFlow node's inputs/outputs.

## 6. Dynamic Choices Based on State

Show/hide options based on game state.

```json
{
  "id": "action",
  "type": "DynamicChoice",
  "promptText": "Choose your action:",
  "options": [
    { "label": "Attack", "value": "attack" },
    { "label": "Use Healing Potion", "value": "heal", "when": "state.potions > 0" },
    { "label": "Cast Fireball", "value": "fireball", "when": "state.mana >= 20" },
    { "label": "Flee", "value": "flee" }
  ],
  "flowRef": "resolve-action",
  "inputChannel": "action",
  "next": "check"
}
```

## 7. State-Driven Branching with Side Effects

Branch can set state when taking a path.

```json
{
  "id": "time-check",
  "type": "Branch",
  "conditions": [
    { "when": "state.night >= 4", "next": "final-night", "setState": { "isFinalNight": true } }
  ],
  "default": "next-night",
  "defaultSetState": { "night": "state.night + 1" }
}
```

## 8. WriteState Operations

Beyond simple `set`, WriteState supports:

```json
{
  "config": {
    "path": "stateChanges",
    "allowedKeys": ["inventory", "gold", "health", "xp"],
    "operations": {
      "inventory": "appendMany",
      "gold": "increment",
      "health": "set",
      "xp": "increment"
    },
    "constraints": {
      "health": { "min": 0, "max": 100 },
      "gold": { "min": 0 }
    },
    "deduplicateBy": {
      "inventory": "id"
    }
  }
}
```

- `set` — replace value (default)
- `append` — push single item to array
- `appendMany` — push multiple items to array
- `increment` — add number to existing value

## 9. Prompt Fragment Types

PromptBuild supports multiple fragment types for composing rich prompts:

```json
{
  "fragments": [
    { "type": "base", "id": "role", "content": "You are a dungeon master.", "role": "system" },
    { "type": "state", "id": "world", "source": "worldDescription", "template": "Current world: {{value}}" },
    { "type": "state", "id": "stats", "source": "playerStats", "template": "Player stats: {{value}}" },
    { "type": "input", "id": "action", "source": "data.playerInput", "template": "Player action: {{value}}" },
    { "type": "conditional", "id": "combat", "when": "state.inCombat == true", "content": "Combat rules: ..." },
    { "type": "base", "id": "format", "content": "Respond in JSON: { narrative, stateChanges }" }
  ]
}
```

## 10. kal_config.json Template

```json
{
  "name": "my-game",
  "version": "1.0.0",
  "engine": {
    "logLevel": "warn",
    "maxConcurrentFlows": 1,
    "nodeTimeout": 60000,
    "runTimeout": 0
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

Supports `${ENV_VAR}` substitution. Compatible with any OpenAI-compatible API (OpenAI, DeepSeek, Ollama, vLLM, etc.).
