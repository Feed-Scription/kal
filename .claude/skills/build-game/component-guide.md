# KAL-AI Technical Reference — Node, Flow, Session, State

> All types from `@kal-ai/core`. Engine host layer from `@kal-ai/engine`.

---

## Flow Structure

Every Flow is a JSON file with two layers: `meta` (contract) and `data` (DAG).

```json
{
  "meta": {
    "schemaVersion": "1.0.0",
    "name": "flow-name",
    "description": "What this flow does",
    "inputs": [
      { "name": "playerInput", "type": "string", "required": true },
      { "name": "context", "type": "object", "required": false, "defaultValue": {} }
    ],
    "outputs": [
      { "name": "result", "type": "object" }
    ]
  },
  "data": {
    "nodes": [ ... ],
    "edges": [ ... ]
  }
}
```

### Node Definition

```json
{
  "id": "unique-node-id",
  "type": "NodeType",
  "inputs": [
    { "name": "data", "type": "string", "required": true }
  ],
  "outputs": [
    { "name": "result", "type": "string" }
  ],
  "config": { ... }
}
```

**Optional fields (omit in AI-generated flows):**
- `label` — Display name for UI. If omitted, the editor uses `type` as fallback.
- `position` — Canvas coordinates `{ x, y }`. The editor has auto-layout that computes positions from DAG structure.

### Edge Definition

```json
{
  "source": "node-a",
  "sourceHandle": "output-name",
  "target": "node-b",
  "targetHandle": "input-name"
}
```

### Type Compatibility

Handle types support basic compatibility checking: `any` matches everything, `object` and `array` have loose matching. Exact type match is preferred.

---

## Utility Nodes

### Constant

Output a static value. Use for deterministic state assignments that don't need LLM involvement (e.g. setting `phase: "night_done"` after sleep).

| Config | Type | Description |
|--------|------|-------------|
| `value` | `any` | The constant value to output |
| `type` | `string?` | Value type hint: `'string' \| 'number' \| 'boolean' \| 'object' \| 'array'` |

**Outputs:** `value` — the configured constant.

```json
{
  "type": "Constant",
  "config": { "value": { "phase": "night_done" }, "type": "object" }
}
```

**When to use Constant instead of LLM:**
- Setting phase transitions (`phase: "night_done"`)
- Fixed numeric values (`ap: 3` for daily reset)
- Boolean flags (`isKeyDay: true`)
- Any value that doesn't require creative judgment

### ComputeState

Deterministic computation node. Replaces LLM for arithmetic, lookups, and conditionals.

| Config | Type | Description |
|--------|------|-------------|
| `operation` | `string` | `'increment' \| 'decrement' \| 'multiply' \| 'divide' \| 'lookup' \| 'conditional'` |
| `operand` | `any` | Number for arithmetic, object for lookup table |
| `condition` | `string?` | Condition for conditional op (e.g. `"value > 10"`) |
| `trueValue` | `any?` | Value when condition is true |
| `falseValue` | `any?` | Value when condition is false |

**Inputs:** `value` — the input value to compute on.

**Outputs:** `result` (computed value), `success` (boolean).

**Examples:**

Day increment (replaces LLM doing day+1):
```json
{
  "type": "ComputeState",
  "config": { "operation": "increment", "operand": 1 }
}
```

Game stage lookup by day:
```json
{
  "type": "ComputeState",
  "config": {
    "operation": "lookup",
    "operand": { "1": "early", "2": "early", "3": "mid", "4": "mid", "5": "late" }
  }
}
```

Conditional assignment:
```json
{
  "type": "ComputeState",
  "config": {
    "operation": "conditional",
    "condition": "value >= 3",
    "trueValue": true,
    "falseValue": false
  }
}
```

---

## Signal Nodes

### SignalIn

Flow input port. Binds to a channel declared in `meta.inputs`.

| Config | Type | Description |
|--------|------|-------------|
| `channel` | `string` | Must match a name in `meta.inputs` |

**Outputs:** `data` — the value injected from the channel.

### SignalOut

Flow output port. Binds to a channel declared in `meta.outputs`.

| Config | Type | Description |
|--------|------|-------------|
| `channel` | `string` | Must match a name in `meta.outputs` |

