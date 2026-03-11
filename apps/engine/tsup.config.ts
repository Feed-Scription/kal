import { defineConfig } from 'tsup';

const shared = {
  tsconfig: 'tsconfig.build.json',
  sourcemap: true,
  splitting: false as const,
  target: 'node18',
  external: ['@kal-ai/core'],
};

export default defineConfig([
  {
    ...shared,
    entry: {
      index: 'src/index.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
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
