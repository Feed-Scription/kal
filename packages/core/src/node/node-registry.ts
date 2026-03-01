/**
 * Node Registry - manages node type registration and lookup
 */

import type { NodeManifest, CustomNode } from '../types/node';

/**
 * Node Registry
 */
export class NodeRegistry {
  private nodes: Map<string, CustomNode> = new Map();

  /**
   * Register a node type
   */
  register(node: CustomNode): void {
    if (this.nodes.has(node.type)) {
      throw new Error(`Node type "${node.type}" is already registered`);
    }
    this.nodes.set(node.type, node);
  }

  /**
   * Get a registered node by type
   */
  get(type: string): CustomNode | undefined {
    return this.nodes.get(type);
  }

  /**
   * Check if a node type is registered
   */
  has(type: string): boolean {
    return this.nodes.has(type);
  }

  /**
   * Get all registered node types
   */
  getAll(): CustomNode[] {
    return [...this.nodes.values()];
  }

  /**
   * Export all nodes as manifests (for UI)
   */
  exportManifests(): NodeManifest[] {
    return this.getAll().map((node) => ({
      type: node.type,
      label: node.label,
      inputs: node.inputs,
      outputs: node.outputs,
    }));
  }

  /**
   * Unregister a node type
   */
  unregister(type: string): boolean {
    return this.nodes.delete(type);
  }

  /**
   * Clear all registered nodes
   */
  clear(): void {
    this.nodes.clear();
  }
}