**Inputs:** `data` — the value to output.

Multiple `SignalOut` nodes can write to the same channel; results are collected into `FlowExecutionResult.outputs`.

---

## State Nodes

### ReadState

Read one or more values from StateStore.

| Config | Type | Description |
|--------|------|-------------|
| `keys` | `string[]` | State keys to read |

**Outputs:** One output per key, plus `all` (object with all requested key-values).

### ModifyState

Modify a single state value.

| Config | Type | Description |
|--------|------|-------------|
| `key` | `string` | State key to modify |
| `operation` | `'set' \| 'add' \| 'subtract' \| 'multiply' \| 'append'` | Operation type |

**Inputs:** `value` — the value to apply.

### AddState

Create a new state key.

| Config | Type | Description |
|--------|------|-------------|
| `key` | `string` | New state key name |
| `type` | `'string' \| 'number' \| 'boolean' \| 'object' \| 'array'` | Value type |

**Inputs:** `value` — initial value.

### RemoveState

Delete a state key.

| Config | Type | Description |
|--------|------|-------------|
| `key` | `string` | State key to remove |

### ApplyState

Batch write state changes from an object. The most important node for LLM → state integration.

| Config | Type | Description |
|--------|------|-------------|
| `path` | `string?` | Extract sub-object from input (e.g. `"stateChanges"`) |
| `allowedKeys` | `string[]?` | Whitelist of keys allowed to update. `[]` = no filter |
| `operations` | `Record<string, 'set' \| 'append' \| 'appendMany'>?` | Operation per key. Default: `set` |
| `constraints` | `Record<string, { min?, max? }>?` | Clamp number values before writing |

**Inputs:** `changes` — object with key-value pairs to write back. If no `changes` input, auto-packs all named inputs.

**Outputs:** `applied` (array of applied key names), `success` (boolean).

