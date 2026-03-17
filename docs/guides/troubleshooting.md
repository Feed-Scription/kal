# Troubleshooting

Common issues and how to resolve them.

## Lint / Static Analysis

### `UNUSED_FLOW` warning

**Symptom:** `kal lint` reports a flow is not referenced.

**Cause:** The flow isn't referenced by any session step `flowRef` or `SubFlow` node.

**Fix:** Either add a session step or SubFlow node that references it, or delete the flow file if it's no longer needed.

### `MISSING_REQUIRED_INPUT`

**Symptom:** A node's required input has no incoming edge.

**Fix:** Connect an edge to the missing input, or add a `Constant` node wired to it. Check the node's manifest with `kal schema node <type>` to see which inputs are required.

### `CONFIG_UNKNOWN_FIELD`

**Symptom:** A node's config contains a field not declared in its `configSchema`.

**Cause:** Often happens when input values are mistakenly placed in `config` instead of being wired via edges. For example, `Message` node's `system`/`user`/`context` are **inputs** (edge-wired), not config fields.

**Fix:** Remove the unknown field from config. If the value needs to reach the node, wire it through an edge (use a `Constant` node for static values).

### `CONFIG_TYPE_MISMATCH`

**Symptom:** A config field's actual type doesn't match the schema's declared type.

**Fix:** Check `kal schema node <type>` for the expected types and correct the value in the flow JSON.

## Debug

### `SESSION_HASH_MISMATCH`

**Symptom:** `kal debug --continue` fails with "Project files changed after this run started".

**Cause:** You edited session.json, a flow file, or initial_state.json after starting the debug run. The engine invalidates runs when project files change to prevent inconsistent state.

**Fix:** Start a new run with `kal debug --start --force-new`, or delete the stale run with `kal debug --delete --run-id <id>`.

### `INPUT_REQUIRED`

**Symptom:** `kal debug --continue` fails with "waiting for input".

**Cause:** The session is paused at a `Prompt` or `Choice` step that requires user input.

**Fix:** Provide input: `kal debug --continue --input "your response"`.

### `NO_ACTIVE_RUN`

**Symptom:** `kal debug --continue` fails with "No active run".

**Fix:** Start a new run with `kal debug --start`, or target a specific run with `--run-id <id>` or `--latest`.

### Run stuck in `waiting_input` state

Use `kal debug --state --latest` to inspect the current state and see what input is expected. The `observation.waiting_for` field shows the expected input kind (`prompt` or `choice`).

## Studio Connection

### Studio shows blank page or fails to load

1. Make sure the engine is running: `kal studio <project-path>`
2. Check the terminal for errors — common causes:
   - Port already in use: try `--port 3001`
   - Missing `session.json`: Studio requires a valid project
3. Open browser devtools console for client-side errors

### Studio doesn't reflect file changes

The engine watches project files and emits `resource.changed` events. If Studio seems stale:

1. Check the terminal for file watcher errors
2. Try refreshing the browser
3. Restart `kal studio`

### Config changes not saving

`llm.apiKey` and `llm.baseUrl` cannot be modified through the Studio config editor (security restriction to prevent overwriting environment variable references). Set these via `kal config set-key` or environment variables.

## Custom Nodes

### Custom node not loading

1. Verify the file is in the `node/` directory of your project
2. Check that it exports a valid `CustomNode` object with `type`, `inputs`, `outputs`, and `execute`
3. Look for "Registered custom node:" messages in the terminal — if your node isn't listed, the loader didn't find it
4. Run `kal lint` to check for config schema issues

### Custom node execution errors

Use `kal debug --start --verbose` to see detailed error context including node inputs, flow inputs, and LLM request/response data.

## LLM / API Issues

### `NODE_TIMEOUT`

**Cause:** The LLM API call took too long.

**Fix:**
- Check your API key: `kal config get llm.apiKey`
- Check network connectivity
- Increase timeout in the node's config if needed
- Try a faster model

### Empty or malformed LLM responses

1. Use `kal eval render <flow> --node <id> --format pretty` to preview the assembled prompt
2. Use `kal debug --start --verbose` to see the raw LLM request and response
3. Check that `GenerateText.assistantPath` is set correctly if you expect JSON output
4. Verify the prompt instructs the LLM to output the expected format

## General

### `pnpm install` fails

Make sure you're using pnpm 9.x and Node >= 18. Run `pnpm install --frozen-lockfile` for CI-like behavior.

### Typecheck errors after pulling

Run `pnpm install` first (dependencies may have changed), then `bun run typecheck`.
