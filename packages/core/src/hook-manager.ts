/**
 * Hook manager for engine lifecycle events
 */

import type { EngineHooks } from './types/hooks';

type HookName = keyof EngineHooks;

export class HookManager {
  private hooks: Map<HookName, Array<(...args: any[]) => void | Promise<void>>> = new Map();

  on<K extends HookName>(hookName: K, listener: NonNullable<EngineHooks[K]>): void {
    const listeners = this.hooks.get(hookName) ?? [];
    listeners.push(listener as any);
    this.hooks.set(hookName, listeners);
  }

  off<K extends HookName>(hookName: K, listener: NonNullable<EngineHooks[K]>): void {
    const listeners = this.hooks.get(hookName);
    if (!listeners) return;
    const index = listeners.indexOf(listener as any);
    if (index !== -1) listeners.splice(index, 1);
  }

  async emit<K extends HookName>(
    hookName: K,
    event: Parameters<NonNullable<EngineHooks[K]>>[0]
  ): Promise<void> {
    const listeners = this.hooks.get(hookName);
    if (!listeners) return;
    const snapshot = [...listeners];
    for (const listener of snapshot) {
      try {
        await listener(event);
      } catch (error) {
        console.error(`Hook "${hookName}" listener failed:`, error);
        console.error('Event:', event);
      }
    }
  }

  registerAll(hooks: Partial<EngineHooks>): void {
    for (const [name, listener] of Object.entries(hooks)) {
      if (listener) this.on(name as HookName, listener as any);
    }
  }

  clear(): void {
    this.hooks.clear();
  }
}
