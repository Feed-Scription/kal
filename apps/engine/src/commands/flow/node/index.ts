import { defineCommand } from 'citty';

export default defineCommand({
  meta: {
    name: 'node',
    description: 'Read and modify nodes inside a flow',
  },
  subCommands: {
    list: () => import('./list').then((module) => module.default),
    show: () => import('./show').then((module) => module.default),
    add: () => import('./add').then((module) => module.default),
    update: () => import('./update').then((module) => module.default),
    patch: () => import('./patch').then((module) => module.default),
    remove: () => import('./remove').then((module) => module.default),
    'config-set': () => import('./config-set').then((module) => module.default),
    fragment: () => import('./fragment').then((module) => module.default),
  },
});
