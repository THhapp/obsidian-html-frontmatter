import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'test-vault');
const marker = path.join(target, '.html-frontmatter-test-vault');
const existing = await fs.readdir(target).catch((error) => {
  if (error.code === 'ENOENT') return [];
  throw error;
});
if (existing.length && !(await fs.stat(marker).catch(() => null))) throw new Error('Refusing to modify an existing unmarked vault.');
await fs.mkdir(path.join(target, '.obsidian/plugins/html-frontmatter'), { recursive: true });
await fs.writeFile(marker, 'Synthetic development vault. Never point this script at a personal vault.\n');
const writeJson = (name, data) => fs.writeFile(path.join(target, '.obsidian', name), JSON.stringify(data, null, 2) + '\n');
await writeJson('app.json', { showUnsupportedFiles: true, alwaysUpdateLinks: false });
await writeJson('community-plugins.json', ['html-frontmatter']);
await writeJson('core-plugins.json', {
  'file-explorer': true,
  'global-search': true,
  'command-palette': true,
  'properties': true,
  'tag-pane': true,
  'graph': false,
  'sync': false,
  'file-recovery': false,
});
for (const name of ['sample.html', 'control.md', 'types.html', 'types-control.md', 'catalog.html']) {
  const destination = path.join(target, name);
  // Preserve existing test edits on subsequent builds.
  if (!(await fs.stat(destination).catch(() => null))) await fs.copyFile(path.join(root, 'tests/fixtures', name), destination);
}
for (const name of ['main.js', 'manifest.json']) await fs.copyFile(path.join(root, name), path.join(target, '.obsidian/plugins/html-frontmatter', name));
console.log(`Prepared synthetic test vault: ${target}`);
