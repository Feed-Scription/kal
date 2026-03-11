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
  "label": "Display label",
  "position": { "x": 0, "y": 0 },
  "inputs": [
    { "name": "data", "type": "string", "required": true }
  ],
  "outputs": [
    { "name": "result", "type": "string" }
  ],
  "config": { ... }
}
```

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

**Inputs:** `changes` — object with key-value pairs to write back. If no `changes` input, auto-packs all named inputs.

**Outputs:** `applied` (array of applied key names), `success` (boolean).

**Behavior:**
- Only modifies **existing** state keys (won't create new ones)
- Preserves original type of each key
- `path` extracts a sub-object: if input is `{ stateChanges: { health: 85 } }` and path is `"stateChanges"`, it applies `{ health: 85 }`
- `allowedKeys` filters which keys can be written — critical for preventing LLM from modifying arbitrary state

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
| `responseFormat` | `'text' \| 'json'?` | Response format hint |
| `historyKey` | `string?` | State key for history (default: `"history"`) |
| `historyPolicy.maxMessages` | `number?` | Max history entries |
| `assistantPath` | `string?` | JSON path to extract for history (e.g. `"narrative"`) |

**Inputs:** `messages` (ChatMessage[]), `historyUserMessage` (string, optional — override user message in history).

**Outputs:** `text` (string — raw LLM response), `usage` (object — token counts).

**Auto-history behavior:** After each call, appends user message + assistant reply to `state[historyKey]`. If the history state doesn't exist, creates it automatically.

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

### Branch

Conditional jump based on state expressions.

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

### Operations

| Operation | Description |
|-----------|-------------|
| `add(key, type, value)` | Create new state key |
| `get(key)` | Read value (returns deep copy) |
| `modify(key, value)` | Update existing key |
| `upsert(key, type, value)` | Create or update |
| `remove(key)` | Delete key |
| `append(key, item)` | Append single item to array |
| `appendMany(key, items)` | Append multiple items to array |
| `has(key)` | Check if key exists |
| `getAll()` | Get all state as object |
| `clear()` | Remove all state |

All values must be JSON-serializable. Type checking is enforced at runtime.

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
