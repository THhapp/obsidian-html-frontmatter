import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readMetadata } from '../../src/metadata.ts';
import { connect } from './cdp.mjs';

// Run after extracting the release ZIP into the independent vault and restarting it.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const vault = path.join(root, 'test-vault');
const client = await connect();
const hash = async (file) => createHash('sha256').update(await fs.readFile(file)).digest('hex');
try {
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));
  const actual = await client.evaluate(`({path:app.vault.adapter.basePath,plugins:Object.keys(app.plugins.plugins),version:app.plugins.plugins['html-frontmatter']?.manifest.version})`);
  assert.equal(path.resolve(actual.path), vault);
  assert.deepEqual(actual.plugins, ['html-frontmatter']);
  assert.equal(actual.version, manifest.version);
  for (const name of ['main.js', 'manifest.json', 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md']) {
    assert.equal(await hash(path.join(vault, '.obsidian/plugins/html-frontmatter', name)), await hash(path.join(root, 'dist/html-frontmatter', name)));
  }
  const file = path.join(vault, 'sample.html');
  const before = await fs.readFile(file, 'utf8');
  const beforeMetadata = readMetadata(before);
  const expected = `安装包保存验证-${Date.now()}`;
  await client.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await client.evaluate(`app.plugins.plugins['html-frontmatter'].openProperties(app.vault.getFileByPath('sample.html'))`);
  await client.evaluate(`(() => {
    const view=app.workspace.getLeavesOfType('file-properties').find(l=>l.view.file?.path==='sample.html').view;
    const input=view.containerEl.querySelector('[data-property-key="标题"] .metadata-input-longtext');
    input.focus();if(document.activeElement!==input)throw Error('Input is not visible');
    const range=document.createRange();range.selectNodeContents(input);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
  })()`);
  await client.send('Input.insertText', { text: expected });
  await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  for (let i = 0; i < 80; i++) {
    if (readMetadata(await fs.readFile(file, 'utf8')).properties.标题 === expected) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await client.evaluate(`app.plugins.plugins['html-frontmatter'].flush()`);
  const after = await fs.readFile(file, 'utf8');
  const metadata = readMetadata(after);
  assert.equal(metadata.properties.标题, expected);
  assert.equal(after.slice(0, metadata.region.contentStart), before.slice(0, beforeMetadata.region.contentStart));
  assert.equal(after.slice(metadata.region.contentEnd), before.slice(beforeMetadata.region.contentEnd));
  const status = await client.evaluate(`app.plugins.plugins['html-frontmatter'].getStatus()`);
  assert.deepEqual(status.errors, []);
  await fs.mkdir(path.join(root, 'tmp/e2e'), { recursive: true });
  await fs.writeFile(path.join(root, 'tmp/e2e/install-smoke.json'), JSON.stringify({ passed: true, version: actual.version, installedFilesMatchRelease: true, nativePropertySave: true, surroundingSourceUnchanged: true, status }, null, 2) + '\n');
  console.log(`PASS release ${actual.version}: installed package matches, native property save works, surrounding HTML unchanged`);
} finally { client.close(); }
