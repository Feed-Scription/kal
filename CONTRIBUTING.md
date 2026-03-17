# Contributing to KAL-AI

Thanks for your interest in contributing! This guide covers the essentials.

## Prerequisites

- Node.js >= 18
- [pnpm](https://pnpm.io/) 9.x (package manager)
- [Bun](https://bun.sh/) >= 1.0 (test runner & script executor)

## Getting Started

```bash
git clone https://github.com/Feed-Scription/kal.git
cd kal
pnpm install
```

The `postinstall` script automatically builds `@kal-ai/engine` (which depends on `@kal-ai/core` and `studio`).

## Project Structure

```
packages/
  core/          # @kal-ai/core — runtime, nodes, state, LLM client, prompt eval
apps/
  engine/        # @kal-ai/engine — CLI, HTTP server, debug, lint, Studio backend
  studio/        # Studio — React-based visual editor (Vite + React)
examples/
  dnd-adventure/ # Full example: DND text adventure
  guess-who/     # Minimal example: guessing game
docs/            # Documentation (reference, guides, concepts)
```

## Common Commands

```bash
# From repo root:
pnpm install                  # Install all dependencies
bun run typecheck             # Type-check all packages
bun run test                  # Run all tests (vitest)
bun run build                 # Build all packages

# Run a specific package's tests:
cd apps/engine && bun run test

# Run the CLI locally:
node apps/engine/dist/bin.js lint examples/dnd-adventure
node apps/engine/dist/bin.js studio examples/dnd-adventure
```

## Development Workflow

1. Create a branch from `main`:
   ```bash
   git checkout -b your-branch-name
   ```

2. Make your changes. Run typecheck and tests before committing:
   ```bash
   bun run typecheck && bun run test
   ```

3. Commit with a clear message describing the "why":
   ```bash
   git commit -m "fix: resolve SubFlow reference in unused flow detection"
   ```

4. Push and open a PR against `main`.

## Commit Conventions

Use conventional commit prefixes:

- `feat:` — new feature
- `fix:` — bug fix
- `docs:` — documentation only
- `refactor:` — code change that neither fixes a bug nor adds a feature
- `test:` — adding or updating tests
- `chore:` — tooling, CI, dependencies

Keep commits atomic — one logical change per commit.

## Code Style

- TypeScript strict mode across all packages
- No explicit `any` unless unavoidable (use `unknown` + narrowing)
- Prefer named exports over default exports
- Tests live alongside source files (`*.test.ts`)

## Adding a Built-in Node

1. Define the node in `packages/core/src/node/builtin/`
2. Register it in `packages/core/src/node/builtin/index.ts`
3. Add tests
4. Update `docs/reference/nodes.md` if applicable

## Example Projects

Example projects under `examples/` should pass `kal lint` with zero warnings. After modifying an example, verify:

```bash
node apps/engine/dist/bin.js lint examples/<project-name> --format pretty
```

## Reporting Issues

Open an issue at [github.com/Feed-Scription/kal/issues](https://github.com/Feed-Scription/kal/issues) with:

- Steps to reproduce
- Expected vs actual behavior
- Node/Bun/pnpm versions
