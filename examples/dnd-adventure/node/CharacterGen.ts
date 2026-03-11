import type { CustomNode } from '@kal-ai/core';

type ClassBase = { str: number; dex: number; int: number; hp: number; skills: string[] };
type RaceBonus = { str: number; dex: number; int: number };

const CLASS_BASE: Record<string, ClassBase> = {
  warrior: { str: 14, dex: 10, int: 8, hp: 120, skills: ['重击', '盾墙', '战吼'] },
  mage: { str: 8, dex: 10, int: 14, hp: 80, skills: ['火球术', '冰冻', '魔法护盾'] },
  rogue: { str: 10, dex: 14, int: 10, hp: 100, skills: ['背刺', '潜行', '毒刃'] },
};

const RACE_BONUS: Record<string, RaceBonus> = {
  human: { str: 2, dex: 2, int: 2 },
  elf: { str: 0, dex: 4, int: 2 },
  dwarf: { str: 4, dex: -2, int: 0 },
};

const CharacterGen: CustomNode = {
  type: 'CharacterGen',
  label: '角色生成',
  category: 'transform',
  inputs: [
    { name: 'race', type: 'string', required: true },
    { name: 'class', type: 'string', required: true },
  ],
  outputs: [
    { name: 'strength', type: 'number' },
    { name: 'dexterity', type: 'number' },
    { name: 'intelligence', type: 'number' },
    { name: 'maxHealth', type: 'number' },
    { name: 'skills', type: 'array' },
  ],
  defaultConfig: {},
  async execute(inputs) {
    const base = CLASS_BASE[inputs.class] ?? CLASS_BASE.warrior;
    const bonus = RACE_BONUS[inputs.race] ?? RACE_BONUS.human;
    return {
      strength: base.str + bonus.str,
      dexterity: base.dex + bonus.dex,
      intelligence: base.int + bonus.int,
      maxHealth: base.hp,
      skills: base.skills,
    };
  },
};

export default CharacterGen;
