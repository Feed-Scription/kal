import { defineCommand } from 'citty';

export default defineCommand({
  meta: {
    name: 'session',
    description: 'Read and modify session.json',
  },
  subCommands: {
    show: () => import('./show').then((module) => module.default),
    set: () => import('./set').then((module) => module.default),
    delete: () => import('./delete').then((module) => module.default),
    validate: () => import('./validate').then((module) => module.default),
    'meta-set': () => import('./meta-set').then((module) => module.default),
    step: () => import('./step').then((module) => module.default),
  },
});
