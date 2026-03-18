/**
 * Custom Node Loader - scan and load custom nodes from directory
 */

import { build } from 'esbuild';
import { readdir } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import type { CustomNode } from '../types/node';
import type { NodeRegistry } from './node-registry';

/**
 * Custom node loader
 */
export class CustomNodeLoader {
  private static readonly SUPPORTED_EXTENSIONS = new Set([
    '.ts',
    '.tsx',
    '.mts',
    '.cts',
    '.js',
    '.mjs',
    '.cjs',
  ]);

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
      } catch (error) {
        console.error(`Failed to register node from ${path}:`, error);
      }
    }
  }

  static async loadFromDirectory(
    directory: string,
    registry: NodeRegistry
  ): Promise<void> {
    const modules: Record<string, any> = {};

    for (const file of await this.scanDirectory(directory)) {
      const loaded = await this.loadModuleFromFile(file);
      if (loaded !== undefined) {
        modules[file] = loaded;
      }
    }

    await this.loadFromModules(modules, registry);
  }

  static async loadFromProject(
    projectRoot: string,
    registry: NodeRegistry,
    options: { subdir?: string } = {}
  ): Promise<void> {
    await this.loadFromDirectory(join(projectRoot, options.subdir ?? 'node'), registry);
  }

  private static async scanDirectory(directory: string): Promise<string[]> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        return [];
      }
      throw error;
    }

    const files: string[] = [];
    for (const entry of entries) {
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        files.push(...await this.scanDirectory(fullPath));
        continue;
      }
      if (entry.isFile() && this.SUPPORTED_EXTENSIONS.has(extname(entry.name))) {
        files.push(fullPath);
      }
    }

    return files;
  }

  private static async loadModuleFromFile(filePath: string): Promise<any> {
    const result = await build({
      entryPoints: [resolve(filePath)],
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: 'es2022',
      write: false,
      logLevel: 'silent',
    });

    const output = result.outputFiles[0];
    if (!output) {
      return undefined;
    }

    const encoded = Buffer.from(output.text).toString('base64');
    const loaded = await import(`data:text/javascript;base64,${encoded}`);
    return loaded.default ?? loaded;
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
