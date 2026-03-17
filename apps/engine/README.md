# @kal-ai/engine

CLI, HTTP server, and Studio backend for KAL-AI game projects.

## Features

- **`kal play`** — interactive terminal session runner
- **`kal serve`** — HTTP API server with EventSource streaming
- **`kal studio`** — visual editor with integrated server
- **`kal debug`** — resumable debug sessions with snapshots, breakpoints, and state diff
- **`kal lint`** — static analysis (unused flows, missing inputs, config validation, orphan nodes)
- **`kal smoke`** — automated smoke testing
- **`kal eval`** — prompt evaluation with cross-model comparison
- **`kal init`** — project scaffolding (`--template minimal|game`)
- **`kal schema`** — node and session schema export
- **`kal config`** — configuration management with encrypted API key storage

## Installation

```bash
npm install -g @kal-ai/engine
```

Or use directly with npx:

```bash
npx @kal-ai/engine play ./my-game
```

## Quick Start

```bash
# Create a new game project
kal init my-game --template game

# Set your API key
kal config set-key openai sk-...

# Validate the project
kal lint my-game

# Play the game
kal play my-game
```

## HTTP API

Start the server with `kal serve ./my-game` and access:

- `GET /api/project` — project info
- `GET /api/flows` — list flows
- `GET /api/state` — current state
- `GET /api/diagnostics` — lint results
- `POST /api/runs` — create managed run
- `GET /api/runs/:id/stream` — EventSource for run updates

## Documentation

- [CLI Reference](https://github.com/Feed-Scription/kal/blob/main/docs/reference/cli.md)
- [Getting Started](https://github.com/Feed-Scription/kal/blob/main/docs/getting-started.md)
- [Troubleshooting](https://github.com/Feed-Scription/kal/blob/main/docs/guides/troubleshooting.md)

## License

MIT
