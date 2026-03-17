# create-kal-game

Scaffold a new KAL-AI game project.

## Usage

```bash
npx create-kal-game my-game
npx create-kal-game my-game --template game
```

## Templates

- **minimal** (default) — bare project with one example flow
- **game** — game project with session, state, and an LLM-powered intro flow

## What Gets Created

```text
my-game/
├── kal_config.json        # Engine + LLM configuration
├── initial_state.json     # Game state initialization
├── session.json           # Session definition (game template only)
└── flow/
    └── intro.json         # Example flow
```

## Next Steps

```bash
cd my-game
export OPENAI_API_KEY=sk-...
npx @kal-ai/engine play .
```

## Documentation

- [Getting Started](https://github.com/Feed-Scription/kal/blob/main/docs/getting-started.md)
- [Project Structure](https://github.com/Feed-Scription/kal/blob/main/docs/project-structure.md)

## License

MIT
