/**
 * Node Executor - executes a node with resolved inputs
 */

import type { NodeDefinition, NodeContext } from '../types/node';
import { ExecutionError } from '../types/errors';
import type { NodeRegistry } from './node-registry';

/**
 * Resolve input values: connected values override defaults
 */
export function resolveInputs(
  nodeDef: NodeDefinition,
  connectedValues: Record<string, any>
): Record<string, any> {
  const resolved: Record<string, any> = {};

  for (const input of nodeDef.inputs) {
    if (input.name in connectedValues) {
      resolved[input.name] = connectedValues[input.name];
    } else if (input.defaultValue !== undefined) {
      resolved[input.name] = input.defaultValue;
    } else if (input.required) {
      throw new ExecutionError(
        `Missing required input "${input.name}" for node "${nodeDef.id}" (${nodeDef.type})`
      );
    }
  }

  return resolved;
}

/**
 * Validate node outputs against declared outputs
 */
function validateOutputs(
  nodeDef: NodeDefinition,
  outputs: Record<string, any>
): void {
  const declaredOutputs = new Set(nodeDef.outputs.map(o => o.name));
  const actualOutputs = new Set(Object.keys(outputs));

  // Check for missing outputs
  for (const declared of declaredOutputs) {
    if (!actualOutputs.has(declared)) {
      throw new ExecutionError(
        `Node "${nodeDef.id}" (${nodeDef.type}) missing declared output: "${declared}"`
      );
    }
  }

  // Check for extra outputs
  for (const actual of actualOutputs) {
    if (!declaredOutputs.has(actual)) {
      throw new ExecutionError(
        `Node "${nodeDef.id}" (${nodeDef.type}) returned undeclared output: "${actual}"`
      );
    }
  }
}

/**
 * Execute a node
 */
export async function executeNode(
  nodeDef: NodeDefinition,
  connectedValues: Record<string, any>,
  registry: NodeRegistry,
  context: NodeContext
): Promise<Record<string, any>> {
  const nodeImpl = registry.get(nodeDef.type);
  if (!nodeImpl) {
    throw new ExecutionError(`Unknown node type: "${nodeDef.type}"`);
  }

  const inputs = resolveInputs(nodeDef, connectedValues);
  const config = nodeDef.config ?? {};

  try {
    const outputs = await nodeImpl.execute(inputs, config, context);

    // Validate outputs against declared outputs
    validateOutputs(nodeDef, outputs);

    return outputs;
  } catch (error) {
    if (error instanceof ExecutionError) throw error;
    throw new ExecutionError(
      `Node "${nodeDef.id}" (${nodeDef.type}) execution failed: ${(error as Error).message}`,
      { nodeId: nodeDef.id, nodeType: nodeDef.type, originalError: error }
    );
  }
}
