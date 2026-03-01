/**
 * FlowLoader - load and validate flow definitions from JSON
 */

import type { FlowDefinition } from '../types/types';
import { ValidationError } from '../types/errors';

/**
 * FlowLoader
 */
export class FlowLoader {
  private loadedFlows: Map<string, FlowDefinition> = new Map();
  private loadingStack: Set<string> = new Set();

  /**
   * Parse a flow from JSON string
   */
  static parse(json: string): FlowDefinition {
    let raw: any;
    try {
      raw = JSON.parse(json);
    } catch {
      throw new ValidationError('Invalid JSON in flow definition');
    }

    return FlowLoader.validate(raw);
  }

  /**
   * Validate a flow definition object
   */
  static validate(raw: any): FlowDefinition {
    if (!raw || typeof raw !== 'object') {
      throw new ValidationError('Flow definition must be an object');
    }

    if (!Array.isArray(raw.nodes)) {
      throw new ValidationError('Flow definition must have a "nodes" array');
    }

    if (!Array.isArray(raw.edges)) {
      throw new ValidationError('Flow definition must have an "edges" array');
    }

    // Validate nodes and build handle maps
    const nodeIds = new Set<string>();
    const nodeHandles = new Map<string, { inputs: Set<string>; outputs: Set<string>; types: Map<string, string> }>();

    for (const node of raw.nodes) {
      if (!node.id || typeof node.id !== 'string') {
        throw new ValidationError('Each node must have a string "id"');
      }
      if (!node.type || typeof node.type !== 'string') {
        throw new ValidationError(`Node "${node.id}" must have a string "type"`);
      }
      if (nodeIds.has(node.id)) {
        throw new ValidationError(`Duplicate node id: "${node.id}"`);
      }
      nodeIds.add(node.id);

      // Validate and collect handles
      if (!Array.isArray(node.inputs)) {
        throw new ValidationError(`Node "${node.id}" must have an "inputs" array`);
      }
      if (!Array.isArray(node.outputs)) {
        throw new ValidationError(`Node "${node.id}" must have an "outputs" array`);
      }

      const inputs = new Set<string>();
      const outputs = new Set<string>();
      const types = new Map<string, string>();

      for (const input of node.inputs) {
        if (!input.name || typeof input.name !== 'string') {
          throw new ValidationError(`Node "${node.id}" has an input without a valid "name"`);
        }
        if (!input.type || typeof input.type !== 'string') {
          throw new ValidationError(`Node "${node.id}" input "${input.name}" must have a "type"`);
        }
        if (inputs.has(input.name)) {
          throw new ValidationError(`Node "${node.id}" has duplicate input handle: "${input.name}"`);
        }
        inputs.add(input.name);
        types.set(`input:${input.name}`, input.type);
      }

      for (const output of node.outputs) {
        if (!output.name || typeof output.name !== 'string') {
          throw new ValidationError(`Node "${node.id}" has an output without a valid "name"`);
        }
        if (!output.type || typeof output.type !== 'string') {
          throw new ValidationError(`Node "${node.id}" output "${output.name}" must have a "type"`);
        }
        if (outputs.has(output.name)) {
          throw new ValidationError(`Node "${node.id}" has duplicate output handle: "${output.name}"`);
        }
        outputs.add(output.name);
        types.set(`output:${output.name}`, output.type);
      }

      nodeHandles.set(node.id, { inputs, outputs, types });
    }

    // Validate edges with handle existence and type compatibility
    for (const edge of raw.edges) {
      if (!nodeIds.has(edge.source)) {
        throw new ValidationError(`Edge references unknown source node: "${edge.source}"`);
      }
      if (!nodeIds.has(edge.target)) {
        throw new ValidationError(`Edge references unknown target node: "${edge.target}"`);
      }

      const sourceHandles = nodeHandles.get(edge.source)!;
      const targetHandles = nodeHandles.get(edge.target)!;

      // Check source handle exists
      if (!edge.sourceHandle || typeof edge.sourceHandle !== 'string') {
        throw new ValidationError(`Edge from "${edge.source}" to "${edge.target}" must have a "sourceHandle"`);
      }
      if (!sourceHandles.outputs.has(edge.sourceHandle)) {
        throw new ValidationError(
          `Edge references non-existent output handle "${edge.sourceHandle}" on node "${edge.source}"`
        );
      }

      // Check target handle exists
      if (!edge.targetHandle || typeof edge.targetHandle !== 'string') {
        throw new ValidationError(`Edge from "${edge.source}" to "${edge.target}" must have a "targetHandle"`);
      }
      if (!targetHandles.inputs.has(edge.targetHandle)) {
        throw new ValidationError(
          `Edge references non-existent input handle "${edge.targetHandle}" on node "${edge.target}"`
        );
      }

      // Check type compatibility
      const sourceType = sourceHandles.types.get(`output:${edge.sourceHandle}`)!;
      const targetType = targetHandles.types.get(`input:${edge.targetHandle}`)!;

      if (!FlowLoader.isTypeCompatible(sourceType, targetType)) {
        throw new ValidationError(
          `Type mismatch: cannot connect "${edge.source}.${edge.sourceHandle}" (${sourceType}) ` +
          `to "${edge.target}.${edge.targetHandle}" (${targetType})`
        );
      }
    }

    return raw as FlowDefinition;
  }

  /**
   * Check if source type is compatible with target type
   */
  private static isTypeCompatible(sourceType: string, targetType: string): boolean {
    // Exact match
    if (sourceType === targetType) return true;

    // 'object' is compatible with any specific object type
    if (targetType === 'object') return true;

    // 'array' is compatible with any specific array type
    if (targetType === 'array' && sourceType.endsWith('[]')) return true;

    // Any type is compatible with 'any'
    if (targetType === 'any') return true;

    return false;
  }

  /**
   * Load a flow by ID, with circular reference detection
   */
  load(flowId: string, resolver: (id: string) => string): FlowDefinition {
    // Check cache
    const cached = this.loadedFlows.get(flowId);
    if (cached) return cached;

    // Check circular reference
    if (this.loadingStack.has(flowId)) {
      const chain = [...this.loadingStack, flowId].join(' -> ');
      throw new ValidationError(`Circular flow reference detected: ${chain}`);
    }

    this.loadingStack.add(flowId);

    try {
      const json = resolver(flowId);
      const flow = FlowLoader.parse(json);

      // Recursively load sub-flows
      for (const node of flow.nodes) {
        if (node.type === 'SubFlow') {
          // Prefer node.ref over config.ref (V4 contract)
          const subFlowRef = node.ref ?? node.config?.ref;
          if (subFlowRef) {
            this.load(subFlowRef, resolver);
          }
        }
      }

      this.loadedFlows.set(flowId, flow);
      return flow;
    } finally {
      this.loadingStack.delete(flowId);
    }
  }

  /**
   * Get a loaded flow
   */
  get(flowId: string): FlowDefinition | undefined {
    return this.loadedFlows.get(flowId);
  }

  /**
   * Clear loaded flows cache
   */
  clear(): void {
    this.loadedFlows.clear();
  }
}
