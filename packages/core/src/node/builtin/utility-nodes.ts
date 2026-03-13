/**
 * Utility nodes: Constant, ComputeState
 */

import type { CustomNode } from '../../types/node';

export const Constant: CustomNode = {
  type: 'Constant',
  label: '常量',
  category: 'utility',
  inputs: [],
  outputs: [{ name: 'value', type: 'any' }],
  configSchema: {
    type: 'object',
    properties: {
      value: {
        description: 'The constant value to output',
      },
      type: {
        type: 'string',
        enum: ['string', 'number', 'boolean', 'object', 'array'],
        description: 'The type of the constant value',
      },
    },
    required: ['value'],
    additionalProperties: false,
  },
  defaultConfig: { value: '', type: 'string' },
  async execute(_inputs, config) {
    return { value: config.value };
  },
};

export const ComputeState: CustomNode = {
  type: 'ComputeState',
  label: '计算状态',
  category: 'state',
  inputs: [
    { name: 'value', type: 'any' },
  ],
  outputs: [
    { name: 'result', type: 'any' },
    { name: 'success', type: 'boolean' },
  ],
  configSchema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['increment', 'decrement', 'multiply', 'divide', 'lookup', 'conditional'],
        description: 'The operation to perform',
      },
      operand: {
        description: 'Operand for arithmetic operations (number) or lookup table (object)',
      },
      condition: {
        type: 'string',
        description: 'Condition expression for conditional operation (e.g., "value > 10")',
      },
      trueValue: {
        description: 'Value to return if condition is true',
      },
      falseValue: {
        description: 'Value to return if condition is false',
      },
    },
    required: ['operation'],
    additionalProperties: false,
  },
  defaultConfig: { operation: 'increment', operand: 1 },
  async execute(inputs, config, context) {
    const operation = config.operation as string;
    const value = inputs.value;

    try {
      switch (operation) {
        case 'increment': {
          const operand = typeof config.operand === 'number' ? config.operand : 1;
          if (typeof value !== 'number') {
            throw new Error('increment requires number input');
          }
          return { result: value + operand, success: true };
        }

        case 'decrement': {
          const operand = typeof config.operand === 'number' ? config.operand : 1;
          if (typeof value !== 'number') {
            throw new Error('decrement requires number input');
          }
          return { result: value - operand, success: true };
        }

        case 'multiply': {
          const operand = typeof config.operand === 'number' ? config.operand : 1;
          if (typeof value !== 'number') {
            throw new Error('multiply requires number input');
          }
          return { result: value * operand, success: true };
        }

        case 'divide': {
          const operand = typeof config.operand === 'number' ? config.operand : 1;
          if (typeof value !== 'number') {
            throw new Error('divide requires number input');
          }
          if (operand === 0) {
            throw new Error('division by zero');
          }
          return { result: value / operand, success: true };
        }

        case 'lookup': {
          if (!config.operand || typeof config.operand !== 'object') {
            throw new Error('lookup requires operand to be a lookup table object');
          }
          const table = config.operand as Record<string, any>;
          const key = String(value);
          if (!(key in table)) {
            context.logger.warn('ComputeState: lookup key not found in table', { key, table });
            return { result: undefined, success: false };
          }
          return { result: table[key], success: true };
        }

        case 'conditional': {
          if (!config.condition || typeof config.condition !== 'string') {
            throw new Error('conditional requires condition string');
          }
          const condition = config.condition as string;
          const result = evaluateSimpleCondition(condition, value);
          return {
            result: result ? config.trueValue : config.falseValue,
            success: true,
          };
        }

        default:
          throw new Error(`Unknown operation: ${operation}`);
      }
    } catch (error) {
      context.logger.error('ComputeState failed', { operation, error: (error as Error).message });
      return { result: undefined, success: false };
    }
  },
};

/**
 * Simple condition evaluator for ComputeState conditional operation.
 * Supports: value op literal
 * Operators: ==, !=, >, >=, <, <=
 */
function evaluateSimpleCondition(condition: string, value: any): boolean {
  const match = /^value\s*(==|!=|>=?|<=?)\s*(.+)$/.exec(condition.trim());
  if (!match) {
    throw new Error(`Invalid condition: ${condition}. Expected format: value op literal`);
  }

  const [, operator, literalRaw] = match;
  const literal = parseLiteral(literalRaw!);

  switch (operator) {
    case '==':
      return value === literal;
    case '!=':
      return value !== literal;
    case '>':
      return (value as number) > (literal as number);
    case '>=':
      return (value as number) >= (literal as number);
    case '<':
      return (value as number) < (literal as number);
    case '<=':
      return (value as number) <= (literal as number);
    default:
      return false;
  }
}

function parseLiteral(raw: string): string | number | boolean | null {
  const trimmed = raw.trim();

  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;

  // Quoted string
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1);
  }

  // Number
  const num = Number(trimmed);
  if (!Number.isNaN(num) && trimmed !== '') {
    return num;
  }

  throw new Error(`Invalid literal: ${raw}`);
}

