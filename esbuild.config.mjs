import { build } from 'esbuild';

await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: ['obsidian'],
  platform: 'browser',
  format: 'cjs',
  target: 'es2021',
  outfile: 'main.js',
  sourcemap: false,
  minify: false,
  logLevel: 'info',
});
