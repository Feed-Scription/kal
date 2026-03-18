import { describe, it, expect, vi } from 'vitest';
import { Regex, PostProcess, JSONParse, SubFlow } from '../../../node/builtin/transform-nodes';
import { PromptBuild, Message, GenerateImage, GenerateText, UpdateHistory, CompactHistory } from '../../../node/builtin/llm-nodes';
import { WriteState } from '../../../node/builtin/state-nodes';
import { createMockContext } from '../../helpers/test-utils';

describe('Transform 节点', () => {
  it('Regex 应该匹配正则表达式', async () => {
    const result = await Regex.execute({ text: 'Hello World 123' }, { pattern: '\\d+', flags: 'g' }, createMockContext());
    expect(result.matches).toEqual(['123']);
  });

  it('PostProcess 应该串联处理器', async () => {
    const result = await PostProcess.execute(
      { text: '  HELLO WORLD  ' },
      { processors: [{ type: 'trim' }, { type: 'toLowerCase' }] },
      createMockContext()
    );
    expect(result.text).toBe('hello world');
  });

  it('JSONParse 应该修复并解析损坏的 JSON', async () => {
    const result = await JSONParse.execute({ text: '{"name": "test",}' }, {}, createMockContext());
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ name: 'test' });
  });
});

describe('LLM 节点', () => {
  it('PromptBuild 应该支持 state 绑定并输出 text', async () => {
    const ctx = createMockContext();
    ctx.state.set('player', { type: 'object', value: { name: 'Alice' } });
    const result = await PromptBuild.execute(
      { data: {} },
      {
        fragments: [
          { type: 'base', id: 'intro', content: 'You are an AI' },
          { type: 'field', id: 'name', source: 'state.player.name', template: 'Player: {{items}}' },
        ],
      },
      ctx
    );
    expect(result.text).toContain('You are an AI');
    expect(result.text).toContain('Player: Alice');
    expect(result.messages).toBeUndefined();
  });

  it('Message 应该从 state 读取 history', async () => {
    const ctx = createMockContext();
    ctx.state.set('history', { type: 'array', value: [{ role: 'assistant', content: 'Hi' }] });
    const result = await Message.execute(
      { system: 'sys', user: 'hello' },
      { historyKey: 'history' },
      ctx
    );
    expect(result.messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'assistant', content: 'Hi' },
      { role: 'user', content: 'hello' },
    ]);
  });

  it('GenerateText 应该自动写回 history', async () => {
    const ctx = createMockContext();
    ctx.state.set('history', { type: 'array', value: [] });
    const result = await GenerateText.execute(
      { messages: [{ role: 'user', content: 'hello' }] },
      { historyKey: 'history', historyPolicy: { maxMessages: 2 } },
      ctx
    );
    expect(result.text).toBe('mock');
    expect(ctx.state.get('history')?.value).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'mock' },
    ]);
  });

  it('Message 应该在配置 summaryKey 时插入摘要', async () => {
    const ctx = createMockContext();
    ctx.state.set('history', { type: 'array', value: [{ role: 'assistant', content: 'Hi' }] });
    ctx.state.set('summary', { type: 'string', value: '之前的冒险摘要...' });
    const result = await Message.execute(
      { system: 'sys', user: 'hello' },
      { historyKey: 'history', summaryKey: 'summary' },
      ctx
    );
    expect(result.messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'system', content: '之前的冒险摘要...' },
      { role: 'assistant', content: 'Hi' },
      { role: 'user', content: 'hello' },
    ]);
  });

  it('Message 在 summaryKey 对应值为空时不插入摘要', async () => {
    const ctx = createMockContext();
    ctx.state.set('history', { type: 'array', value: [] });
    ctx.state.set('summary', { type: 'string', value: '' });
    const result = await Message.execute(
      { system: 'sys', user: 'hello' },
      { historyKey: 'history', summaryKey: 'summary' },
      ctx
    );
    expect(result.messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hello' },
    ]);
  });

  it('GenerateText 当 historyKey 为空字符串时应跳过 history 写入', async () => {
    const ctx = createMockContext();
    ctx.state.set('history', { type: 'array', value: [] });
    const result = await GenerateText.execute(
      { messages: [{ role: 'user', content: 'hello' }] },
      { historyKey: '' },
      ctx
    );
    expect(result.text).toBe('mock');
    expect(ctx.state.get('history')?.value).toEqual([]);
  });

  it('GenerateText 应该支持 assistantPath 提取写入 history 的 assistant 内容', async () => {
    const ctx = createMockContext();
    ctx.state.set('history', { type: 'array', value: [] });
    ctx.llm.invoke = vi.fn().mockResolvedValue({
      text: JSON.stringify({ narrative: '你进入了矿井...', stateChanges: { health: 90 } }),
      usage: { totalTokens: 10 },
    });

    const result = await GenerateText.execute(
      { messages: [{ role: 'user', content: '进入矿井' }] },
      { historyKey: 'history', assistantPath: 'narrative' },
      ctx
    );

    expect(result.text).toContain('"narrative"');
    expect(ctx.state.get('history')?.value).toEqual([
      { role: 'user', content: '进入矿井' },
      { role: 'assistant', content: '你进入了矿井...' },
    ]);
  });

  it('GenerateImage 应该返回图像 URL', async () => {
    const result = await GenerateImage.execute(
      { prompt: 'a medieval castle' },
      { model: 'dall-e-3' },
      createMockContext()
    );
    expect(result.imageUrl.url).toContain('dall-e-3');
    expect(result.imageUrl.alt).toBe('a medieval castle');
  });

  it('UpdateHistory 应该写入干净的 user 和 assistant 消息', async () => {
    const ctx = createMockContext();
    ctx.state.set('history', { type: 'array', value: [] });
    const result = await UpdateHistory.execute(
      { userMessage: '我要进入矿井', assistantMessage: '你走向矿井...' },
      { historyKey: 'history' },
      ctx
    );
    expect(result.success).toBe(true);
    expect(ctx.state.get('history')?.value).toEqual([
      { role: 'user', content: '我要进入矿井' },
      { role: 'assistant', content: '你走向矿井...' },
    ]);
  });

  it('UpdateHistory 应该从 JSON 中提取 assistantPath 字段', async () => {
    const ctx = createMockContext();
    ctx.state.set('history', { type: 'array', value: [] });
    const jsonResponse = JSON.stringify({ narrative: '你进入了矿井...', stateChanges: { health: 90 } });
    const result = await UpdateHistory.execute(
      { userMessage: '进入矿井', assistantMessage: jsonResponse },
      { historyKey: 'history', assistantPath: 'narrative' },
      ctx
    );
    expect(result.success).toBe(true);
    expect(ctx.state.get('history')?.value).toEqual([
      { role: 'user', content: '进入矿井' },
      { role: 'assistant', content: '你进入了矿井...' },
    ]);
  });

  it('CompactHistory 应该保存摘要并清空历史', async () => {
    const ctx = createMockContext();
    ctx.state.set('history', { type: 'array', value: [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ] });
    ctx.state.set('summary', { type: 'string', value: '' });
    const result = await CompactHistory.execute(
      { summary: '你在鸦巢镇开始了冒险...' },
      { historyKey: 'history', summaryKey: 'summary' },
      ctx
    );
    expect(result.success).toBe(true);
    expect(ctx.state.get('summary')?.value).toBe('你在鸦巢镇开始了冒险...');
    expect(ctx.state.get('history')?.value).toEqual([]);
  });
});

