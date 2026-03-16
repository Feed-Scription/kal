/**
 * Tests for Phase 1 improvements:
 * - B1: Constant node
 * - B2: WriteState append/appendMany operations
 * - B3: WriteState value clamping
 * - B4: GenerateText JSON Schema support
 * - B5: State schema constraints
 * - A2: Session validation enhancement
 */

import { describe, it, expect, vi } from 'vitest';
import { Constant } from '../../../node/builtin/utility-nodes';
import { WriteState } from '../../../node/builtin/state-nodes';
import { GenerateText } from '../../../node/builtin/llm-nodes';
import { createMockContext } from '../../helpers/test-utils';

describe('Constant 节点', () => {
  it('应该输出字符串常量', async () => {
    const result = await Constant.execute({}, { value: 'hello', type: 'string' }, createMockContext());
    expect(result.value).toBe('hello');
  });

  it('应该输出数字常量', async () => {
    const result = await Constant.execute({}, { value: 42, type: 'number' }, createMockContext());
    expect(result.value).toBe(42);
  });

  it('应该输出布尔常量', async () => {
    const result = await Constant.execute({}, { value: true, type: 'boolean' }, createMockContext());
    expect(result.value).toBe(true);
  });

  it('应该输出对象常量', async () => {
    const obj = { phase: 'night_done', day: 5 };
    const result = await Constant.execute({}, { value: obj, type: 'object' }, createMockContext());
    expect(result.value).toEqual(obj);
  });

  it('应该输出数组常量', async () => {
    const arr = [1, 2, 3];
    const result = await Constant.execute({}, { value: arr, type: 'array' }, createMockContext());
    expect(result.value).toEqual(arr);
  });
});

describe('WriteState operations', () => {
  it('应该支持 append 操作', async () => {
    const ctx = createMockContext();
    ctx.state.set('cards', { type: 'array', value: ['card1'] });

    const result = await WriteState.execute(
      { changes: { cards: 'card2' } },
      { operations: { cards: 'append' } },
      ctx
    );

    expect(result.success).toBe(true);
    expect(result.applied).toEqual(['cards']);
    expect(ctx.state.get('cards')?.value).toEqual(['card1', 'card2']);
  });

  it('应该支持 appendMany 操作', async () => {
    const ctx = createMockContext();
    ctx.state.set('cards', { type: 'array', value: ['card1'] });

    const result = await WriteState.execute(
      { changes: { cards: ['card2', 'card3'] } },
      { operations: { cards: 'appendMany' } },
      ctx
    );

    expect(result.success).toBe(true);
    expect(result.applied).toEqual(['cards']);
    expect(ctx.state.get('cards')?.value).toEqual(['card1', 'card2', 'card3']);
  });

  it('appendMany 非数组值应该报错', async () => {
    const ctx = createMockContext();
    ctx.state.set('cards', { type: 'array', value: [] });

    const result = await WriteState.execute(
      { changes: { cards: 'not-array' } },
      { operations: { cards: 'appendMany' } },
      ctx
    );

    expect(result.success).toBe(true);
    expect(result.applied).toEqual([]);
    expect(ctx.logger.error).toHaveBeenCalled();
  });

  it('默认操作应该是 set（向后兼容）', async () => {
    const ctx = createMockContext();
    ctx.state.set('health', { type: 'number', value: 100 });

    const result = await WriteState.execute(
      { changes: { health: 80 } },
      { operations: {} },
      ctx
    );

    expect(result.success).toBe(true);
    expect(ctx.state.get('health')?.value).toBe(80);
  });
});

describe('WriteState clamping', () => {
  it('应该将数值 clamp 到 min', async () => {
    const ctx = createMockContext();
    ctx.state.set('mood', { type: 'number', value: 50 });

    const result = await WriteState.execute(
      { changes: { mood: -5 } },
      { constraints: { mood: { min: 0, max: 100 } } },
      ctx
    );

    expect(result.success).toBe(true);
    expect(ctx.state.get('mood')?.value).toBe(0);
    expect(ctx.logger.warn).toHaveBeenCalled();
  });

  it('应该将数值 clamp 到 max', async () => {
    const ctx = createMockContext();
    ctx.state.set('mood', { type: 'number', value: 50 });

    const result = await WriteState.execute(
      { changes: { mood: 150 } },
      { constraints: { mood: { min: 0, max: 100 } } },
      ctx
    );

    expect(result.success).toBe(true);
    expect(ctx.state.get('mood')?.value).toBe(100);
    expect(ctx.logger.warn).toHaveBeenCalled();
  });

  it('合法值不应被 clamp', async () => {
    const ctx = createMockContext();
    ctx.state.set('mood', { type: 'number', value: 50 });

    const result = await WriteState.execute(
      { changes: { mood: 75 } },
      { constraints: { mood: { min: 0, max: 100 } } },
      ctx
    );

    expect(result.success).toBe(true);
    expect(ctx.state.get('mood')?.value).toBe(75);
  });

  it('没有 constraints 时不应 clamp', async () => {
    const ctx = createMockContext();
    ctx.state.set('mood', { type: 'number', value: 50 });

    const result = await WriteState.execute(
      { changes: { mood: -5 } },
      {},
      ctx
    );

    expect(result.success).toBe(true);
    expect(ctx.state.get('mood')?.value).toBe(-5);
  });
});

describe('GenerateText JSON Schema', () => {
  it('应该将 responseFormat 和 jsonSchema 传递给 LLM', async () => {
    const ctx = createMockContext();
    ctx.state.set('history', { type: 'array', value: [] });

    const schema = {
      type: 'object',
      properties: {
        narrative: { type: 'string' },
        stateChanges: { type: 'object' },
      },
      required: ['narrative', 'stateChanges'],
    };

    await GenerateText.execute(
      { messages: [{ role: 'user', content: 'hello' }] },
      { historyKey: 'history', responseFormat: 'json', jsonSchema: schema },
      ctx
    );

    expect(ctx.llm.invoke).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        responseFormat: 'json',
        jsonSchema: schema,
      })
    );
  });

  it('不设置 responseFormat 时不应传递', async () => {
    const ctx = createMockContext();
    ctx.state.set('history', { type: 'array', value: [] });

    await GenerateText.execute(
      { messages: [{ role: 'user', content: 'hello' }] },
      { historyKey: 'history' },
      ctx
    );

    expect(ctx.llm.invoke).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        responseFormat: undefined,
        jsonSchema: undefined,
      })
    );
  });
});
