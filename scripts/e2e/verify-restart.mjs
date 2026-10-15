import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from './cdp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, 'tmp/e2e');
const extended = process.argv.includes('--extended');
const file = extended ? 'types.html' : 'sample.html';
const previous = JSON.parse(await fs.readFile(path.join(output, extended ? 'extended.json' : 'results.json'), 'utf8'));
const client = await connect();
try {
  const actual = await client.evaluate(`({path:app.vault.adapter.basePath,plugins:Object.keys(app.plugins.plugins),htmlHandler:app.viewRegistry.typeByExtension.html??null})`);
  assert.equal(path.resolve(actual.path), path.join(root, 'test-vault'));
  assert.deepEqual(actual.plugins, ['html-frontmatter']);
  assert.equal(actual.htmlHandler, null);
  await client.evaluate(`app.plugins.plugins['html-frontmatter'].openProperties(app.vault.getFileByPath(${JSON.stringify(file)}))`);
  const restored = await client.evaluate(`(() => {
    const view=app.workspace.getLeavesOfType('file-properties').find(l=>l.view.file?.path===${JSON.stringify(file)}).view;
    return {properties:view.frontmatter,status:app.plugins.plugins['html-frontmatter'].getStatus(),bodyExecuted:window.__syntheticBodyMarker!==undefined||window.__extendedBodyExecuted!==undefined,
      types:Object.fromEntries([...view.containerEl.querySelectorAll('.metadata-property')].map(e=>[e.dataset.propertyKey,e.querySelector('.metadata-property-value')?.dataset.propertyType]))};
  })()`);
  assert.deepEqual(restored.properties, previous.expectedAfterRestart);
  assert.deepEqual(restored.status.errors, []);
  assert.equal(restored.bodyExecuted, false);
  for (const [name, type] of Object.entries(previous.expectedTypes ?? {})) assert.equal(restored.types[name], type);
  const screenshot = await client.send('Page.captureScreenshot', { format: 'png' });
  await fs.writeFile(path.join(output, extended ? 'extended-after-restart.png' : 'after-restart.png'), Buffer.from(screenshot.data, 'base64'));
  await fs.writeFile(path.join(output, extended ? 'extended-restart.json' : 'restart.json'), JSON.stringify({ passed: true, ...actual, ...restored }, null, 2) + '\n');
  console.log(`PASS full application restart restores saved HTML properties${extended ? ' and explicit list/date/datetime types' : ''} without executing HTML`);
} finally { client.close(); }
