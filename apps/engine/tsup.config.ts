import { defineConfig } from 'tsup';
import { cpSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const shared = {
  tsconfig: 'tsconfig.build.json',
  sourcemap: true,
  splitting: false as const,
  target: 'node18',
  external: ['@kal-ai/core', 'chokidar'],
};

function copyStudioDist() {
  const src = resolve('..', 'studio', 'dist');
  const dest = resolve('dist', 'studio');
  if (existsSync(src)) {
    cpSync(src, dest, { recursive: true });
    console.log('Copied studio dist → dist/studio');
  } else {
    console.warn('Studio dist not found, skipping copy');
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
      copyStudioDist();
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
