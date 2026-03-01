/**
 * Custom Node Loader - scan and load custom nodes from directory
 */

import type { CustomNode } from '../types/node';
import type { NodeRegistry } from './node-registry';

/**
 * Custom node loader
 */
export class CustomNodeLoader {
  /**
   * Load custom nodes from a directory
   * In a real implementation, this would scan the filesystem
   * For now, it's a placeholder that accepts pre-loaded modules
   */
  static async loadFromModules(
    modules: Record<string, any>,
    registry: NodeRegistry
  ): Promise<void> {
    for (const [path, module] of Object.entries(modules)) {
      const node = module.default || module;

      if (!this.isValidCustomNode(node)) {
        console.warn(`Invalid custom node at ${path}, skipping`);
        continue;
      }

      try {
        registry.register(node);
        console.log(`Registered custom node: ${node.type}`);
      } catch (error) {
        console.error(`Failed to register node from ${path}:`, error);
      }
    }
  }

  /**
   * Validate a custom node
   */
  private static isValidCustomNode(node: any): node is CustomNode {
    return (
      node &&
      typeof node === 'object' &&
      typeof node.type === 'string' &&
      typeof node.label === 'string' &&
      Array.isArray(node.inputs) &&
      Array.isArray(node.outputs) &&
      typeof node.execute === 'function'
    );
  }
}
