import { describe, it, expect, beforeEach } from 'vitest';
import { StateStore } from '../../state-store';
import type { InitialState } from '../../types/types';

describe('StateStore', () => {
  let store: StateStore;

  beforeEach(() => {
    store = new StateStore();
  });

  describe('基本操作', () => {
    it('应该能添加、读取、修改和删除状态', async () => {
      expect((await store.add('playerName', 'string', 'Alice')).success).toBe(true);
      expect(store.get('playerName').value?.value).toBe('Alice');
      expect((await store.modify('playerName', 'Bob')).success).toBe(true);
      expect(store.get('playerName').value?.value).toBe('Bob');
      expect((await store.remove('playerName')).success).toBe(true);
      expect(store.has('playerName')).toBe(false);
    });

    it('upsert 应该能添加和更新状态', async () => {
      expect((await store.upsert('score', 'number', 100)).success).toBe(true);
      expect((await store.upsert('score', 'string', 200)).success).toBe(true);
      expect(store.get('score').value?.type).toBe('number');
      expect(store.get('score').value?.value).toBe(200);
    });

    it('append / appendMany 应该追加数组状态', async () => {
      await store.add('history', 'array', ['a']);
      expect(store.append('history', 'b').success).toBe(true);
      expect(store.appendMany('history', ['c', 'd']).success).toBe(true);
      expect(store.get('history').value?.value).toEqual(['a', 'b', 'c', 'd']);
    });
  });

  describe('错误处理', () => {
    it('不存在的键应返回失败', async () => {
      expect((await store.remove('missing')).success).toBe(false);
      expect((await store.modify('missing', 'value')).success).toBe(false);
      expect(store.append('missing', 'value').success).toBe(false);
    });

    it('非数组状态不允许 append', async () => {
      await store.add('name', 'string', 'Alice');
      expect(store.append('name', 'Bob').success).toBe(false);
    });

    it('读取不存在的键应该返回 exists: false', () => {
      const result = store.get('nonexistent');
      expect(result.exists).toBe(false);
      expect(result.value).toBeUndefined();
    });
  });

  describe('类型检查', () => {
    it('应该验证基础类型', async () => {
      await store.add('name', 'string', 'Alice');
      await store.add('score', 'number', 100);
      await store.add('flag', 'boolean', true);
      await store.add('config', 'object', { key: 'value' });
      await store.add('items', 'array', [1, 2]);

      expect((await store.modify('name', 123)).success).toBe(false);
      expect((await store.modify('score', '200')).success).toBe(false);
      expect((await store.modify('flag', 'true')).success).toBe(false);
      expect((await store.modify('config', 'not-object')).success).toBe(false);
      expect((await store.modify('items', 'not-array')).success).toBe(false);
    });
  });

  describe('初始状态和批量操作', () => {
    it('应该能加载 InitialState', () => {
      const initialState: InitialState = {
        playerName: { type: 'string', value: 'Player' },
        score: { type: 'number', value: 0 },
        history: { type: 'array', value: [] },
      };

      store.loadInitialState(initialState);

      expect(store.get('playerName').value?.value).toBe('Player');
      expect(store.get('score').value?.value).toBe(0);
      expect(store.get('history').value?.value).toEqual([]);
    });

    it('应该能获取和清空所有状态', async () => {
      await store.add('key1', 'string', 'value1');
      await store.add('key2', 'number', 42);

      const allState = store.getAll();
      expect(Object.keys(allState)).toHaveLength(2);

      store.clear();
      expect(store.getAll()).toEqual({});
    });
  });
});
