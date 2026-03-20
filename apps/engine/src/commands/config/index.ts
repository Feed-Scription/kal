import { defineCommand } from 'citty';

export default defineCommand({
  meta: {
    name: 'config',
    description: 'Manage KAL CLI configuration',
  },
  subCommands: {
    init: () => import('./init').then((module) => module.default),
    set: () => import('./set').then((module) => module.default),
    get: () => import('./get').then((module) => module.default),
    list: () => import('./list').then((module) => module.default),
    remove: () => import('./remove').then((module) => module.default),
    'set-key': () => import('./set-key').then((module) => module.default),
  },
});
