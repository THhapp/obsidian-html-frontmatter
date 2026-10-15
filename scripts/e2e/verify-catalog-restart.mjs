import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from './cdp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, 'tmp/e2e');
const { expected } = JSON.parse(await fs.readFile(path.join(output, 'catalog.json'), 'utf8'));
const client = await connect();
try {
  const actual = await client.evaluate(`({path:app.vault.adapter.basePath,plugins:Object.keys(app.plugins.plugins)})`);
  assert.equal(path.resolve(actual.path), path.join(root, 'test-vault'));
  assert.deepEqual(actual.plugins, ['html-frontmatter']);
  await client.evaluate(`app.plugins.plugins['html-frontmatter'].flush()`);
  const leafId = await client.evaluate(`(async()=>{const l=app.workspace.getLeavesOfType('all-properties')[0]??app.workspace.getRightLeaf(false);await l.setViewState({type:'all-properties'});await l.loadIfDeferred();await app.workspace.revealLeaf(l);return l.id;})()`);
  const view = `app.workspace.getLeafById(${JSON.stringify(leafId)}).view`;
  for (let i = 0; i < 100; i++) {
    if (await client.evaluate(`${view}.doms.catalogstate?.flairEl.textContent==='${expected.count}'`)) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const restored = await client.evaluate(`({count:app.metadataTypeManager.getPropertyOccurrences().catalogstate,rowCount:${view}.doms.catalogstate?.flairEl.textContent,values:app.metadataCache.getFrontmatterPropertyValuesForKey('CatalogState'),types:Object.fromEntries(Object.entries(${view}.doms).map(([k,v])=>[k,v.property.widget])),assigned:app.metadataTypeManager.getAssignedWidget('目录专属'),status:app.plugins.plugins['html-frontmatter'].getStatus(),executed:window.__catalogBodyExecuted!==undefined})`);
  assert.equal(restored.count, expected.count);
  assert.equal(restored.rowCount, String(expected.count));
  assert.deepEqual(restored.values, expected.values);
  for (const [name, type] of Object.entries(expected.types)) assert.equal(restored.types[name], type);
  assert.equal(restored.assigned, 'text');
  assert.deepEqual(restored.status.errors, []);
  assert.equal(restored.executed, false);
  const screenshot = await client.send('Page.captureScreenshot', { format: 'png' });
  await fs.writeFile(path.join(output, 'catalog-after-restart.png'), Buffer.from(screenshot.data, 'base64'));
  await fs.writeFile(path.join(output, 'catalog-restart.json'), JSON.stringify({ passed: true, ...restored }, null, 2) + '\n');
  console.log('PASS full application restart reconstructs the native HTML property directory/counts/suggestions and preserves explicit types');
} finally { client.close(); }
