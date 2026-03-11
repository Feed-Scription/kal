import { describe, it, expect } from 'vitest';
import { base, field, when, randomSlot, budget } from '../../prompt/fragments';
import { compose, composeMessages, composeSegments, formatSection, buildMessages } from '../../prompt/compose';
import type { PromptScope } from '../../prompt/compose';

function createScope(data: Record<string, any> = {}, state: Record<string, any> = {}): PromptScope {
  return {
    data,
    state: {
      get(key: string) {
        return state[key];
      },
    },
  };
}

describe('Prompt Fragments', () => {
  describe('composeSegments', () => {
    it('应该在 composeSegments 中解析为文本数组', () => {
      const result = composeSegments([base('intro', 'Hello World')]);
      expect(result).toEqual(['Hello World']);
    });

    it('应该从 data 中提取动态内容', () => {
      const f = field('history', 'events', '历史事件:\n{{items}}');
      const result = composeSegments([f], createScope({ events: ['事件A', '事件B'] }));
      expect(result[0]).toContain('事件A');
      expect(result[0]).toContain('事件B');
    });

    it('应该支持 dedup / sort / window 组合', () => {
      const f = field('items', 'events', '{{items}}', { window: 2, dedup: ['id'], sort: 'importance' });
      const result = composeSegments([f], createScope({
        events: [
          { id: 1, importance: 1 },
          { id: 2, importance: 3 },
          { id: 2, importance: 2 },
          { id: 3, importance: 4 },
        ],
      }));
      expect(result[0]).toContain('"importance":3');
      expect(result[0]).toContain('"importance":1');
      expect(result[0]).not.toContain('"importance":4');
      expect(result[0]).not.toContain('"importance":2');
    });

    it('应该支持 state 前缀读取', () => {
      const result = composeSegments(
        [field('name', 'state.player.name', '玩家: {{items}}')],
        createScope({}, {
          player: { type: 'object', value: { name: 'Alice' } },
        })
      );
      expect(result).toEqual(['玩家: Alice']);
    });

    it('条件为真时应该包含 fragments', () => {
      const f = when('check', 'inCombat', [base('rules', '战斗规则')]);
      expect(composeSegments([f], createScope({ inCombat: true }))).toEqual(['战斗规则']);
    });

    it('条件为假时应该包含 else', () => {
      const f = when('check', 'inCombat', [base('combat', '战斗')], [base('explore', '探索')]);
      expect(composeSegments([f], createScope({ inCombat: false }))).toEqual(['探索']);
    });

    it('randomSlot 固定 seed 应该产生确定性结果', () => {
      const f = randomSlot('flavor', [base('f1', 'A'), base('f2', 'B'), base('f3', 'C')], 1);
      expect(composeSegments([f])).toEqual(['B']);
    });

    it('budget 应该按策略裁剪片段', () => {
      const f = budget(5, 'tail', [base('a', 'short'), base('b', 'this is a much longer text')]);
      expect(composeSegments([f])).toEqual(['short']);
    });
  });

  describe('compose', () => {
    it('应该拼接为最终文本', () => {
      const result = compose([base('intro', 'Hello'), base('body', 'World')]);
      expect(result).toBe('Hello\n\nWorld');
    });

    it('数据不存在时应该返回空字符串', () => {
      const f = field('missing', 'nonexistent', '{{items}}');
      expect(compose([f], createScope({}))).toBe('');
    });
  });

  describe('composeMessages', () => {
    it('应该按 role 分组消息', () => {
      const messages = composeMessages([
        base('system-a', '你是一个叙事 AI', 'system'),
        base('system-b', '保持简洁', 'system'),
        field('user-name', 'name', '你好，{{items}}', { role: 'user' }),
      ], createScope({ name: 'Alice' }));

      expect(messages).toEqual([
        { role: 'system', content: '你是一个叙事 AI\n\n保持简洁' },
        { role: 'user', content: '你好，Alice' },
      ]);
    });

    it('应该支持外层 role 继承', () => {
      const messages = composeMessages([
        when('branch', 'enabled', [base('rule', '规则A')], undefined, { role: 'assistant' }),
      ], createScope({ enabled: true }), { defaultRole: 'system' });

      expect(messages).toEqual([{ role: 'assistant', content: '规则A' }]);
    });
  });
});

describe('Prompt Format', () => {
  describe('formatSection', () => {
    it('应该格式化为 XML', () => {
      expect(formatSection('system', 'Hello', 'xml')).toBe('<system>\nHello\n</system>');
    });

    it('应该格式化为 Markdown', () => {
      expect(formatSection('system', 'Hello', 'markdown')).toBe('## system\n\nHello');
    });
  });

  describe('buildMessages', () => {
    it('应该构建完整的消息数组', () => {
      const messages = buildMessages({
        system: 'You are an AI',
        user: 'Hello',
        history: [{ role: 'assistant', content: 'Hi' }],
      });
      expect(messages).toHaveLength(3);
      expect(messages[0]!.role).toBe('system');
      expect(messages[1]!.role).toBe('assistant');
      expect(messages[2]!.role).toBe('user');
    });
  });
});