describe('State 节点', () => {
  it('WriteState 应该通过 key + value 写入单个 state key', async () => {
    const ctx = createMockContext();
    ctx.state.set('score', { type: 'number', value: 1 });
    const result = await WriteState.execute({ key: 'score', value: 2 }, {}, ctx);
    expect(result.success).toBe(true);
    expect(result.applied).toEqual(['score']);
    expect(ctx.state.get('score')).toEqual({ type: 'number', value: 2 });
  });

  it('WriteState 单 key 模式在 key 不存在时应返回 success: false', async () => {
    const ctx = createMockContext();
    const result = await WriteState.execute({ key: 'nonexistent', value: 42 }, {}, ctx);
    expect(result.success).toBe(false);
    expect(result.applied).toEqual([]);
  });

  it('WriteState 应该批量更新已存在的 state key', async () => {
    const ctx = createMockContext();
    ctx.state.set('health', { type: 'number', value: 100 });
    ctx.state.set('location', { type: 'string', value: '广场' });
    ctx.state.set('gold', { type: 'number', value: 50 });

    const result = await WriteState.execute(
      { changes: { health: 80, location: '铁匠铺', gold: 30 } },
      {},
      ctx
    );

    expect(result.success).toBe(true);
    expect(result.applied).toEqual(['health', 'location', 'gold']);
    expect(ctx.state.get('health')).toEqual({ type: 'number', value: 80 });
    expect(ctx.state.get('location')).toEqual({ type: 'string', value: '铁匠铺' });
    expect(ctx.state.get('gold')).toEqual({ type: 'number', value: 30 });
  });

  it('WriteState 应该跳过不存在的 state key', async () => {
    const ctx = createMockContext();
    ctx.state.set('health', { type: 'number', value: 100 });

    const result = await WriteState.execute(
      { changes: { health: 90, unknown: 'foo' } },
      {},
      ctx
    );

    expect(result.success).toBe(true);
    expect(result.applied).toEqual(['health']);
    expect(ctx.state.get('unknown')).toBeUndefined();
  });

  it('WriteState 应该支持 path 配置提取子对象', async () => {
    const ctx = createMockContext();
    ctx.state.set('health', { type: 'number', value: 100 });
    ctx.state.set('location', { type: 'string', value: '广场' });

    const result = await WriteState.execute(
      { changes: { narrative: '你来到了...', stateChanges: { health: 70, location: '矿井' } } },
      { path: 'stateChanges' },
      ctx
    );

    expect(result.success).toBe(true);
    expect(result.applied).toEqual(['health', 'location']);
    expect(ctx.state.get('health')).toEqual({ type: 'number', value: 70 });
  });

  it('WriteState 应该支持 allowedKeys 白名单', async () => {
    const ctx = createMockContext();
    ctx.state.set('health', { type: 'number', value: 100 });
    ctx.state.set('gold', { type: 'number', value: 50 });

    const result = await WriteState.execute(
      { changes: { health: 80, gold: 999 } },
      { allowedKeys: ['health'] },
      ctx
    );

    expect(result.success).toBe(true);
    expect(result.applied).toEqual(['health']);
    expect(ctx.state.get('gold')).toEqual({ type: 'number', value: 50 });
  });

  it('WriteState 在 allowedKeys 为空数组时不应过滤任何 key', async () => {
    const ctx = createMockContext();
    ctx.state.set('health', { type: 'number', value: 100 });
    ctx.state.set('gold', { type: 'number', value: 50 });

    const result = await WriteState.execute(
      { changes: { health: 80, gold: 40 } },
      { allowedKeys: [] },
      ctx
    );

    expect(result.success).toBe(true);
    expect(result.applied).toEqual(['health', 'gold']);
    expect(ctx.state.get('health')).toEqual({ type: 'number', value: 80 });
    expect(ctx.state.get('gold')).toEqual({ type: 'number', value: 40 });
  });

  it('WriteState 应该支持直接使用命名输入批量更新状态', async () => {
    const ctx = createMockContext();
    ctx.state.set('strength', { type: 'number', value: 10 });
    ctx.state.set('dexterity', { type: 'number', value: 10 });
    ctx.state.set('skills', { type: 'array', value: [] });

    const result = await WriteState.execute(
      { strength: 14, dexterity: 12, skills: ['重击'] },
      {},
      ctx
    );

    expect(result.success).toBe(true);
    expect(result.applied).toEqual(['strength', 'dexterity', 'skills']);
    expect(ctx.state.get('strength')).toEqual({ type: 'number', value: 14 });
    expect(ctx.state.get('dexterity')).toEqual({ type: 'number', value: 12 });
    expect(ctx.state.get('skills')).toEqual({ type: 'array', value: ['重击'] });
  });

  it('WriteState 在 changes 无效时应该返回 success: false', async () => {
    const ctx = createMockContext();
    const result = await WriteState.execute({ changes: null }, {}, ctx);
    expect(result.success).toBe(false);
    expect(result.applied).toEqual([]);
  });
});

describe('SubFlow 节点', () => {
  it('应该在缺少 ref 时抛出错误', async () => {
    await expect(SubFlow.execute({}, {}, createMockContext())).rejects.toThrow('SubFlow node must have a "ref" field');
  });

  it('应该透传命名输入输出', async () => {
    const ctx = createMockContext();
    ctx.flow = {
      execute: vi.fn().mockResolvedValue({ answer: '42' }),
    };
    const result = await SubFlow.execute({ question: 'life' }, { ref: 'sub-flow.json' }, ctx);
    expect(ctx.flow.execute).toHaveBeenCalledWith('sub-flow.json', { question: 'life' });
    expect(result).toEqual({ answer: '42' });
  });
});
