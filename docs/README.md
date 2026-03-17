# KAL Documentation

KAL is a data-driven game engine where game logic is defined in JSON, not code. It combines a node-based flow system with LLM integration to power interactive text games.

## Guides

| Document | Description |
|----------|-------------|
| [Getting Started](getting-started.md) | Build a minimal Q&A game from scratch, then explore the DND adventure example |
| [Core Concepts](concepts.md) | Node, Flow, State, Session — the four objects and how they fit together |
| [Project Structure](project-structure.md) | File-by-file breakdown of a KAL project |
| [Custom Nodes](guides/custom-nodes.md) | Create custom nodes in TypeScript to extend the built-in node set |
| [Design Patterns](guides/design-patterns.md) | Common game patterns and how to implement them in KAL |
| [Troubleshooting](guides/troubleshooting.md) | Common issues and how to resolve them |
| [Extension Guide](extension-guide.md) | Develop KAL Studio extensions (node packs, templates, themes) |
| [Extension API](extension-api.md) | Extension API reference and capability system |
| [TODO](internal/todo.md) | Project TODO list |

## Reference (auto-generated)

These docs are generated from source code by `pnpm generate-docs`. Do not edit them manually.

| Document | Description |
|----------|-------------|
| [Built-in Nodes](reference/nodes.md) | All 17 built-in nodes — inputs, outputs, config, defaults |
| [Session Steps](reference/session-steps.md) | The 6 session step types and their fields |
| [Configuration](reference/config.md) | KalConfig, EngineConfig, LLMConfig, and default values |
| [CLI Commands](reference/cli.md) | `kal serve`, `studio`, `play`, `debug`, `lint`, `smoke`, `eval`, `init`, `schema`, `config` |
| [Hook Events](reference/hooks.md) | Engine lifecycle hooks and event types |

## Internal

[Internal development documents](internal/README.md) — archived architecture notes from v1–v5, preserved for historical reference.
