import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Regex, PostProcess, JSONParse, SubFlow } from '../../../node/builtin/transform-nodes';
import { PromptBuild, GenerateImage } from '../../../node/builtin/llm-nodes';
import { AddState, RemoveState, ModifyState } from '../../../node/builtin/state-nodes';
import type { NodeContext } from '../../../types/node';

function createMockContext(): NodeContext {
  const stateMap = new Map<string, any>();
  return {
    state: {
      get: (key: string) => stateMap.get(key),
      set: (key: string, value: any) => { stateMap.set(key, value); },
      delete: (key: string) => { stateMap.delete(key); },
    },
    llm: {
      invoke: vi.fn().mockResolvedValue({
        text: 'mock',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      }),
    },
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    executionId: 'exec-1',
    nodeId: 'node-1',
  };
}

describe('Regex 节点', () => {
  it('应该匹配正则表达式', async () => {
    const result = await Regex.execute(
      { text: 'Hello World 123' },
      { pattern: '\\d+', flags: 'g' },
      createMockContext()
    );
    expect(result.matches).toEqual(['123']);
  });

  it('应该返回捕获组', async () => {
    const result = await Regex.execute(
      { text: 'name: Alice, age: 25' },
      { pattern: 'name: (?<name>\\w+)', flags: '' },
      createMockContext()
    );
    expect(result.groups).toEqual({ name: 'Alice' });
  });

  it('无匹配时应该返回空数组', async () => {
    const result = await Regex.execute(
      { text: 'no numbers here' },
      { pattern: '\\d+', flags: '' },
      createMockContext()
    );
    expect(result.matches).toEqual([]);
  });
});

describe('PostProcess 节点', () => {
  it('应该执行 trim', async () => {
    const result = await PostProcess.execute(
      { text: '  hello  ' },
      { processors: [{ type: 'trim' }] },
      createMockContext()
    );
    expect(result.text).toBe('hello');
  });

  it('应该执行 replace', async () => {
    const result = await PostProcess.execute(
      { text: 'hello world' },
      { processors: [{ type: 'replace', pattern: 'world', replacement: 'KAL' }] },
      createMockContext()
    );
    expect(result.text).toBe('hello KAL');
  });

  it('应该执行 toLowerCase', async () => {
    const result = await PostProcess.execute(
      { text: 'HELLO' },
      { processors: [{ type: 'toLowerCase' }] },
      createMockContext()
    );
    expect(result.text).toBe('hello');
  });

  it('应该执行 toUpperCase', async () => {
    const result = await PostProcess.execute(
      { text: 'hello' },
      { processors: [{ type: 'toUpperCase' }] },
      createMockContext()
    );
    expect(result.text).toBe('HELLO');
  });

  it('应该执行 slice', async () => {
    const result = await PostProcess.execute(
      { text: 'hello world' },
      { processors: [{ type: 'slice', start: 0, end: 5 }] },
      createMockContext()
    );
    expect(result.text).toBe('hello');
  });

  it('应该串联多个处理器', async () => {
    const result = await PostProcess.execute(
      { text: '  HELLO WORLD  ' },
      { processors: [{ type: 'trim' }, { type: 'toLowerCase' }] },
      createMockContext()
    );
    expect(result.text).toBe('hello world');
  });
});

describe('JSONParse 节点', () => {
  it('应该解析有效 JSON', async () => {
    const result = await JSONParse.execute(
      { text: '{"name": "test"}' },
      {},
      createMockContext()
    );
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ name: 'test' });
  });

  it('应该修复并解析损坏的 JSON', async () => {
    const result = await JSONParse.execute(
      { text: '{"name": "test",}' },
      {},
      createMockContext()
    );
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ name: 'test' });
  });

  it('完全无效时应该返回失败', async () => {
    const result = await JSONParse.execute(
      { text: 'not json at all' },
      {},
      createMockContext()
    );
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

describe('PromptBuild 节点', () => {
  it('应该构建 prompt 文本', async () => {
    const result = await PromptBuild.execute(
      { data: { playerName: 'Alice' } },
      {
        fragments: [
          { type: 'base', id: 'intro', content: 'You are an AI' },
          { type: 'field', id: 'name', source: 'playerName', template: 'Player: {{items}}' },
        ],
      },
      createMockContext()
    );
    expect(result.text).toContain('You are an AI');
    expect(result.text).toContain('Player: Alice');
    expect(result.estimatedTokens).toBeGreaterThan(0);
  });

  it('空 fragments 应该返回空文本', async () => {
    const result = await PromptBuild.execute(
      { data: {} },
      { fragments: [] },
      createMockContext()
    );
    expect(result.text).toBe('');
  });
});

describe('GenerateImage 节点', () => {
  it('应该返回图像 URL', async () => {
    const result = await GenerateImage.execute(
      { prompt: 'a medieval castle' },
      { model: 'dall-e-3' },
      createMockContext()
    );
    expect(result.imageUrl.url).toContain('dall-e-3');
    expect(result.imageUrl.alt).toBe('a medieval castle');
  });
});

describe('AddState 节点', () => {
  it('应该添加新状态', async () => {
    const ctx = createMockContext();
    const result = await AddState.execute(
      { key: 'newKey', type: 'string', value: 'hello' },
      {},
      ctx
    );
    expect(result.success).toBe(true);
  });
});

describe('RemoveState 节点', () => {
  it('应该删除已存在的状态', async () => {
    const ctx = createMockContext();
    ctx.state.set('toRemove', { type: 'string', value: 'test' });
    const result = await RemoveState.execute(
      { key: 'toRemove' },
      {},
      ctx
    );
    expect(result.success).toBe(true);
  });

  it('删除不存在的状态应该返回 false', async () => {
    const result = await RemoveState.execute(
      { key: 'nonexistent' },
      {},
      createMockContext()
    );
    expect(result.success).toBe(false);
  });
});

describe('ModifyState 节点', () => {
  it('应该修改已存在的状态', async () => {
    const ctx = createMockContext();
    ctx.state.set('score', { type: 'number', value: 100 });
    const result = await ModifyState.execute(
      { key: 'score', value: 200 },
      {},
      ctx
    );
    expect(result.success).toBe(true);
  });

  it('修改不存在的状态应该返回 false', async () => {
    const result = await ModifyState.execute(
      { key: 'nonexistent', value: 'test' },
      {},
      createMockContext()
    );
    expect(result.success).toBe(false);
  });
});

describe('SubFlow 节点', () => {
  it('应该在缺少 ref 时抛出错误', async () => {
    await expect(
      SubFlow.execute(
        { input: { data: 'test' } },
        {},
        createMockContext()
      )
    ).rejects.toThrow('SubFlow node must have a "ref" field');
  });

  it('应该在缺少 flow 能力时抛出错误', async () => {
    await expect(
      SubFlow.execute(
        { input: { data: 'test' } },
        { ref: 'sub-flow.json' },
        createMockContext()
      )
    ).rejects.toThrow('Flow execution capability not available');
  });
});
