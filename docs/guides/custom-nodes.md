# Custom Nodes Guide

How to create custom nodes for KAL from scratch.

## Overview

A custom node is a TypeScript file in your project's `node/` directory that exports a `CustomNode` object. The engine auto-discovers and registers these at startup.

## Minimal Example

Create `node/double.ts`:

```typescript
import type { CustomNode } from '@kal-ai/core';

const DoubleNode: CustomNode = {
  type: 'Double',
  label: 'Double a number',
  category: 'math',

  inputs: [
    { name: 'value', type: 'number', required: true },
  ],

  outputs: [
    { name: 'result', type: 'number' },
  ],

  async execute(inputs) {
    return { result: (inputs.value as number) * 2 };
  },
};

export default DoubleNode;
```

## Node Structure

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `type` | `string` | Unique node type identifier (PascalCase) |
| `inputs` | `HandleDefinition[]` | Input ports |
| `outputs` | `HandleDefinition[]` | Output ports |
| `execute` | `(inputs, config, context) => Promise<Record<string, any>>` | Execution function |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `label` | `string` | Display name in Studio |
| `category` | `string` | Grouping category |
| `configSchema` | `object` | JSON Schema for config validation |
| `defaultConfig` | `object` | Default config values |

### Handle Definition

```typescript
interface HandleDefinition {
  name: string;        // Port name (used in edges)
  type: string;        // Type hint: 'string', 'number', 'boolean', 'object', 'array', 'any'
  required?: boolean;  // If true, lint warns when no edge is connected
  defaultValue?: any;  // Fallback when no edge provides a value
}
```

## Config Schema

Define a JSON Schema to validate node config in `kal lint`:

```typescript
const MyNode: CustomNode = {
  type: 'MyNode',
  // ...
  configSchema: {
    type: 'object',
    properties: {
      threshold: { type: 'number' },
      mode: { type: 'string', enum: ['fast', 'accurate'] },
    },
    required: ['threshold'],
    additionalProperties: false,
  },
  defaultConfig: {
    threshold: 0.5,
    mode: 'fast',
  },
  // ...
};
```

With `additionalProperties: false`, lint will flag any config keys not declared in `properties`.

## Execution Context

The `execute` function receives three arguments:

```typescript
async execute(
  inputs: Record<string, any>,   // Values from incoming edges
  config: Record<string, any>,   // Node config from flow JSON
  context: NodeContext,           // State access + LLM client
) {
  // Read state
  const hp = context.state.get('health');

  // Write state
  context.state.set('health', { type: 'number', value: hp.value - 10 });

  // Call LLM
  const result = await context.llm.invoke(
    [{ role: 'user', content: 'Hello' }],
    { model: 'gpt-4o-mini' },
  );

  return { output: result.text };
}
```

### NodeContext API

| Method | Description |
|--------|-------------|
| `context.state.get(key)` | Read a state value (returns `StateValue`) |
| `context.state.set(key, stateValue)` | Write a state value |
| `context.state.delete(key)` | Remove a state key |
| `context.state.append(key, value)` | Append to an array state |
| `context.llm.invoke(messages, options?)` | Call the configured LLM |

## Using in a Flow

Reference your custom node by its `type` in flow JSON:

```json
{
  "id": "my-double",
  "type": "Double",
  "label": "Double the score",
  "inputs": [
    { "name": "value", "type": "number", "required": true }
  ],
  "outputs": [
    { "name": "result", "type": "number" }
  ],
  "config": {}
}
```

Wire it with edges like any built-in node.

## Testing

### With `kal lint`

```bash
kal lint <project-path>
```

Lint validates that your node's config matches its `configSchema` and that required inputs have edges.

### With `kal debug`

```bash
kal debug <project-path> --start --verbose
```

The `--verbose` flag shows detailed execution context including node inputs and outputs.

### Unit Testing

```typescript
import { describe, it, expect } from 'vitest';
import DoubleNode from './double';

describe('Double node', () => {
  it('doubles the input', async () => {
    const result = await DoubleNode.execute(
      { value: 21 },
      {},
      { state: { get: () => null, set: () => {}, delete: () => {}, append: () => {} }, llm: {} as any },
    );
    expect(result.result).toBe(42);
  });
});
```

## Studio Integration

Custom nodes automatically appear in Studio when the engine loads them. The Studio renders them using the `type`, `label`, `inputs`, `outputs`, and `configSchema` from the manifest.

To verify your node appears:

1. Run `kal studio <project-path>`
2. Open the flow editor
3. Right-click the canvas — your node should appear in the context menu under its `category`

## Common Pitfalls

- **Forgetting `async`**: `execute` must return a Promise. Always use `async` or return `Promise.resolve(...)`.
- **Wrong export**: The file must use `export default`. Named exports are not picked up by the loader.
- **Type mismatch**: If your output type doesn't match the downstream node's input type, the edge will still connect but runtime behavior may be unexpected. Use consistent types.
- **Missing `additionalProperties: false`**: Without this, `kal lint` won't catch unknown config fields.
