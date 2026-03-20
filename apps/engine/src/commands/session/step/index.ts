import { defineCommand } from 'citty';

export default defineCommand({
  meta: {
    name: 'step',
    description: 'Read and modify individual session steps',
  },
  subCommands: {
    list: () => import('./list').then((module) => module.default),
    show: () => import('./show').then((module) => module.default),
    add: () => import('./add').then((module) => module.default),
    update: () => import('./update').then((module) => module.default),
    patch: () => import('./patch').then((module) => module.default),
    remove: () => import('./remove').then((module) => module.default),
  },
});
