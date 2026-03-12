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
  const declaredOutputs = new Set(nodeDef.outputs.map((output) => output.name));
  const actualOutputs = new Set(Object.keys(outputs));

  // Check that all declared outputs are present
  for (const declared of declaredOutputs) {
    if (!actualOutputs.has(declared)) {
      throw new ExecutionError(
        `Node "${nodeDef.id}" (${nodeDef.type}) missing declared output: "${declared}"`
      );
    }
  }

  // Allow extra outputs (for dynamic nodes like ReadState with config.keys)
  // Only warn about undeclared outputs, don't throw
  for (const actual of actualOutputs) {
    if (!declaredOutputs.has(actual)) {
      // Silently allow extra outputs - this supports dynamic output patterns
      // like ReadState with config.keys returning multiple state values
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
  const config = {
    ...(nodeDef.config ?? {}),
    ...(nodeDef.ref ? { ref: nodeDef.ref } : {}),
  };

  try {
    const outputs = await nodeImpl.execute(inputs, config, context);
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
