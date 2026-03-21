# Built-in Nodes Reference

KAL ships with 17 built-in nodes across 5 categories.

## Signal Nodes

### SignalIn
Flow input channel. Receives data from session steps or parent flows.

- **Category:** signal
- **Inputs:** none
- **Outputs:** `data` (any)
- **Config:** `channel` (string, required) — name matching `meta.inputs[].name`

### SignalOut
Flow output channel. Sends data back to session or parent flow.

- **Category:** signal
- **Inputs:** `data` (any)
- **Outputs:** `data` (any)
- **Config:** `channel` (string, required) — name matching `meta.outputs[].name`

### Timer
Delayed execution trigger.

- **Category:** signal
- **Inputs:** none
- **Outputs:** `timestamp` (number)
- **Config:** `delay` (number, default: 0), `interval` (number)

## State Nodes

### ReadState
Read values from the state store.

- **Category:** state
- **Inputs:** `key` (string, optional)
- **Outputs:** `value` (any), `exists` (boolean)
- **Config:** `keys` (string[]) — list of state keys to read

### WriteState
Write values to the state store. Only modifies pre-declared keys.

- **Category:** state
- **Inputs:** `changes` (object), `key` (string), `value` (any) — all optional
- **Outputs:** `applied` (array), `success` (boolean)
- **Config:**
  - `path` (string) — dot-path into input object to extract changes (e.g. `"stateChanges"`)
  - `allowedKeys` (string[]) — whitelist of writable keys
  - `operations` (object) — per-key operation: `"set"` (default), `"append"`, `"appendMany"`, `"increment"`
  - `constraints` (object) — per-key `{ min, max }` for numbers
  - `deduplicateBy` (object) — for appendMany, deduplicate by field (e.g. `{ "items": "id" }`)

### ComputeState
Perform calculations on state values.

- **Category:** state
- **Inputs:** `value` (any, optional)
- **Outputs:** `result` (any), `success` (boolean)
- **Config:**
  - `operation` (required): `"increment"`, `"decrement"`, `"multiply"`, `"divide"`, `"lookup"`, `"conditional"`
  - `operand` (number | object) — for arithmetic or lookup table
  - `condition` (string) — expression for conditional (e.g. `"value > 10"`)
  - `trueValue`, `falseValue` — return values for conditional

## LLM Nodes

### PromptBuild
Assemble prompts from fragments.

- **Category:** llm
- **Inputs:** `data` (object, optional) — template variables
- **Outputs:** `text` (string), `estimatedTokens` (number)
- **Config:**
  - `format`: `"xml"` | `"markdown"`
  - `fragments` (array) — each fragment has:
    - `type`: `"base"` | `"state"` | `"input"` | `"conditional"`
    - `id` (string)
    - `content` (string) — supports `{{variable}}` interpolation
    - `role`: `"system"` | `"user"` | `"assistant"`
    - `source` (string) — for state fragments, the state key
    - `template` (string) — for state fragments, template with `{{value}}`

### Message
Assemble full message array with history support.

- **Category:** llm
- **Inputs:** `system` (string), `context` (string), `user` (string) — all optional
- **Outputs:** `messages` (ChatMessage[])
- **Config:**
  - `historyKey` (string) — state key for conversation history
  - `maxHistoryMessages` (number) — limit history length
  - `summaryKey` (string) — state key for conversation summary

### GenerateText
Call LLM and generate text response.

- **Category:** llm
- **Inputs:** `messages` (ChatMessage[], required), `historyUserMessage` (string, optional)
- **Outputs:** `text` (string), `usage` (object)
- **Config:**
  - `model` (string) — override default model
  - `temperature` (number, default: 0.7)
  - `maxTokens` (number, default: 2000)
  - `historyKey` (string, default: "history") — auto-append to history
  - `historyPolicy` — `{ maxMessages: number }`
  - `assistantPath` (string) — extract specific field from response for history
  - `responseFormat`: `"text"` | `"json"`
  - `jsonSchema` (object) — JSON schema for structured output
  - `reasoning` — `{ effort, maxTokens, exclude }` for reasoning models

### GenerateImage
Generate images via LLM.

- **Category:** llm
- **Inputs:** `prompt` (string, required)
- **Outputs:** `imageUrl` (ImageUrl)
- **Config:** `model` (string, default: "dall-e-3")

### UpdateHistory
Manually append to conversation history.

- **Category:** llm
- **Inputs:** `userMessage` (string, required), `assistantMessage` (string, required)
- **Outputs:** `success` (boolean)
- **Config:** `historyKey` (string, default: "history"), `assistantPath` (string)

### CompactHistory
Summarize and clear conversation history to save tokens.

- **Category:** llm
- **Inputs:** `summary` (string, required) — new summary text
- **Outputs:** `success` (boolean)
- **Config:** `historyKey` (string, default: "history"), `summaryKey` (string, default: "summary")

## Transform Nodes

### Regex
Pattern matching on text.

- **Category:** transform
- **Inputs:** `text` (string, required)
- **Outputs:** `matches` (array), `groups` (object)
- **Config:** `pattern` (string, required), `flags` (string, default: "g")

### JSONParse
Parse JSON from LLM output with auto-repair.

- **Category:** transform
- **Inputs:** `text` (string, required)
- **Outputs:** `data` (object), `success` (boolean), `error` (string)
- **Config:**
  - `extractFromCodeBlock` (boolean, default: true) — extract JSON from markdown code blocks
  - `fixCommonErrors` (boolean, default: true) — auto-fix trailing commas, etc.
  - `fixTruncated` (boolean, default: true) — attempt to close truncated JSON

### PostProcess
Text transformations pipeline.

- **Category:** transform
- **Inputs:** `text` (string, required)
- **Outputs:** `text` (string)
- **Config:** `processors` (array) — list of text processors

### SubFlow
Call another flow as a sub-routine.

- **Category:** transform
- **Inputs:** dynamic (mapped from parent flow)
- **Outputs:** dynamic (mapped from child flow)
- **Config:** `ref` (string, required) — flow name to call, `timeout` (number)

## Utility Nodes

### Constant
Output a fixed value.

- **Category:** utility
- **Inputs:** none
- **Outputs:** `value` (any)
- **Config:** `value` (required) — the constant value, `type`: `"string"` | `"number"` | `"boolean"` | `"object"` | `"array"`
