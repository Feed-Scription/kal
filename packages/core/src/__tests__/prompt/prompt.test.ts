import { describe, it, expect } from 'vitest';
import { base, field, when, randomSlot, budget } from '../../prompt/fragments';
import { compose, composeMessages, composeSegments, formatSection, buildMessages, interpolateVariables } from '../../prompt/compose';
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

describe('Base Fragment Interpolation', () => {
  it('{{state.round}} 应该插值为数字', () => {
    const result = compose(
      [base('info', '当前回合: {{state.round}}')],
      createScope({}, { round: { type: 'number', value: 5 } }),
    );
    expect(result).toBe('当前回合: 5');
  });

  it('{{state.player.name}} 应该支持嵌套路径', () => {
    const result = compose(
      [base('info', '玩家: {{state.player.name}}')],
      createScope({}, { player: { type: 'object', value: { name: 'Alice' } } }),
    );
    expect(result).toBe('玩家: Alice');
  });

  it('{{data.category}} 应该从 data 源插值', () => {
    const result = compose(
      [base('info', '分类: {{data.category}}')],
      createScope({ category: '历史' }),
    );
    expect(result).toBe('分类: 历史');
  });

  it('{{state.missing}} 缺失值应保留占位符', () => {
    const result = compose(
      [base('info', '值: {{state.missing}}')],
      createScope(),
    );
    expect(result).toBe('值: {{state.missing}}');
  });

  it('混合插值应支持部分替换', () => {
    const result = compose(
      [base('info', 'Round {{state.round}} of {{state.maxRounds}}')],
      createScope({}, {
        round: { type: 'number', value: 3 },
        maxRounds: { type: 'number', value: 10 },
      }),
    );
    expect(result).toBe('Round 3 of 10');
  });

  it('{{items}} 在 base 内容中不应被插值', () => {
    const result = compose(
      [base('info', '模板: {{items}}')],
      createScope(),
    );
    expect(result).toBe('模板: {{items}}');
  });

  it('对象值应被 JSON.stringify', () => {
    const result = compose(
      [base('info', '数据: {{state.obj}}')],
      createScope({}, { obj: { type: 'object', value: { a: 1, b: 2 } } }),
    );
    expect(result).toBe('数据: {"a":1,"b":2}');
  });

  it('布尔值应被转为字符串', () => {
    const result = compose(
      [base('info', '激活: {{state.active}}')],
      createScope({}, { active: { type: 'boolean', value: true } }),
    );
    expect(result).toBe('激活: true');
  });
});

describe('When Fragment Comparison Operators', () => {
  it('state.round >= 9 当 round=10 应为 true', () => {
    const f = when('hint', 'state.round >= 9', [base('msg', '回合快结束了')]);
    const result = composeSegments([f], createScope({}, {
      round: { type: 'number', value: 10 },
    }));
    expect(result).toEqual(['回合快结束了']);
  });

  it('state.round >= 9 当 round=5 应走 else 分支', () => {
    const f = when('hint', 'state.round >= 9',
      [base('late', '快结束了')],
      [base('early', '还早呢')],
    );
    const result = composeSegments([f], createScope({}, {
      round: { type: 'number', value: 5 },
    }));
    expect(result).toEqual(['还早呢']);
  });

  it('state.score == 100 等值比较', () => {
    const f = when('perfect', 'state.score == 100', [base('msg', '满分!')]);
    const result = composeSegments([f], createScope({}, {
      score: { type: 'number', value: 100 },
    }));
    expect(result).toEqual(['满分!']);
  });

  it('state.score != 100 不等比较', () => {
    const f = when('imperfect', 'state.score != 100', [base('msg', '继续努力')]);
    const result = composeSegments([f], createScope({}, {
      score: { type: 'number', value: 80 },
    }));
    expect(result).toEqual(['继续努力']);
  });

  it('state.health < 20 小于比较', () => {
    const f = when('danger', 'state.health < 20',
      [base('low', '危险!')],
      [base('ok', '安全')],
    );
    expect(composeSegments([f], createScope({}, {
      health: { type: 'number', value: 10 },
    }))).toEqual(['危险!']);
    expect(composeSegments([f], createScope({}, {
      health: { type: 'number', value: 50 },
    }))).toEqual(['安全']);
  });

  it('简单 truthy 路径仍然有效: state.isActive', () => {
    const f = when('check', 'state.isActive', [base('msg', '已激活')]);
    expect(composeSegments([f], createScope({}, {
      isActive: { type: 'boolean', value: true },
    }))).toEqual(['已激活']);
    expect(composeSegments([f], createScope({}, {
      isActive: { type: 'boolean', value: false },
    }))).toEqual([]);
  });

  it('data 路径 truthy 检查仍然有效', () => {
    const f = when('check', 'inCombat', [base('msg', '战斗中')]);
    expect(composeSegments([f], createScope({ inCombat: true }))).toEqual(['战斗中']);
    expect(composeSegments([f], createScope({ inCombat: false }))).toEqual([]);
  });

  it('缺失 state key 时比较表达式应为 false', () => {
    const f = when('check', 'state.round >= 5', [base('msg', '显示')]);
    const result = composeSegments([f], createScope());
    expect(result).toEqual([]);
  });
});

describe('Field Fragment format alias', () => {
  it('field() builder 应使用 format 字段', () => {
    const f = field('name', 'state.player.name', '玩家: {{items}}');
    expect(f.format).toBe('玩家: {{items}}');
    expect(f.template).toBeUndefined();
  });

  it('format 字段应正确渲染', () => {
    const f = field('name', 'state.player.name', '玩家: {{items}}');
    const result = composeSegments([f], createScope({}, {
      player: { type: 'object', value: { name: 'Alice' } },
    }));
    expect(result).toEqual(['玩家: Alice']);
  });

  it('旧的 template 字段应向后兼容', () => {
    // Simulate a legacy fragment with template instead of format
    const f = { type: 'field' as const, id: 'name', source: 'items', template: '列表: {{items}}' };
    const result = composeSegments([f], createScope({ items: ['A', 'B'] }));
    expect(result).toEqual(['列表: A\nB']);
  });
});
