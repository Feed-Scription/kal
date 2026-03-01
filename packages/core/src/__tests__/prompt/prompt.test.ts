import { describe, it, expect, vi } from 'vitest';
import { base, field, when, randomSlot, budget } from '../../prompt/fragments';
import { compose, formatSection, buildMessages } from '../../prompt/compose';

describe('Prompt Fragments', () => {
  describe('base', () => {
    it('应该创建静态文本片段', () => {
      const f = base('intro', '你是一个中世纪叙事 AI', 'system');
      expect(f.type).toBe('base');
      expect(f.content).toBe('你是一个中世纪叙事 AI');
    });

    it('应该在 compose 中解析为文本', () => {
      const result = compose([base('intro', 'Hello World')]);
      expect(result).toEqual(['Hello World']);
    });
  });

  describe('field', () => {
    it('应该从数据中提取动态内容', () => {
      const f = field('history', 'events', '历史事件:\n{{items}}');
      const data = { events: ['事件A', '事件B'] };
      const result = compose([f], data);
      expect(result[0]).toContain('事件A');
      expect(result[0]).toContain('事件B');
    });

    it('应该支持 window 限制', () => {
      const f = field('history', 'events', '{{items}}', { window: 2 });
      const data = { events: ['A', 'B', 'C', 'D'] };
      const result = compose([f], data);
      expect(result[0]).toContain('C');
      expect(result[0]).toContain('D');
      expect(result[0]).not.toContain('A');
    });

    it('应该支持 dedup 去重', () => {
      const f = field('items', 'events', '{{items}}', { dedup: ['id'] });
      const data = { events: [{ id: 1, name: 'A' }, { id: 1, name: 'A2' }, { id: 2, name: 'B' }] };
      const result = compose([f], data);
      expect(result[0]).not.toContain('A2');
    });

    it('应该支持 sort 排序', () => {
      const f = field('items', 'events', '{{items}}', { sort: 'importance' });
      const data = { events: [{ importance: 1 }, { importance: 3 }, { importance: 2 }] };
      const result = compose([f], data);
      const parsed = result[0]!;
      const idx3 = parsed.indexOf('"importance":3');
      const idx2 = parsed.indexOf('"importance":2');
      expect(idx3).toBeLessThan(idx2);
    });

    it('数据不存在时应该返回空', () => {
      const f = field('missing', 'nonexistent', '{{items}}');
      const result = compose([f], {});
      expect(result).toEqual([]);
    });
  });

  describe('when', () => {
    it('条件为真时应该包含 fragments', () => {
      const f = when('check', 'inCombat', [base('rules', '战斗规则')]);
      const result = compose([f], { inCombat: true });
      expect(result).toEqual(['战斗规则']);
    });

    it('条件为假时应该包含 else', () => {
      const f = when('check', 'inCombat', [base('combat', '战斗')], [base('explore', '探索')]);
      const result = compose([f], { inCombat: false });
      expect(result).toEqual(['探索']);
    });

    it('条件为假且无 else 时应该返回空', () => {
      const f = when('check', 'inCombat', [base('combat', '战斗')]);
      const result = compose([f], { inCombat: false });
      expect(result).toEqual([]);
    });
  });

  describe('randomSlot', () => {
    it('应该从候选中选择一个', () => {
      const f = randomSlot('flavor', [
        base('f1', '风格A'),
        base('f2', '风格B'),
      ], 0);
      const result = compose([f]);
      expect(result).toHaveLength(1);
      expect(result[0]).toBe('风格A');
    });

    it('固定 seed 应该产生确定性结果', () => {
      const f = randomSlot('flavor', [
        base('f1', 'A'),
        base('f2', 'B'),
        base('f3', 'C'),
      ], 1);
      const result = compose([f]);
      expect(result).toEqual(['B']);
    });

    it('空候选应该返回空', () => {
      const f = randomSlot('empty', []);
      const result = compose([f]);
      expect(result).toEqual([]);
    });
  });

  describe('budget', () => {
    it('在预算内应该保留所有片段', () => {
      const f = budget(10000, 'tail', [
        base('a', 'short text'),
        base('b', 'another text'),
      ]);
      const result = compose([f]);
      expect(result).toHaveLength(2);
    });

    it('超出预算时 tail 策略应该从末尾裁剪', () => {
      const f = budget(5, 'tail', [
        base('a', 'short'),
        base('b', 'this is a much longer text that exceeds the budget'),
      ]);
      const result = compose([f]);
      expect(result).toHaveLength(1);
      expect(result[0]).toBe('short');
    });
  });
});

describe('Prompt Format', () => {
  describe('formatSection', () => {
    it('应该格式化为 XML', () => {
      const result = formatSection('system', 'Hello', 'xml');
      expect(result).toBe('<system>\nHello\n</system>');
    });

    it('应该格式化为 Markdown', () => {
      const result = formatSection('system', 'Hello', 'markdown');
      expect(result).toBe('## system\n\nHello');
    });

    it('默认应该使用 XML', () => {
      const result = formatSection('system', 'Hello');
      expect(result).toContain('<system>');
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

    it('没有 system 时应该省略', () => {
      const messages = buildMessages({ user: 'Hello' });
      expect(messages).toHaveLength(1);
      expect(messages[0]!.role).toBe('user');
    });
  });
});
