import { defineCommand } from 'citty';

export default defineCommand({
  meta: {
    name: 'flow',
    description: 'Read and modify flow definitions',
  },
  subCommands: {
    list: () => import('./list').then((module) => module.default),
    show: () => import('./show').then((module) => module.default),
    create: () => import('./create').then((module) => module.default),
    update: () => import('./update').then((module) => module.default),
    delete: () => import('./delete').then((module) => module.default),
    execute: () => import('./execute').then((module) => module.default),
    validate: () => import('./validate').then((module) => module.default),
    'meta-set': () => import('./meta-set').then((module) => module.default),
    node: () => import('./node').then((module) => module.default),
    edge: () => import('./edge').then((module) => module.default),
  },
});
