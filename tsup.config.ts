import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    dts: true,
    clean: true,
    banner: { js: '#!/usr/bin/env node' },
  },
  {
    entry: { lib: 'src/lib.ts' },
    format: ['esm'],
    dts: true,
  },
  {
    entry: { 'guard-hook': 'src/hook/guard-hook.ts' },
    format: ['esm'],
    banner: { js: '#!/usr/bin/env node' },
    noExternal: [/.*/],
    outExtension: () => ({ js: '.mjs' }),
  },
  {
    entry: { 'auto-track': 'src/hook/auto-track.mjs' },
    format: ['esm'],
    banner: { js: '#!/usr/bin/env node' },
    outExtension: () => ({ js: '.mjs' }),
  },
  {
    entry: { 'git-post-commit': 'src/hook/git-post-commit.mjs' },
    format: ['esm'],
    banner: { js: '#!/usr/bin/env node' },
    outExtension: () => ({ js: '.mjs' }),
  },
]);
