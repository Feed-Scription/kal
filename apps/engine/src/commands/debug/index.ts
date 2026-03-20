import { defineCommand } from 'citty';

export default defineCommand({
  meta: {
    name: 'debug',
    description: 'Drive persisted debug runs',
  },
  subCommands: {
    start: () => import('./start').then((module) => module.default),
    continue: () => import('./continue').then((module) => module.default),
    step: () => import('./step').then((module) => module.default),
    state: () => import('./state').then((module) => module.default),
    diff: () => import('./diff').then((module) => module.default),
    list: () => import('./list').then((module) => module.default),
    delete: () => import('./delete').then((module) => module.default),
    retry: () => import('./retry').then((module) => module.default),
    skip: () => import('./skip').then((module) => module.default),
  },
});
