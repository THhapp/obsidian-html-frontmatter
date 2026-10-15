import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';

// Native community installation downloads main.js and manifest.json only.
// Keep both project and bundled dependency notices inside the runtime artifact.
const license = await readFile(new URL('./LICENSE', import.meta.url), 'utf8');
const thirdParty = await readFile(new URL('./THIRD_PARTY_NOTICES.md', import.meta.url), 'utf8');

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
  banner: { js: `/*!\nHTML Frontmatter\n\n${license}\n${thirdParty}\n*/` },
  logLevel: 'info',
});
