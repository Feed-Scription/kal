import { defineCommand } from 'citty';

export default defineCommand({
  meta: {
    name: 'schema',
    description: 'Inspect built-in schema information',
  },
  subCommands: {
    nodes: () => import('./nodes').then((module) => module.default),
    node: () => import('./node').then((module) => module.default),
    session: () => import('./session').then((module) => module.default),
  },
});
