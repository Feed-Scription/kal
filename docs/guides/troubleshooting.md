# Troubleshooting

Common issues and solutions when working with KAL.

## Lint Issues

### `CONFIG_UNKNOWN_FIELD`

```
✗ CONFIG_UNKNOWN_FIELD: Node "message" (Message) config has unknown field "system"
```

**Cause:** The node's config contains a field not declared in its `configSchema`.

**Fix:** Remove the unknown field from the node's `config` in the flow JSON. If the field should be dynamic input, wire it via an edge instead.

### `UNUSED_FLOW`

```
⚠ UNUSED_FLOW: Flow "my-flow" is not referenced by any session step or SubFlow node
```

**Cause:** A flow file exists but is not referenced by any session step's `flowRef` or any SubFlow node's `ref` config.

**Fix:** Either remove the unused flow file, or add a session step / SubFlow node that references it.

### `MISSING_REQUIRED_INPUT`

```
✗ MISSING_REQUIRED_INPUT: Node "gen" (GenerateText) required input "messages" has no incoming edge
```

**Cause:** A required input port has no edge connected to it and no `defaultValue`.

**Fix:** Connect an edge from another node's output to this input, or use a `Constant` node.

### `STATE_KEY_NOT_FOUND`

```
✗ STATE_KEY_NOT_FOUND: Branch condition references undefined state key: "score"
```

**Cause:** A `Branch` step's condition references a state key not defined in `initial_state.json`.

**Fix:** Add the missing key to `initial_state.json`, or fix the condition expression.

### `CONFIG_TYPE_MISMATCH`

```
✗ CONFIG_TYPE_MISMATCH: Node "timer" (Timer) config field "intervalMs" expects number but got string
```

**Cause:** A config value's type doesn't match the schema declaration.

**Fix:** Change the value to the correct type in the flow JSON.

### `ReadState` looks orphaned next to `PromptBuild`

**Symptoms:** Lint marks a `ReadState` node as isolated even though the prompt needs state data.

**Cause:** `PromptBuild` field fragments already read from `state.*` directly. If a fragment uses `source: "state.playerName"` or similar, you do not need a separate `ReadState` node for that value.

**Fix:** Remove the extra `ReadState` node unless another node needs the value through an explicit edge. Keep `ReadState` only when you want to pass state into non-`PromptBuild` nodes via flow wiring.

### Session skeletons fail before flows exist

**Symptoms:** `kal session set`, `kal session meta-set`, or `kal session step add/update/patch` fails because a `flowRef` points to a flow you plan to create later.

**Fix:** Use one of the new validation modes:

```bash
# Keep editing, but surface unresolved flowRef as warnings
kal session set --flow-check warn

# Keep editing and suppress unresolved flowRef entirely
kal session set --flow-check ignore

# Compatibility alias
kal session set --skip-flow-check
```

`strict` still blocks the write. Only missing `flowRef` targets are downgraded; structural problems like bad `next` pointers still fail.

### Passing large JSON through CLI is awkward

**Fix:** Prefer file or stdin input sources:

```bash
# Explicit stdin via file alias
cat flow.json | kal flow create my-flow --file -

# Explicit stdin flag
cat session.json | kal session set --stdin

# Implicit pipe detection still works when no --json/--file is provided
cat step.json | kal session step add
```

The rule is always “exactly one input source”: `--json`, `--file <path|->`, `--stdin`, or piped stdin.

### Batch node config updates match the wrong set

**Symptoms:** `kal flow node config-set` updates too many or too few nodes.

**Selector rules:**
- Use `--all-flows` or at least one `--flow <glob>` to declare scope explicitly.
- `--all-flows` and `--flow` are mutually exclusive.
- Repeating the same selector family is OR: multiple `--flow`, `--node-type`, or `--node-id` values broaden the match.
- Different selector families are AND: flow scope, node type, node id, and every `--where` clause must all match.
- `--where` only supports exact `path=value` matching.

Example:

