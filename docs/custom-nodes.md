# Custom Nodes Guide

This guide walks you through creating custom nodes from scratch. Custom nodes extend KAL's built-in node set with your own game logic.

## How Custom Nodes Work

KAL scans the `node/` directory in your project root at startup. Each `.ts` or `.js` file that exports a valid `CustomNode` object is automatically registered and available in flows.

## Minimal Example

Create `node/Greet.ts`:

```typescript
import type { CustomNode } from '@kal-ai/core';

const Greet: CustomNode = {
  type: 'Greet',
  label: '打招呼',
  category: 'transform',
  inputs: [
    { name: 'name', type: 'string', required: true },
  ],
  outputs: [
    { name: 'greeting', type: 'string' },
  ],
  async execute(inputs) {
    return { greeting: `Hello, ${inputs.name}!` };
  },
};

export default Greet;
```

That's it. Run `kal studio` or `kal debug --start` and the node is available.

## CustomNode Interface

```typescript
interface CustomNode {
  type: string;           // Unique identifier (PascalCase recommended)
  label: string;          // Display name in Studio
  category?: string;      // 'signal' | 'state' | 'llm' | 'transform' | 'utility'
  inputs: NodePort[];     // Input ports
  outputs: NodePort[];    // Output ports
  configSchema?: object;  // JSON Schema for config validation
  defaultConfig?: Record<string, unknown>;
  execute: (
    inputs: Record<string, any>,
    config: Record<string, any>,
    context: ExecutionContext,
  ) => Promise<Record<string, any>>;
}

interface NodePort {
  name: string;
  type: string;           // 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any'
  required?: boolean;
  defaultValue?: unknown;
}
```

## Adding Config

Config lets users set static parameters on the node in the flow JSON. Define a `configSchema` to enable validation.

```typescript
const DiceRoll: CustomNode = {
  type: 'DiceRoll',
  label: '掷骰子',
  category: 'transform',
  inputs: [],
  outputs: [
    { name: 'result', type: 'number' },
    { name: 'text', type: 'string' },
  ],
  configSchema: {
    type: 'object',
    properties: {
      sides: { type: 'number' },
      count: { type: 'number' },
    },
    additionalProperties: false,
  },
  defaultConfig: {
    sides: 20,
    count: 1,
  },
  async execute(_inputs, config) {
    const sides = (config.sides as number) || 20;
    const count = (config.count as number) || 1;
    const rolls: number[] = [];
    for (let i = 0; i < count; i++) {
      rolls.push(Math.floor(Math.random() * sides) + 1);
    }
    const total = rolls.reduce((a, b) => a + b, 0);
    return {
      result: total,
      text: `${count}d${sides}: [${rolls.join(', ')}] = ${total}`,
    };
  },
};

export default DiceRoll;
```

In the flow JSON, configure it like:

```json
{
  "id": "roll",
  "type": "DiceRoll",
  "label": "掷骰子",
  "config": { "sides": 6, "count": 2 }
}
```

## Using Execution Context

The `context` parameter provides access to game state and LLM services.

```typescript
async execute(inputs, config, context) {
  // Read state
  const health = context.state.health as number;

  // Access LLM (if needed)
  // const response = await context.llm.generateText({ ... });

  return { currentHealth: health };
}
```

### Available Context Fields

| Field | Type | Description |
|-------|------|-------------|
| `context.state` | `Record<string, any>` | Current game state (read-only snapshot) |
| `context.llm` | `LLMProvider` | LLM provider for text/image generation |
| `context.flowId` | `string` | Current flow ID |
| `context.nodeId` | `string` | Current node ID |

## Real-World Example: CharacterGen

From the `dnd-adventure` example — a node that generates character stats based on race and class:

```typescript
import type { CustomNode } from '@kal-ai/core';

const CLASS_BASE: Record<string, { str: number; dex: number; int: number; hp: number; skills: string[] }> = {
  warrior: { str: 14, dex: 10, int: 8, hp: 120, skills: ['重击', '盾墙', '战吼'] },
  mage:    { str: 8,  dex: 10, int: 14, hp: 80,  skills: ['火球术', '冰冻', '魔法护盾'] },
  rogue:   { str: 10, dex: 14, int: 10, hp: 100, skills: ['背刺', '潜行', '毒刃'] },
};

const RACE_BONUS: Record<string, { str: number; dex: number; int: number }> = {
  human: { str: 2, dex: 2, int: 2 },
  elf:   { str: 0, dex: 4, int: 2 },
  dwarf: { str: 4, dex: -2, int: 0 },
};

const CharacterGen: CustomNode = {
  type: 'CharacterGen',
  label: '角色生成',
  category: 'transform',
  inputs: [
    { name: 'race', type: 'string', required: true },
    { name: 'class', type: 'string', required: true },
  ],
  outputs: [
    { name: 'strength', type: 'number' },
    { name: 'dexterity', type: 'number' },
    { name: 'intelligence', type: 'number' },
    { name: 'maxHealth', type: 'number' },
    { name: 'skills', type: 'array' },
  ],
  async execute(inputs) {
    const base = CLASS_BASE[inputs.class] ?? CLASS_BASE.warrior;
    const bonus = RACE_BONUS[inputs.race] ?? RACE_BONUS.human;
    return {
      strength: base.str + bonus.str,
      dexterity: base.dex + bonus.dex,
      intelligence: base.int + bonus.int,
      maxHealth: base.hp,
      skills: base.skills,
    };
  },
};

export default CharacterGen;
```

## Using Custom Nodes in Flows

Reference your custom node by its `type` in the flow JSON, just like built-in nodes:

```json
{
  "id": "gen-stats",
  "type": "CharacterGen",
  "label": "生成角色属性",
  "inputs": [
    { "name": "race", "type": "string", "required": true },
    { "name": "class", "type": "string", "required": true }
  ],
  "outputs": [
    { "name": "strength", "type": "number" },
    { "name": "maxHealth", "type": "number" },
    { "name": "skills", "type": "array" }
  ],
  "config": {}
}
```

## Studio Integration

Custom nodes appear in Studio automatically:

- The node card shows your `label` and `category` icon
- Config fields render based on `configSchema` (string → text input, number → number input, enum → dropdown, boolean → checkbox, array → list editor)
- Input/output handles display port names and types
- `kal lint` validates config against your `configSchema`

## File Organization

```
my-game/
├── node/
│   ├── DiceRoll.ts        # One node per file (recommended)
│   ├── CharacterGen.ts
│   └── utils/             # Subdirectories are scanned recursively
│       └── helpers.ts     # Non-node files are safely skipped
├── flow/
├── session.json
├── initial_state.json
└── kal_config.json
```

## Checklist

Before shipping a custom node:

- [ ] `type` is unique (no conflict with built-in nodes)
- [ ] `inputs` and `outputs` match what `execute` consumes/returns
- [ ] `configSchema` has `additionalProperties: false` to catch typos
- [ ] `execute` handles missing/invalid inputs gracefully
- [ ] `kal lint` passes with zero warnings
