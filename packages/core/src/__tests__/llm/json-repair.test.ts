import { describe, it, expect } from 'vitest';
import { repairJson } from '../../llm/json-repair';

describe('repairJson', () => {
  describe('代码块提取', () => {
    it('应该从 markdown 代码块中提取 JSON', () => {
      const input = '```json\n{"name": "test"}\n```';
      expect(repairJson(input)).toEqual({ name: 'test' });
    });

    it('应该从无语言标记的代码块中提取 JSON', () => {
      const input = '```\n{"name": "test"}\n```';
      expect(repairJson(input)).toEqual({ name: 'test' });
    });

    it('应该处理代码块前后有文本的情况', () => {
      const input = 'Here is the result:\n```json\n{"name": "test"}\n```\nDone.';
      expect(repairJson(input)).toEqual({ name: 'test' });
    });
  });

  describe('尾逗号修复', () => {
    it('应该修复对象尾逗号', () => {
      const input = '{"a": 1, "b": 2,}';
      expect(repairJson(input)).toEqual({ a: 1, b: 2 });
    });

    it('应该修复数组尾逗号', () => {
      const input = '[1, 2, 3,]';
      expect(repairJson(input)).toEqual([1, 2, 3]);
    });
  });

  describe('单引号修复', () => {
    it('应该修复单引号为双引号', () => {
      const input = "{'name': 'test', 'value': 123}";
      expect(repairJson(input)).toEqual({ name: 'test', value: 123 });
    });
  });

  describe('注释移除', () => {
    it('应该移除单行注释', () => {
      const input = '{\n"name": "test" // this is a comment\n}';
      expect(repairJson(input)).toEqual({ name: 'test' });
    });

    it('应该移除多行注释', () => {
      const input = '{\n/* comment */\n"name": "test"\n}';
      expect(repairJson(input)).toEqual({ name: 'test' });
    });
  });

  describe('截断修复', () => {
    it('应该修复缺失的右花括号', () => {
      const input = '{"name": "test", "items": [1, 2]';
      expect(repairJson(input)).toEqual({ name: 'test', items: [1, 2] });
    });

    it('应该修复缺失的右方括号', () => {
      const input = '[1, 2, 3';
      expect(repairJson(input)).toEqual([1, 2, 3]);
    });

    it('应该修复多层嵌套的截断', () => {
      const input = '{"a": {"b": [1, 2';
      expect(repairJson(input)).toEqual({ a: { b: [1, 2] } });
    });
  });

  describe('有效 JSON', () => {
    it('应该直接解析有效 JSON', () => {
      const input = '{"name": "test", "value": 42}';
      expect(repairJson(input)).toEqual({ name: 'test', value: 42 });
    });

    it('应该处理空对象', () => {
      expect(repairJson('{}')).toEqual({});
    });

    it('应该处理空数组', () => {
      expect(repairJson('[]')).toEqual([]);
    });
  });

  describe('错误处理', () => {
    it('应该在完全无法修复时抛出错误', () => {
      expect(() => repairJson('not json at all')).toThrow();
    });
  });
});