**Behavior:**
- Only modifies **existing** state keys (won't create new ones)
- Preserves original type of each key
- `path` extracts a sub-object: if input is `{ stateChanges: { health: 85 } }` and path is `"stateChanges"`, it applies `{ health: 85 }`
- `allowedKeys` filters which keys can be written — critical for preventing LLM from modifying arbitrary state
- `operations` controls how each key is written:
  - `"set"` (default) — overwrite the value
  - `"append"` — append a single item to an array state key (e.g. card collection)
  - `"appendMany"` — append multiple items to an array state key
- `constraints` clamps number values before writing — use for NPC mood, AP, suspicion etc. to prevent LLM from producing out-of-range values

**Example with operations and constraints:**
```json
{
  "type": "ApplyState",
  "config": {
    "path": "stateChanges",
    "allowedKeys": ["ap", "suspicion", "mood_lily", "topicCards"],
    "operations": {
      "topicCards": "append"
    },
    "constraints": {
      "ap": { "min": 0, "max": 3 },
      "suspicion": { "min": 0, "max": 100 },
      "mood_lily": { "min": 0, "max": 100 }
    }
  }
}
```

---

## LLM Nodes

### PromptBuild

Compose prompts from fragments. The primary way to build system prompts with dynamic state data.

| Config | Type | Description |
|--------|------|-------------|
| `defaultRole` | `'system' \| 'user' \| 'assistant'` | Default role for fragments without explicit role |
| `fragments` | `Fragment[]` | Ordered list of prompt fragments |

**Inputs:** `data` (object, optional) — additional data accessible in fragments.

**Outputs:** `messages` (ChatMessage[]), `text` (string), `estimatedTokens` (number).

#### Fragment Types

**`base`** — Static text:
```json
{ "type": "base", "id": "rules", "content": "You are a game narrator...", "role": "system" }
```

**`field`** — Dynamic data from state or input:
```json
{ "type": "field", "id": "hp", "source": "state.health", "label": "Player HP" }
```
Supports `state.xxx` prefix for auto StateStore reads. Also supports `window` (last N items), `sample` (random N items), `sort`, `dedup` for array fields.

**`when`** — Conditional inclusion:
```json
{
  "type": "when", "id": "combat-rules",
  "condition": "state.questStage == 'combat'",
  "content": "Combat rules: ...",
  "else": "Exploration rules: ..."
}
```

**`randomSlot`** — Random selection:
```json
{ "type": "randomSlot", "id": "flavor", "options": ["text1", "text2", "text3"], "seed": 42 }
```

**`budget`** — Token budget control:
```json
{ "type": "budget", "id": "context", "maxTokens": 2000, "strategy": "tail" }
```
Strategies: `tail` (keep last N tokens), `weighted` (prioritize by weight).

### Message

Assemble chat messages with conversation history from state.

| Config | Type | Description |
|--------|------|-------------|
| `historyKey` | `string` | State key for history array (default: `"history"`) |
| `maxHistoryMessages` | `number?` | Max history messages to include |
| `format` | `'xml' \| 'markdown'?` | Format for system/user messages |
| `summaryKey` | `string?` | State key for summary, inserted before history |

**Inputs:** `system` (ChatMessage[] or string), `user` (string), `context` (string, optional — prepended to user message).

**Outputs:** `messages` (ChatMessage[]).

### GenerateText

Call LLM and auto-manage conversation history.

| Config | Type | Description |
|--------|------|-------------|
| `model` | `string?` | Override default model |
| `temperature` | `number?` | Sampling temperature |
| `maxTokens` | `number?` | Max output tokens |
| `responseFormat` | `'text' \| 'json'?` | Response format. `'json'` enables JSON mode |
| `jsonSchema` | `object?` | JSON Schema for structured output (requires `responseFormat: 'json'`). Uses constrained decoding to guarantee output matches schema |
| `historyKey` | `string?` | State key for history (default: `"history"`) |
| `historyPolicy.maxMessages` | `number?` | Max history entries |
| `assistantPath` | `string?` | JSON path to extract for history (e.g. `"narrative"`) |

**Inputs:** `messages` (ChatMessage[]), `historyUserMessage` (string, optional — override user message in history).

**Outputs:** `text` (string — raw LLM response), `usage` (object — token counts).

**Auto-history behavior:** After each call, appends user message + assistant reply to `state[historyKey]`. If the history state doesn't exist, creates it automatically.

**JSON Schema structured output:**
When `responseFormat: "json"` and `jsonSchema` are both set, the LLM is physically constrained to output JSON matching the schema. This eliminates missing fields, wrong types, and structural errors.

```json
{
  "type": "GenerateText",
  "config": {
    "responseFormat": "json",
    "jsonSchema": {
      "type": "object",
      "properties": {
        "narrative": { "type": "string" },
        "stateChanges": {
          "type": "object",
          "properties": {
            "ap": { "type": "number" },
            "phase": { "type": "string", "enum": ["day", "night", "night_done"] }
          }
        }
      },
      "required": ["narrative", "stateChanges"],
      "additionalProperties": false
    }
  }
}
```

**Important:** JSON Schema `minimum`/`maximum` constraints are NOT enforced by constrained decoding — use ApplyState `constraints` or StateStore `min`/`max` for number range enforcement.

### GenerateImage

Stub implementation. Returns `generated://` pseudo URL. Not real image generation.

---

## Processing Nodes

### JSONParse

Parse JSON from text, with error recovery.

| Config | Type | Description |
|--------|------|-------------|
| `extractFromCodeBlock` | `boolean` | Extract JSON from markdown code blocks |
| `fixCommonErrors` | `boolean` | Fix single quotes, trailing commas, comments |
| `fixTruncated` | `boolean` | Attempt to fix truncated JSON |

**Inputs:** `text` (string).

**Outputs:** `data` (object), `success` (boolean), `error` (string).

### PostProcess

Apply transformations to text output.

### Regex

Apply regex patterns to extract or transform text.

---

## Composition Nodes

### SubFlow

Execute another Flow as a sub-routine.

| Config | Type | Description |
|--------|------|-------------|
| `ref` | `string` | Flow ID to execute |

**Inputs/Outputs:** Must match the referenced Flow's `meta.inputs`/`meta.outputs`. The engine validates this contract at load time.

**Behavior:** Recursively executes the referenced Flow via `context.flow.execute`. Circular references are detected at load time.

---

## Timer Node

### Timer

Delay or schedule execution.

| Config | Type | Description |
|--------|------|-------------|
| `delay` | `number` | Delay in milliseconds |
| `mode` | `'once' \| 'interval'` | Trigger mode (`interval` is partially implemented) |

---

## Session Steps

Session is a state machine defined in `session.json`. Each step has an `id`, `type`, and `next` (except `End` and `Branch`).

### RunFlow

Execute a Flow without player input.

```json
{ "id": "intro", "type": "RunFlow", "flowRef": "intro", "next": "choose-mode" }
```

### Prompt

Ask player for text input. Optionally write to state and/or pass to a Flow.

```json
{
  "id": "turn", "type": "Prompt",
  "promptText": "你的行动？",
  "stateKey": "playerName",
  "flowRef": "main",
  "inputChannel": "playerInput",
  "next": "check"
}
```

- `stateKey` — Write player input directly to this state key
- `flowRef` + `inputChannel` — Pass input to a Flow via the named channel

Both can be used together or independently.

### Choice

Present options to player. Same mechanics as Prompt but with predefined options.

```json
{
  "id": "choose-race", "type": "Choice",
  "promptText": "选择你的种族：",
  "options": [
    { "label": "人类 — 适应力强", "value": "human" },
    { "label": "精灵 — 敏捷灵巧", "value": "elf" },
    { "label": "矮人 — 强壮耐打", "value": "dwarf" }
  ],
  "stateKey": "race",
  "flowRef": "apply-preset",
  "inputChannel": "choice",
  "next": "choose-class"
}
```

**Three legal combinations:**
1. `flowRef + inputChannel` — selection triggers a flow, input passed via channel
2. `stateKey` only — selection stored in state, no flow executed
3. `flowRef + stateKey + inputChannel` — selection stored in state AND triggers a flow

**Invalid:** `inputChannel` without `flowRef` — the flow cannot receive input without a flowRef. The engine will reject this at validation time.
```

### Branch

Conditional jump based on state expressions. Supports optional `setState` side effects on each branch.

```json
{
  "id": "check", "type": "Branch",
  "conditions": [
    { "when": "state.health <= 0", "next": "death" },
    { "when": "state.questStage == 'completed'", "next": "victory" }
  ],
  "default": "turn"
}
```

Conditions are evaluated in order; first match wins. `default` is used when no condition matches.

**Branch setState** — Apply state changes as a side effect of branching, without needing a separate flow:

```json
{
  "id": "sleep-check", "type": "Branch",
  "conditions": [
    { "when": "state.phase == 'night'", "next": "day-start", "setState": { "phase": "night_done" } }
  ],
  "default": "night-action",
  "defaultSetState": { "nightActions": 0 }
}
```

This eliminates trivial flows like `force-sleep.json` that only set a single state value.

### DynamicChoice

Like Choice, but filters options based on state conditions. Only visible options are shown to the player.

```json
{
  "id": "phone-menu", "type": "DynamicChoice",
  "promptText": "手机功能：",
  "options": [
    { "label": "浏览社交媒体", "value": "social_media", "when": "state.phoneUnlocked_social == true" },
    { "label": "匿名行动", "value": "anon_action", "when": "state.phoneUnlocked_anon == true" },
    { "label": "休息", "value": "sleep" }
  ],
  "stateKey": "phoneChoice",
  "flowRef": "phone-action",
  "inputChannel": "choice",
  "next": "after-phone"
}
```

- Options without `when` are always visible
- Options with `when` are only shown if the condition evaluates to true
- If no options are visible, the engine returns a `NO_VISIBLE_OPTIONS` error
- Same `flowRef`/`stateKey`/`inputChannel` combinations as Choice

### End

Terminate the session.

```json
{ "id": "end", "type": "End" }
```

---

## StateStore

The runtime state container. All state is `{ type, value }` pairs defined in `initial_state.json`.

### Supported Types

| Type | JSON Value | Validation |
|------|-----------|------------|
| `string` | `"text"` | Must be string |
| `number` | `42` | Must be finite number (`isFinite`) |
| `boolean` | `true` | Must be boolean |
| `object` | `{ ... }` | Must be plain object |
| `array` | `[ ... ]` | Must be array |

### State Schema Constraints

`initial_state.json` supports declarative constraints that the engine enforces on every write:

```json
{
  "ap": { "type": "number", "value": 3, "min": 0, "max": 3 },
  "mood_lily": { "type": "number", "value": 30, "min": 0, "max": 100 },
  "phase": { "type": "string", "value": "day", "enum": ["day", "night", "night_done"] }
}
```

- `min`/`max` — number values are automatically clamped on every `modify`/`upsert`
- `enum` — string values are rejected if not in the enum list (falls back to first enum value)

**This is the global safety net.** Even if LLM returns `mood: -5` or `phase: "sleeping"`, the engine will clamp/reject at the StateStore level.

### Operations

| Operation | Description |
|-----------|-------------|
| `add(key, type, value)` | Create new state key |
| `get(key)` | Read value (returns deep copy) |
| `modify(key, value)` | Update existing key (enforces constraints) |
| `upsert(key, type, value)` | Create or update (enforces constraints) |
| `remove(key)` | Delete key |
| `append(key, item)` | Append single item to array |
| `appendMany(key, items)` | Append multiple items to array |
| `has(key)` | Check if key exists |
| `getAll()` | Get all state as object |
| `clear()` | Remove all state |

All values must be JSON-serializable. Type checking is enforced at runtime.

### Deterministic Logic Guidelines

**Do NOT use LLM for these operations — use ComputeState or Constant node:**
- Numeric increment/decrement (day+1, AP reset) → `ComputeState` with `increment`/`decrement`
- Lookup tables (gameStage by day range) → `ComputeState` with `lookup`
- Conditional assignments (phone unlock by day number) → `ComputeState` with `conditional`
- State machine transitions (sleep → night_done) → `Constant` node or Branch `setState`
- Boolean flag setting (isKeyDay = true) → `Constant` node

**DO use LLM for these operations:**
- Narrative generation
- NPC dialogue and personality
- Event creation and description
- Mood/trust change direction and magnitude (engine clamps the result)
- Card content generation

---

## Custom Node Interface

```typescript
interface CustomNode {
  type: string;                    // Unique node type identifier
  label: string;                   // Display name
  category: string;                // Category for grouping
  inputs: HandleDefinition[];      // Input ports
  outputs: HandleDefinition[];     // Output ports
  configSchema?: object;           // JSON schema for config
  defaultConfig?: object;          // Default config values
  execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    context: NodeContext
  ): Promise<Record<string, unknown>>;
}

