import { defineCommand } from 'citty';

export default defineCommand({
  meta: {
    name: 'eval',
    description: 'Run prompt evaluation helpers',
  },
  subCommands: {
    nodes: () => import('./nodes').then((module) => module.default),
    render: () => import('./render').then((module) => module.default),
    run: () => import('./run').then((module) => module.default),
    compare: () => import('./compare').then((module) => module.default),
  },
});
