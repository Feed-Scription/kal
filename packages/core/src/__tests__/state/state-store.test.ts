import { describe, it, expect, beforeEach } from 'vitest';
import { StateStore } from '../../state-store';
import type { StateValue, InitialState } from '../../types/types';

describe('StateStore', () => {
  let store: StateStore;

  beforeEach(() => {
    store = new StateStore();
  });

  describe('基本操作', () => {
    it('应该能添加新状态', async () => {
      const result = await store.add('playerName', 'string', 'Alice');
      expect(result.success).toBe(true);
      expect(store.has('playerName')).toBe(true);
    });

    it('应该能读取已存在的状态', async () => {
      await store.add('score', 'number', 100);
      const result = store.get('score');
      expect(result.exists).toBe(true);
      expect(result.value?.value).toBe(100);
      expect(result.value?.type).toBe('number');
    });

    it('应该能修改已存在的状态', async () => {
      await store.add('score', 'number', 100);
      const result = await store.modify('score', 200);
      expect(result.success).toBe(true);
      const value = store.get('score');
      expect(value.value?.value).toBe(200);
    });

    it('应该能删除已存在的状态', async () => {
      await store.add('temp', 'string', 'test');
      const result = await store.remove('temp');
      expect(result.success).toBe(true);
      expect(store.has('temp')).toBe(false);
    });

    it('upsert 应该能添加新状态', async () => {
      const result = await store.upsert('newKey', 'string', 'newValue');
      expect(result.success).toBe(true);
      expect(store.has('newKey')).toBe(true);
      expect(store.get('newKey').value?.value).toBe('newValue');
    });

    it('upsert 应该能修改已存在的状态', async () => {
      await store.add('score', 'number', 100);
      const result = await store.upsert('score', 'number', 200);
      expect(result.success).toBe(true);
      expect(store.get('score').value?.value).toBe(200);
    });

    it('upsert 修改时应该保持原有类型', async () => {
      await store.add('score', 'number', 100);
      const result = await store.upsert('score', 'string', 200); // 传入的 type 应该被忽略
      expect(result.success).toBe(true);
      expect(store.get('score').value?.type).toBe('number');
      expect(store.get('score').value?.value).toBe(200);
    });

    it('upsert 修改时类型不匹配应该失败', async () => {
      await store.add('score', 'number', 100);
      const result = await store.upsert('score', 'number', 'not a number');
      expect(result.success).toBe(false);
    });
  });

  describe('错误处理', () => {
    it('添加已存在的键应该失败', async () => {
      await store.add('key1', 'string', 'value1');
      const result = await store.add('key1', 'string', 'value2');
      expect(result.success).toBe(false);
    });

    it('删除不存在的键应该失败', async () => {
      const result = await store.remove('nonexistent');
      expect(result.success).toBe(false);
    });

    it('修改不存在的键应该失败', async () => {
      const result = await store.modify('nonexistent', 'value');
      expect(result.success).toBe(false);
    });

    it('读取不存在的键应该返回 exists: false', () => {
      const result = store.get('nonexistent');
      expect(result.exists).toBe(false);
      expect(result.value).toBeUndefined();
    });
  });

  describe('类型检查', () => {
    it('修改时类型不匹配应该失败', async () => {
      await store.add('score', 'number', 100);
      const result = await store.modify('score', 'not a number');
      expect(result.success).toBe(false);
    });

    it('应该正确验证 string 类型', async () => {
      await store.add('name', 'string', 'Alice');
      expect((await store.modify('name', 'Bob')).success).toBe(true);
      expect((await store.modify('name', 123)).success).toBe(false);
    });

    it('应该正确验证 number 类型', async () => {
      await store.add('score', 'number', 100);
      expect((await store.modify('score', 200)).success).toBe(true);
      expect((await store.modify('score', '200')).success).toBe(false);
    });

    it('应该正确验证 boolean 类型', async () => {
      await store.add('flag', 'boolean', true);
      expect((await store.modify('flag', false)).success).toBe(true);
      expect((await store.modify('flag', 'true')).success).toBe(false);
    });

    it('应该正确验证 object 类型', async () => {
      await store.add('config', 'object', { key: 'value' });
      expect((await store.modify('config', { key: 'new' })).success).toBe(true);
      expect((await store.modify('config', 'not object')).success).toBe(false);
    });

    it('应该正确验证 array 类型', async () => {
      await store.add('items', 'array', [1, 2, 3]);
      expect((await store.modify('items', [4, 5])).success).toBe(true);
      expect((await store.modify('items', 'not array')).success).toBe(false);
    });
  });

  describe('初始状态加载', () => {
    it('应该能从 InitialState 加载状态', () => {
      const initialState: InitialState = {
        playerName: { type: 'string', value: 'Player' },
        score: { type: 'number', value: 0 },
        inventory: { type: 'array', value: [] },
      };

      store.loadInitialState(initialState);

      expect(store.has('playerName')).toBe(true);
      expect(store.has('score')).toBe(true);
      expect(store.has('inventory')).toBe(true);

      expect(store.get('playerName').value?.value).toBe('Player');
      expect(store.get('score').value?.value).toBe(0);
      expect(store.get('inventory').value?.value).toEqual([]);
    });

    it('加载初始状态应该覆盖现有状态', () => {
      store.add('key1', 'string', 'old');

      const initialState: InitialState = {
        key1: { type: 'string', value: 'new' },
      };

      store.loadInitialState(initialState);
      expect(store.get('key1').value?.value).toBe('new');
    });
  });

  describe('批量操作', () => {
    it('应该能获取所有状态', async () => {
      await store.add('key1', 'string', 'value1');
      await store.add('key2', 'number', 42);

      const allState = store.getAll();
      expect(Object.keys(allState)).toHaveLength(2);
      expect(allState['key1']).toEqual({ type: 'string', value: 'value1' });
      expect(allState['key2']).toEqual({ type: 'number', value: 42 });
    });

    it('应该能清空所有状态', async () => {
      await store.add('key1', 'string', 'value1');
      await store.add('key2', 'number', 42);

      store.clear();
      expect(store.getAll()).toEqual({});
    });
  });
});
