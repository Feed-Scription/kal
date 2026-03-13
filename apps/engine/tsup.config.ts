import { defineConfig } from 'tsup';
import { cpSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const shared = {
  tsconfig: 'tsconfig.build.json',
  sourcemap: true,
  splitting: false as const,
  target: 'node18',
  external: ['@kal-ai/core'],
};

function copyEditorDist() {
  const src = resolve('..', 'editor', 'dist');
  const dest = resolve('dist', 'editor');
  if (existsSync(src)) {
    cpSync(src, dest, { recursive: true });
    console.log('Copied editor dist → dist/editor');
  } else {
    console.warn('Editor dist not found, skipping copy');
  }
}

export default defineConfig([
  {
    ...shared,
    entry: {
      index: 'src/index.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    onSuccess: async () => {
      copyEditorDist();
    },
  },
  {
    ...shared,
    entry: {
      bin: 'src/bin.ts',
    },
    format: ['esm'],
    dts: false,
    clean: false,
  },
]);
