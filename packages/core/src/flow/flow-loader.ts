/**
 * FlowLoader - load and validate flow definitions from JSON
 */

import type { FlowDefinition, HandleDefinition, NodeDefinition } from '../types/types';
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

    if (!raw.meta || typeof raw.meta !== 'object' || Array.isArray(raw.meta)) {
      throw new ValidationError('Flow definition must have a "meta" object');
    }

    if (!raw.data || typeof raw.data !== 'object' || Array.isArray(raw.data)) {
      throw new ValidationError('Flow definition must have a "data" object');
    }

    if (!raw.meta.schemaVersion || typeof raw.meta.schemaVersion !== 'string') {
      throw new ValidationError('Flow definition meta must have a string "schemaVersion"');
    }

    if (raw.meta.inputs !== undefined && !Array.isArray(raw.meta.inputs)) {
      throw new ValidationError('Flow definition meta "inputs" must be an array');
    }

    if (raw.meta.outputs !== undefined && !Array.isArray(raw.meta.outputs)) {
      throw new ValidationError('Flow definition meta "outputs" must be an array');
    }

    FlowLoader.validateFlowHandles(raw.meta.inputs ?? [], 'input');
    FlowLoader.validateFlowHandles(raw.meta.outputs ?? [], 'output');

    if (!Array.isArray(raw.data.nodes)) {
      throw new ValidationError('Flow definition data must have a "nodes" array');
    }

    if (!Array.isArray(raw.data.edges)) {
      throw new ValidationError('Flow definition data must have an "edges" array');
    }

    const nodeIds = new Set<string>();
    const nodeHandles = new Map<string, { inputs: Set<string>; outputs: Set<string>; types: Map<string, string> }>();

    for (const node of raw.data.nodes) {
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

    for (const edge of raw.data.edges) {
      if (!nodeIds.has(edge.source)) {
        throw new ValidationError(`Edge references unknown source node: "${edge.source}"`);
      }
      if (!nodeIds.has(edge.target)) {
        throw new ValidationError(`Edge references unknown target node: "${edge.target}"`);
      }

      const sourceHandles = nodeHandles.get(edge.source)!;
      const targetHandles = nodeHandles.get(edge.target)!;

      if (!edge.sourceHandle || typeof edge.sourceHandle !== 'string') {
        throw new ValidationError(`Edge from "${edge.source}" to "${edge.target}" must have a "sourceHandle"`);
      }
      if (!sourceHandles.outputs.has(edge.sourceHandle)) {
        throw new ValidationError(
          `Edge references non-existent output handle "${edge.sourceHandle}" on node "${edge.source}"`
        );
      }

      if (!edge.targetHandle || typeof edge.targetHandle !== 'string') {
        throw new ValidationError(`Edge from "${edge.source}" to "${edge.target}" must have a "targetHandle"`);
      }
      if (!targetHandles.inputs.has(edge.targetHandle)) {
        throw new ValidationError(
          `Edge references non-existent input handle "${edge.targetHandle}" on node "${edge.target}"`
        );
      }

      const sourceType = sourceHandles.types.get(`output:${edge.sourceHandle}`)!;
      const targetType = targetHandles.types.get(`input:${edge.targetHandle}`)!;

      if (!FlowLoader.isTypeCompatible(sourceType, targetType)) {
        throw new ValidationError(
          `Type mismatch: cannot connect "${edge.source}.${edge.sourceHandle}" (${sourceType}) ` +
          `to "${edge.target}.${edge.targetHandle}" (${targetType})`
        );
      }
    }

    FlowLoader.validateSignalContracts(raw);

    return raw as FlowDefinition;
  }

  /**
   * Check if source type is compatible with target type
   */
  private static isTypeCompatible(sourceType: string, targetType: string): boolean {
    if (sourceType === targetType) return true;
    if (sourceType === 'any') return true;
    if (targetType === 'any') return true;
    if (targetType === 'object' && (sourceType === 'object' || sourceType === 'any')) return true;
    if (targetType === 'array' && sourceType.endsWith('[]')) return true;
    return false;
  }

  private static validateFlowHandles(handles: any[], kind: 'input' | 'output'): void {
    const names = new Set<string>();
    for (const handle of handles) {
      if (!handle || typeof handle !== 'object') {
        throw new ValidationError(`Flow ${kind} handle must be an object`);
      }
      if (!handle.name || typeof handle.name !== 'string') {
        throw new ValidationError(`Flow ${kind} handle must have a string "name"`);
      }
      if (!handle.type || typeof handle.type !== 'string') {
        throw new ValidationError(`Flow ${kind} handle "${handle.name}" must have a string "type"`);
      }
      if (names.has(handle.name)) {
        throw new ValidationError(`Duplicate flow ${kind} handle: "${handle.name}"`);
      }
      names.add(handle.name);
    }
  }

  private static validateSignalContracts(raw: any): void {
    const metaInputs = new Map<string, HandleDefinition>(
      (raw.meta.inputs ?? []).map((handle: HandleDefinition): [string, HandleDefinition] => [handle.name, handle])
    );
    const metaOutputs = new Map<string, HandleDefinition>(
      (raw.meta.outputs ?? []).map((handle: HandleDefinition): [string, HandleDefinition] => [handle.name, handle])
    );
    const seenInputChannels = new Set<string>();
    const seenOutputChannels = new Set<string>();

    for (const node of raw.data.nodes) {
      if (node.type === 'SignalIn') {
        const channel = node.config?.channel;
        if (!channel || typeof channel !== 'string') {
          throw new ValidationError(`SignalIn node "${node.id}" must have config.channel`);
        }
        const contract = metaInputs.get(channel);
        if (!contract) {
          throw new ValidationError(`SignalIn node "${node.id}" references undeclared input channel "${channel}"`);
        }
        FlowLoader.validateSignalInNode(node, contract.type);
        seenInputChannels.add(channel);
      }

      if (node.type === 'SignalOut') {
        const channel = node.config?.channel;
        if (!channel || typeof channel !== 'string') {
          throw new ValidationError(`SignalOut node "${node.id}" must have config.channel`);
        }
        const contract = metaOutputs.get(channel);
        if (!contract) {
          throw new ValidationError(`SignalOut node "${node.id}" references undeclared output channel "${channel}"`);
        }
        if (seenOutputChannels.has(channel)) {
          throw new ValidationError(`Duplicate SignalOut channel "${channel}"`);
        }
        FlowLoader.validateSignalOutNode(node, contract.type);
        seenOutputChannels.add(channel);
      }
    }

    for (const channel of metaInputs.keys() as IterableIterator<string>) {
      if (!seenInputChannels.has(channel)) {
        throw new ValidationError(`Flow input channel "${channel}" is declared but has no SignalIn node`);
      }
    }

    for (const channel of metaOutputs.keys() as IterableIterator<string>) {
      if (!seenOutputChannels.has(channel)) {
        throw new ValidationError(`Flow output channel "${channel}" is declared but has no SignalOut node`);
      }
    }
  }

  private static validateSignalInNode(node: NodeDefinition, channelType: string): void {
    if (node.inputs.length !== 0) {
      throw new ValidationError(`SignalIn node "${node.id}" must not declare inputs`);
    }
    if (node.outputs.length !== 1 || node.outputs[0]?.name !== 'data') {
      throw new ValidationError(`SignalIn node "${node.id}" must declare exactly one "data" output`);
    }
    if (node.outputs[0].type !== channelType) {
      throw new ValidationError(`SignalIn node "${node.id}" output type must match channel type "${channelType}"`);
    }
  }

  private static validateSignalOutNode(node: NodeDefinition, channelType: string): void {
    if (node.inputs.length !== 1 || node.inputs[0]?.name !== 'data') {
      throw new ValidationError(`SignalOut node "${node.id}" must declare exactly one "data" input`);
    }
    if (node.inputs[0].type !== channelType) {
      throw new ValidationError(`SignalOut node "${node.id}" input type must match channel type "${channelType}"`);
    }
    if (node.outputs.length !== 1 || node.outputs[0]?.name !== 'data') {
      throw new ValidationError(`SignalOut node "${node.id}" must declare exactly one "data" output`);
    }
    if (node.outputs[0].type !== channelType) {
      throw new ValidationError(`SignalOut node "${node.id}" output type must match channel type "${channelType}"`);
    }
  }

  private static validateSubFlowContract(node: NodeDefinition, subFlow: FlowDefinition): void {
    FlowLoader.validateHandleListEquality(
      node.inputs,
      subFlow.meta.inputs ?? [],
      `SubFlow node "${node.id}" inputs must match sub-flow "${node.ref ?? node.config?.ref}" inputs`
    );
    FlowLoader.validateHandleListEquality(
      node.outputs,
      subFlow.meta.outputs ?? [],
      `SubFlow node "${node.id}" outputs must match sub-flow "${node.ref ?? node.config?.ref}" outputs`
    );
  }

  private static validateHandleListEquality(
    actual: HandleDefinition[],
    expected: HandleDefinition[],
    message: string
  ): void {
    if (actual.length !== expected.length) {
      throw new ValidationError(message);
    }

    for (let index = 0; index < actual.length; index++) {
      const current = actual[index];
      const target = expected[index];
      if (
        current?.name !== target?.name ||
        current?.type !== target?.type ||
        Boolean(current?.required) !== Boolean(target?.required) ||
        current?.defaultValue !== target?.defaultValue
      ) {
        throw new ValidationError(message);
      }
    }
  }

  /**
   * Load a flow by ID, with circular reference detection
   */
  load(flowId: string, resolver: (id: string) => string): FlowDefinition {
    const cached = this.loadedFlows.get(flowId);
    if (cached) return cached;

    if (this.loadingStack.has(flowId)) {
      const chain = [...this.loadingStack, flowId].join(' -> ');
      throw new ValidationError(`Circular flow reference detected: ${chain}`);
    }

    this.loadingStack.add(flowId);

    try {
      const json = resolver(flowId);
      const flow = FlowLoader.parse(json);

      for (const node of flow.data.nodes) {
        if (node.type === 'SubFlow') {
          const subFlowRef = node.ref ?? node.config?.ref;
          if (subFlowRef) {
            const subFlow = this.load(subFlowRef, resolver);
            FlowLoader.validateSubFlowContract(node, subFlow);
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
