import { defineCommand } from 'citty';

export default defineCommand({
  meta: {
    name: 'fragment',
    description: 'Read and modify PromptBuild fragments',
  },
  subCommands: {
    list: () => import('./list').then((module) => module.default),
    add: () => import('./add').then((module) => module.default),
    update: () => import('./update').then((module) => module.default),
    remove: () => import('./remove').then((module) => module.default),
  },
});
