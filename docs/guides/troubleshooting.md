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
