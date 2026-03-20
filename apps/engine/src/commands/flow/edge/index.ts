import { defineCommand } from 'citty';

export default defineCommand({
  meta: {
    name: 'edge',
    description: 'Read and modify edges inside a flow',
  },
  subCommands: {
    list: () => import('./list').then((module) => module.default),
    add: () => import('./add').then((module) => module.default),
    remove: () => import('./remove').then((module) => module.default),
  },
});