interface NodeContext {
  state: StateStore;               // Read/write game state
  llm: LLMProvider;                // Make LLM calls
  flow: { execute(flowId, inputs) };  // Execute sub-flows
  logger: Logger;
  executionId: string;
  nodeId: string;
}
```

---

## Engine Runtime

### CLI Commands

| Command | Description |
|---------|-------------|
| `kal serve [project-path]` | Start HTTP API server |
| `kal play [project-path]` | Start interactive TUI (requires session.json) |
| `kal debug [project-path] --start` | Start a debug session |
| `kal debug [project-path] --continue [input]` | Advance debug session |
| `kal debug [project-path] --format agent` | Compact output for AI agents (< 2KB) |
| `kal lint [project-path]` | Static analysis — checks session/flow/state consistency |
| `kal smoke [project-path] [--steps N] [--input val]...` | Auto-advance session N steps with preset inputs |
| `kal help` | Print usage |

### HTTP API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/project` | Project info |
| POST | `/api/project/reload` | Hot reload |
| GET | `/api/flows` | List all flows |
| GET | `/api/flows/:id` | Get flow definition |
| PUT | `/api/flows/:id` | Save flow (with validation) |
| POST | `/api/executions` | Execute a flow |
| GET | `/api/nodes` | Get node manifests |
| GET | `/api/session` | Get session definition |
| PUT | `/api/session` | Save session |
| DELETE | `/api/session` | Delete session |

Response format: `{ success: true, data: T }` or `{ success: false, error: { code, message, details? } }`.

### Hook System

Three levels of execution hooks:

| Level | Events |
|-------|--------|
| Flow | `onFlowStart`, `onFlowEnd`, `onFlowError` |
| Node | `onNodeStart`, `onNodeEnd`, `onNodeError` |
| LLM | `onLLMRequest`, `onLLMResponse` |

Hook listener errors don't block the main flow (caught and logged).
