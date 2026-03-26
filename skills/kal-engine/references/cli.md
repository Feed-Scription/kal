# CLI Command Reference

## Project Lifecycle

### `kal init <project-name>`
Scaffold a new KAL project.

| Option | Default | Description |
|--------|---------|-------------|
| `--template <minimal\|game>` | `minimal` | Project template |

### `kal config`
Manage user-level configuration.

| Subcommand | Description |
|------------|-------------|
| `init` | Interactive config setup (prompts for API key) |
| `set <key> <value>` | Set config value (e.g. `openai.apiKey`, `openai.baseUrl`) |
| `get <key>` | Read config value |
| `list` | List all config |
| `remove <key>` | Remove config value |
| `set-key <provider> [key]` | Securely set API key (prompts if key omitted) |

## Validation & Testing

### `kal lint [projectPath]`
Static analysis — validates session, flows, nodes, state references.

| Option | Default | Description |
|--------|---------|-------------|
| `--format <json\|pretty>` | `pretty` | Output format |

Exit code: 1 if errors found, 0 if clean or warnings only.

Checks: session schema, flow references, unused flows, state key references, empty flows, orphan nodes, required inputs, config schema validation.

### `kal smoke [projectPath]`
Automated smoke testing — walks through session steps.

| Option | Default | Description |
|--------|---------|-------------|
| `--steps N` / `-n N` | 10 | Max steps to run |
| `--input <value>` / `-i <value>` | — | Input value (repeatable) |
| `--input <stepId>=<value>` | — | Bind input to specific step |
| `--dry-run` | false | Preview without executing flows |
| `--format <json\|pretty>` | `pretty` | Output format |

Exit code: 1 if error status, 0 otherwise. Auto-selects first option for Choice steps when no input provided.

## Running & Playing

### `kal play [projectPath]`
Interactive TUI player.

| Option | Default | Description |
|--------|---------|-------------|
| `--lang <en\|zh-CN>` | `en` | UI language |

Built-in commands: `/quit`, `/state`, `/help`. Supports TTY (Ink/React) and non-TTY modes.

### `kal serve [projectPath]`
Start HTTP API server only.

| Option | Default | Description |
|--------|---------|-------------|
| `--host <host>` | `127.0.0.1` | Bind host |
| `--port <port>` | `3000` | Bind port |

### `kal studio [projectPath]`
Start Studio workbench (visual editor + API server).

| Option | Default | Description |
|--------|---------|-------------|
| `--host <host>` | `127.0.0.1` | Bind host |
| `--port <port>` | `3000` | Bind port |

## Debugging

### `kal debug`
Persisted debug runs with state inspection. All subcommands support `--format json|pretty|agent`.

| Subcommand | Description |
|------------|-------------|
| `start [--force-new]` | Start new debug session (reuses active if hash matches) |
| `step [--input <value>]` | Execute one step and pause |
| `continue [--input <value>]` | Run until blocked (waiting_input, ended, or error) |
| `state` | Print current state snapshot |
| `diff --diff-run <id>` | Compare state between two runs |
| `list` | List all debug runs for project |
| `delete --run-id <id>` | Delete a debug run |
| `retry` | Retry failed step |
| `skip` | Skip current step |

Common options: `--run-id <id>`, `--latest`, `--state-dir <path>`, `--verbose`, `--cleanup`.

The `--format agent` output includes `observation.allowed_next_actions` with suggested commands.

## Inspection & Editing

### `kal schema`
Inspect built-in schema information.

| Subcommand | Description |
|------------|-------------|
| `nodes` | List all 17 built-in node types |
| `node <type>` | Show detailed schema for a node type |
| `session` | Show session step types and fields |

### `kal flow`
Read and modify flow definitions.

| Subcommand | Description |
|------------|-------------|
| `list` | List all flows |
| `show <flowId>` | Show flow definition |
| `create <flowId>` | Create new flow |
| `update <flowId>` | Replace flow definition |
| `delete <flowId>` | Delete flow |
| `execute <flowId>` | Execute flow with input |
| `validate <flowId>` | Validate flow |
| `meta-set <flowId>` | Update flow metadata (`--name`, `--description`) |

**Node subcommands** (`kal flow node`):

| Subcommand | Description |
|------------|-------------|
| `list <flowId>` | List nodes in flow |
| `show <flowId> <nodeId>` | Show node details |
| `add <flowId>` | Add node to flow |
| `update <flowId> <nodeId>` | Replace node |
| `patch <flowId> <nodeId>` | Patch node fields (`--set key=value`) |
| `remove <flowId> <nodeId>` | Remove node |
| `config-set <flowId> <nodeId>` | Set node config (`--set key=value`, supports `--all-flows`, `--node-type <glob>`) |

**Edge subcommands** (`kal flow edge`):

| Subcommand | Description |
|------------|-------------|
| `list <flowId>` | List edges |
| `add <flowId>` | Add edge (`--source nodeId:handle --target nodeId:handle`) |
| `remove <flowId>` | Remove edge |

**Fragment subcommands** (`kal flow node fragment`):

| Subcommand | Description |
|------------|-------------|
| `list <flowId> <nodeId>` | List prompt fragments |
| `add <flowId> <nodeId>` | Add fragment (`--type`, `--id`, `--source`, `--template`) |
| `update <flowId> <nodeId> <fragmentId>` | Update fragment |
| `remove <flowId> <nodeId> <fragmentId>` | Remove fragment |

### `kal session`
Read and modify session.json.

| Subcommand | Description |
|------------|-------------|
| `show` | Show session definition |
| `set` | Replace session definition |
| `delete` | Delete session.json |
| `validate` | Validate session (`--flow-check strict\|warn\|off`) |
| `meta-set` | Update metadata (`--name`, `--description`, `--entry-step`) |

**Step subcommands** (`kal session step`):

| Subcommand | Description |
|------------|-------------|
| `list` | List all steps |
| `show <stepId>` | Show step details |
| `add` | Add step (`--after <stepId>`) |
| `update <stepId>` | Replace step |
| `patch <stepId>` | Patch step fields (`--set key=value`) |
| `remove <stepId>` | Remove step |

### `kal eval`
Prompt evaluation toolkit for A/B testing.

| Subcommand | Description |
|------------|-------------|
| `nodes <flow>` | List prompt-capable nodes |
| `render <flow> --node <id>` | Render prompt with state |
| `run <flow> --node <id>` | Run eval (`--runs N`, `--variant <file>`, `--model <name>`) |
| `compare <fileA> <fileB>` | Compare eval results |

## Input Methods

All write commands (`create`, `update`, `set`, `add`) accept input via:
- `--json '<inline-json>'` — inline JSON string
- `--file <path>` or `--file -` — read from file or stdin
- `--stdin` — explicit stdin flag
- Piped stdin (auto-detected when not TTY)

## JSON Output Envelope

Commands with `--format json` return a consistent envelope:
```json
{
  "schema_version": "1.0.0",
  "command": "flow.show",
  "status": "ok",
  "data": { },
  "errors": [],
  "warnings": []
}
```

Error objects include: `error_class`, `error_code`, `message`, `retryable`, `hint`, `details`.

## Exit Codes

- **0** — Success
- **1** — Runtime error or validation failure
- **2** — Invalid arguments or usage error