```bash
kal flow node config-set \
  --flow 'main-*' \
  --node-type 'GenerateText' \
  --where config.model=gpt-4o \
  --set timeout=120000
```

### `engine.timeout` no longer works

**Symptoms:** Project load fails with a migration error mentioning `engine.timeout`.

**Fix:** Split the old setting explicitly:

```json
{
  "engine": {
    "nodeTimeout": 60000,
    "runTimeout": 0
  }
}
```

- `engine.nodeTimeout` is the default per-node timeout.
- `node.config.timeout` still overrides it per node.
- `engine.runTimeout` is the total timeout for one `executeFlow()` call.
- `0` disables that layer of timeout.

## Debug Issues

### Run stuck in `waiting_input`

**Symptoms:** `kal debug --state --latest` shows status `waiting_input` and the run doesn't progress.

**Cause:** The session reached a `Prompt` or `Choice` step that requires user input.

**Fix:**
```bash
# Check current state
kal debug --state --latest

# Provide input to continue
kal debug --continue --input "your response here"
```

### Run immediately errors

**Symptoms:** `kal debug --start` creates a run that immediately enters `error` status.

**Common causes:**
1. Missing LLM API key — set `OPENAI_API_KEY` or reference it from `kal_config.json` as `${OPENAI_API_KEY}`
2. Invalid flow reference — a session step references a flow that doesn't exist
3. Custom node error — a custom node's `execute` function threw an exception

**Debug steps:**
```bash
# Check run state for error details
kal debug --state --latest --format json

# Run with verbose output to see LLM traces
kal debug --start --verbose
```

### Breakpoints not triggering

**Cause:** Breakpoints are set on step IDs that don't match the session definition.

**Fix:** Use `kal debug --list` to see available runs, then verify step IDs match your `session.json`.

## Studio Connection Issues

### Studio shows "Loading project..."

**Symptoms:** Studio UI stays on the loading screen and never shows the editor.

**Cause:** The Engine server is not running or not reachable.

**Fix:**
```bash
# Start the integrated studio + engine server
kal studio

# Or start engine separately and open studio in browser
kal studio --port 4399
```

### Studio shows stale data

**Symptoms:** Changes to flow/session files are not reflected in Studio.

**Fix:** Click the refresh button (⟳) in the Studio toolbar, or restart `kal studio`.

### ExtensionSurface infinite re-render

**Symptoms:** Browser console shows React error #185, Studio becomes unresponsive.

**Cause:** This was a known bug where multiple ExtensionSurface instances competed for `activationReason`. It has been fixed — update to the latest version.

## Custom Node Issues

### Custom node not loading

**Symptoms:** `Registered custom node: X` message doesn't appear in console output.

**Checklist:**
1. File is in the `node/` directory of your project root
2. File extension is `.ts`, `.js`, `.mts`, `.mjs`, `.cts`, or `.cjs`
3. The module exports a valid `CustomNode` object (either `default` or named export)
4. The exported object has all required fields: `type`, `label`, `inputs`, `outputs`, `execute`

**Example of a valid custom node:**
```typescript
import type { CustomNode } from '@kal-ai/core';

const MyNode: CustomNode = {
  type: 'MyNode',
  label: 'My Custom Node',
  inputs: [{ name: 'input', type: 'string', required: true }],
  outputs: [{ name: 'output', type: 'string' }],
  async execute(inputs) {
    return { output: inputs.input.toUpperCase() };
  },
};

export default MyNode;
```

### Custom node type conflict

**Symptoms:** Error message about duplicate node type registration.

**Cause:** A custom node uses the same `type` name as a built-in node or another custom node.

**Fix:** Rename your custom node's `type` field to a unique name. Avoid built-in names like `SignalIn`, `Message`, `GenerateText`, etc.

### Custom node not showing in Studio

**Symptoms:** Node loads in CLI but doesn't appear in Studio's node palette.

**Cause:** Studio discovers nodes through the Engine API. The node must be loaded by the Engine at startup.

**Fix:** Restart `kal studio` after adding or modifying custom nodes. The Engine re-scans the `node/` directory on startup.
