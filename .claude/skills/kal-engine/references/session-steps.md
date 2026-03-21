# Session Step Types Reference

Session steps define the player journey as a state machine. Each step has `id`, `type`, and typically `next`.

## RunFlow

Execute a flow without player input.

```json
{ "id": "intro", "type": "RunFlow", "flowRef": "intro", "next": "turn" }
```

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | Unique step identifier |
| `type` | yes | `"RunFlow"` |
| `flowRef` | yes | Flow name (filename without `.json`) |
| `next` | yes | Next step ID |

## Prompt

Ask the player for text input, optionally run a flow with it.

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

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | Unique step identifier |
| `type` | yes | `"Prompt"` |
| `next` | yes | Next step ID |
| `flowRef` | conditional | Flow to execute with input (requires `inputChannel`) |
| `inputChannel` | conditional | Flow input channel name (required when `flowRef` set) |
| `stateKey` | conditional | Write input directly to state key (alternative to `flowRef`) |
| `promptText` | no | Text shown to player |

Must have either `flowRef` or `stateKey`.

## Choice

Present multiple-choice options to the player.

```json
{
  "id": "choose-class",
  "type": "Choice",
  "promptText": "Choose your class:",
  "options": [
    { "label": "Warrior", "value": "warrior" },
    { "label": "Mage", "value": "mage" },
    { "label": "Rogue", "value": "rogue" }
  ],
  "flowRef": "create-character",
  "inputChannel": "classChoice",
  "next": "adventure"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | Unique step identifier |
| `type` | yes | `"Choice"` |
| `promptText` | yes | Text shown above options |
| `options` | yes | `Array<{ label: string, value: string }>` |
| `next` | yes | Next step ID |
| `flowRef` | no | Flow to execute with selected value |
| `inputChannel` | no | Flow input channel for selected value |
| `stateKey` | no | Write selected value to state key |

## DynamicChoice

Choice with conditionally visible options based on state.

```json
{
  "id": "action",
  "type": "DynamicChoice",
  "promptText": "What do you do?",
  "options": [
    { "label": "Attack", "value": "attack" },
    { "label": "Use Potion", "value": "potion", "when": "state.potions > 0" },
    { "label": "Flee", "value": "flee", "when": "state.canFlee == true" }
  ],
  "stateKey": "lastAction",
  "next": "resolve"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | Unique step identifier |
| `type` | yes | `"DynamicChoice"` |
| `promptText` | yes | Text shown above options |
| `options` | yes | `Array<{ label, value, when? }>` — `when` is a state expression |
| `next` | yes | Next step ID |

Options with `when` conditions are filtered at runtime. Options without `when` always show.

## Branch

Route to different steps based on state conditions.

```json
{
  "id": "check",
  "type": "Branch",
  "conditions": [
    { "when": "state.health <= 0", "next": "death" },
    { "when": "state.questStage == 'completed'", "next": "victory" }
  ],
  "default": "turn"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | Unique step identifier |
| `type` | yes | `"Branch"` |
| `conditions` | yes | `Array<{ when: string, next: string, setState? }>` |
| `default` | yes | Fallback step ID when no condition matches |
| `defaultSetState` | no | State changes to apply when taking default path |

Conditions are evaluated in order. First match wins. `when` expressions use `state.keyName` syntax.

## End

Terminate the session.

```json
{ "id": "death", "type": "End", "message": "Game Over. You have fallen." }
```

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | Unique step identifier |
| `type` | yes | `"End"` |
| `message` | no | Final message shown to player |
