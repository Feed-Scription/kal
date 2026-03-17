# @kal-ai/core

Core runtime for the KAL-AI game engine — data-driven game logic with built-in nodes, state management, and LLM integration.

## Features

- **17 built-in nodes** across 5 categories: Signal, State, LLM, Transform, Utility
- **DAG-based flow execution** with topological sorting and dependency resolution
- **Session state machine** for multi-turn dialogue (RunFlow, Prompt, Choice, Branch, End)
- **State management** with type constraints (min/max/enum)
- **LLM integration** with retry, caching, and JSON repair
- **Fragment-based prompt composition** with conditional activation
- **Custom node system** for TypeScript extensions
- **Hook system** for lifecycle events and telemetry

## Installation

```bash
npm install @kal-ai/core
```

## Quick Start

```typescript
import { createKalCore } from '@kal-ai/core';

const core = createKalCore({
  config: { /* kal_config.json contents */ },
  initialState: { /* initial_state.json contents */ },
});

await core.ready;

// Execute a flow
const result = await core.executeFlow(flowDefinition, 'my-flow', { input: 'hello' });
```

## Documentation

- [Getting Started](https://github.com/Feed-Scription/kal/blob/main/docs/getting-started.md)
- [Concepts](https://github.com/Feed-Scription/kal/blob/main/docs/concepts.md)
- [Built-in Nodes](https://github.com/Feed-Scription/kal/blob/main/docs/reference/nodes.md)
- [Custom Nodes Guide](https://github.com/Feed-Scription/kal/blob/main/docs/guides/custom-nodes.md)
- [Design Patterns](https://github.com/Feed-Scription/kal/blob/main/docs/guides/design-patterns.md)

## License

MIT
