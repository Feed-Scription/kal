import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HookManager } from '../../hook-manager';
import type { FlowStartEvent, NodeEndEvent } from '../../types/hooks';

describe('HookManager', () => {
  let hookManager: HookManager;

  beforeEach(() => {
    hookManager = new HookManager();
  });

  it('应该能注册和触发 hook', async () => {
    const listener = vi.fn();
    hookManager.on('onFlowStart', listener);

    const event: FlowStartEvent = {
      executionId: 'exec-1',
      flowId: 'flow-1',
      timestamp: Date.now(),
    };

    await hookManager.emit('onFlowStart', event);
    expect(listener).toHaveBeenCalledWith(event);
  });

  it('应该支持多个监听器', async () => {
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    hookManager.on('onFlowStart', listener1);
    hookManager.on('onFlowStart', listener2);

    const event: FlowStartEvent = {
      executionId: 'exec-1',
      flowId: 'flow-1',
      timestamp: Date.now(),
    };

    await hookManager.emit('onFlowStart', event);
    expect(listener1).toHaveBeenCalledOnce();
    expect(listener2).toHaveBeenCalledOnce();
  });

  it('应该能移除监听器', async () => {
    const listener = vi.fn();
    hookManager.on('onFlowStart', listener);
    hookManager.off('onFlowStart', listener);

    await hookManager.emit('onFlowStart', {
      executionId: 'exec-1',
      flowId: 'flow-1',
      timestamp: Date.now(),
    });

    expect(listener).not.toHaveBeenCalled();
  });

  it('应该支持异步监听器', async () => {
    const order: number[] = [];
    hookManager.on('onNodeEnd', async () => {
      await new Promise((r) => setTimeout(r, 10));
      order.push(1);
    });
    hookManager.on('onNodeEnd', async () => {
      order.push(2);
    });

    await hookManager.emit('onNodeEnd', {
      executionId: 'exec-1',
      nodeId: 'node-1',
      nodeType: 'test',
      outputs: {},
      durationMs: 100,
      timestamp: Date.now(),
    } as NodeEndEvent);

    expect(order).toEqual([1, 2]);
  });

  it('应该能批量注册 hooks', async () => {
    const onFlowStart = vi.fn();
    const onNodeEnd = vi.fn();

    hookManager.registerAll({ onFlowStart, onNodeEnd });

    await hookManager.emit('onFlowStart', {
      executionId: 'exec-1',
      flowId: 'flow-1',
      timestamp: Date.now(),
    });

    await hookManager.emit('onNodeEnd', {
      executionId: 'exec-1',
      nodeId: 'node-1',
      nodeType: 'test',
      outputs: {},
      durationMs: 100,
      timestamp: Date.now(),
    });

    expect(onFlowStart).toHaveBeenCalledOnce();
    expect(onNodeEnd).toHaveBeenCalledOnce();
  });

  it('应该能清空所有 hooks', async () => {
    const listener = vi.fn();
    hookManager.on('onFlowStart', listener);
    hookManager.clear();

    await hookManager.emit('onFlowStart', {
      executionId: 'exec-1',
      flowId: 'flow-1',
      timestamp: Date.now(),
    });

    expect(listener).not.toHaveBeenCalled();
  });

  it('对未注册的 hook 触发不应报错', async () => {
    await expect(
      hookManager.emit('onFlowStart', {
        executionId: 'exec-1',
        flowId: 'flow-1',
        timestamp: Date.now(),
      })
    ).resolves.toBeUndefined();
  });

  it('Hook 监听器异常不应中断主流程', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const listener1 = vi.fn().mockRejectedValue(new Error('Hook 1 failed'));
    const listener2 = vi.fn();
    const listener3 = vi.fn().mockRejectedValue(new Error('Hook 3 failed'));

    hookManager.on('onFlowStart', listener1);
    hookManager.on('onFlowStart', listener2);
    hookManager.on('onFlowStart', listener3);

    const event: FlowStartEvent = {
      executionId: 'exec-1',
      flowId: 'flow-1',
      timestamp: Date.now(),
    };

    // 应该不抛出异常
    await expect(hookManager.emit('onFlowStart', event)).resolves.toBeUndefined();

    // 所有监听器都应该被调用
    expect(listener1).toHaveBeenCalledWith(event);
    expect(listener2).toHaveBeenCalledWith(event);
    expect(listener3).toHaveBeenCalledWith(event);

    // 错误应该被记录
    expect(consoleErrorSpy).toHaveBeenCalledTimes(4); // 2 errors * 2 logs each

    consoleErrorSpy.mockRestore();
  });

  it('同步 Hook 异常也应该被隔离', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const listener1 = vi.fn(() => {
      throw new Error('Sync error');
    });
    const listener2 = vi.fn();

    hookManager.on('onFlowStart', listener1);
    hookManager.on('onFlowStart', listener2);

    await expect(
      hookManager.emit('onFlowStart', {
        executionId: 'exec-1',
        flowId: 'flow-1',
        timestamp: Date.now(),
      })
    ).resolves.toBeUndefined();

    expect(listener1).toHaveBeenCalledOnce();
    expect(listener2).toHaveBeenCalledOnce();
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});
