import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readMetadata, writeMetadata } from '../../src/metadata.ts';
import { connect } from './cdp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const vault = path.join(root, 'test-vault');
const output = path.join(root, 'tmp/e2e');
const client = await connect();
const evaluate = (expression) => client.evaluate(expression);
const results = [];
const record = (name) => { results.push({ name, passed: true }); console.log(`PASS ${name}`); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const flush = () => evaluate(`app.plugins.plugins['html-frontmatter']?.flush()`);
let originalIgnore;
let restoreIgnore = false;
let view;
async function upsert(name, source) {
  await evaluate(`(async()=>{const f=app.vault.getFileByPath(${JSON.stringify(name)});if(f)await app.vault.modify(f,${JSON.stringify(source)});else await app.vault.create(${JSON.stringify(name)},${JSON.stringify(source)});})()`);
  await flush();
}
async function waitFor(expression, description) {
  for (let i = 0; i < 100; i++) {
    if (await evaluate(expression)) return;
    await sleep(100);
  }
  throw new Error(`Timed out: ${description}`);
}
async function count(expected) {
  await waitFor(`app.metadataTypeManager.getPropertyOccurrences().catalogstate===${expected}&&${view}.doms.catalogstate?.flairEl.textContent==='${expected}'`, `native directory count ${expected}`);
}
const values = () => evaluate(`app.metadataCache.getFrontmatterPropertyValuesForKey('CatalogState')`);

try {
  const actual = await evaluate(`({path:app.vault.adapter.basePath,plugins:Object.keys(app.plugins.plugins)})`);
  assert.equal(path.resolve(actual.path), vault, 'Never run against a personal vault');
  assert.deepEqual(actual.plugins, ['html-frontmatter']);
  await fs.mkdir(output, { recursive: true });
  originalIgnore = await evaluate(`app.vault.getConfig('userIgnoreFilters')??null`);
  await evaluate(`app.workspace.getLeavesOfType('file-properties').forEach(l=>l.detach())`);
  await flush();
  for (const name of ['catalog-b.htm', 'catalog-moved.htm']) {
    await evaluate(`(async()=>{const f=app.vault.getFileByPath(${JSON.stringify(name)});if(f)await app.vault.delete(f);})()`);
  }
  // Undo only a type choice made by a previous run of this synthetic test.
  await evaluate(`app.metadataTypeManager.unsetType('目录专属')`);
  const fixture = await fs.readFile(path.join(root, 'tests/fixtures/catalog.html'), 'utf8');
  const a = writeMetadata(fixture, { ...readMetadata(fixture).properties, CaseKey: '大写键' });
  const b = writeMetadata(fixture, { CatalogState: 'HTML-B', casekey: '小写键' });
  await upsert('catalog.html', a);
  await upsert('catalog-b.htm', b);
  await upsert('catalog-control.md', '---\nCatalogState: Markdown\n目录对照专属: Markdown-only\n---\n合成目录统计对照。\n');

  const leafId = await evaluate(`(async()=>{for(const l of app.workspace.getLeavesOfType('all-properties'))l.detach();const l=app.workspace.getRightLeaf(false);await l.setViewState({type:'all-properties'});await l.loadIfDeferred();await app.workspace.revealLeaf(l);return l.id;})()`);
  view = `app.workspace.getLeafById(${JSON.stringify(leafId)}).view`;
  await count(3);
  assert.equal(await evaluate(`app.metadataTypeManager.getPropertyOccurrences().casekey`), 2);
  assert.deepEqual(await values(), ['HTML-A', 'HTML-B', 'Markdown']);
  await waitFor(`${view}.doms['目录专属']?.flairEl.textContent==='1'&&${view}.doms['目录列表']?.property.widget==='multitext'`, 'HTML-only native property rows and types');
  assert.deepEqual(await evaluate(`app.metadataCache.getFrontmatterPropertyValuesForKey('目录列表')`), ['甲', '乙']);
  record('native global directory merges HTML/HTM/Markdown counts, case-insensitive keys, types and scalar/list suggestions');

  const unrelated = await evaluate(`(()=>{const paths=[];app.metadataCache.iterateFileCache((p,c)=>{if(/\.html?$/i.test(p)&&c.frontmatter)paths.push(p);});return paths;})()`);
  assert.deepEqual(unrelated, []);
  record('general cache enumeration does not receive virtual HTML properties');

  const changed = writeMetadata(a, { CatalogState: 'HTML-A2', 新增目录项: true, CaseKey: '大写键' });
  await upsert('catalog.html', changed);
  await waitFor(`${view}.doms['新增目录项']?.flairEl.textContent==='1'&&!${view}.doms['目录专属']&&!${view}.doms['目录列表']`, 'native view refresh after key changes');
  assert.deepEqual(await values(), ['HTML-A2', 'HTML-B', 'Markdown']);
  record('external edits refresh native directory rows, counts and suggestions without manual view refresh');

  await evaluate(`app.vault.rename(app.vault.getFileByPath('catalog-b.htm'),'catalog-moved.htm')`);
  await flush();
  await count(3);
  assert.equal(await evaluate(`app.plugins.plugins['html-frontmatter'].snapshots.has('catalog-b.htm')`), false);
  assert.equal(await evaluate(`app.plugins.plugins['html-frontmatter'].snapshots.has('catalog-moved.htm')`), true);
  record('renaming HTML removes the old index path and never doubles its count');

  await evaluate(`app.vault.delete(app.vault.getFileByPath('catalog-moved.htm'))`);
  await flush();
  await count(2);
  assert.deepEqual(await values(), ['HTML-A2', 'Markdown']);
  record('deleting HTML removes its property occurrences and suggestion values');

  const region = readMetadata(changed).region;
  const invalid = changed.slice(0, region.contentStart) + '{invalid' + changed.slice(region.contentEnd);
  await upsert('catalog.html', invalid);
  await count(1);
  await waitFor(`!${view}.doms['新增目录项']`, 'invalid source removes stale directory data');
  assert.deepEqual(await values(), ['Markdown']);
  assert.equal(await fs.readFile(path.join(vault, 'catalog.html'), 'utf8'), invalid);
  record('invalid JSON removes stale catalog data while leaving the source untouched');
  await upsert('catalog.html', a);
  await count(2);

  restoreIgnore = true;
  await evaluate(`app.vault.setConfig('userIgnoreFilters',${JSON.stringify([...(originalIgnore ?? []), 'catalog.html'])})`);
  await waitFor(`app.metadataCache.isUserIgnored('catalog.html')`, 'native ignore rule');
  await count(1);
  assert.deepEqual(await values(), ['Markdown']);
  await evaluate(`app.vault.setConfig('userIgnoreFilters',${JSON.stringify(originalIgnore)})`);
  await flush();
  await count(2);
  restoreIgnore = false;
  record('native excluded-file rules remove HTML from the directory/counts/suggestions and restore it when cleared');

  const beforeMd = await fs.readFile(path.join(vault, 'catalog-control.md'), 'utf8');
  const blocked = await evaluate(`(async()=>{const v=${view};const row=v.doms.catalogstate;v.startRename(row);row.titleEl.textContent='CatalogRenamed';await v.acceptRename(row);let blocked=false;try{await v.deleteProperty(v.doms.catalogstate);}catch(e){blocked=e.message.includes('实验版暂不支持');}return {blocked,name:v.doms.catalogstate?.property.name};})()`);
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.name, 'CatalogState');
  assert.equal(await fs.readFile(path.join(vault, 'catalog.html'), 'utf8'), a);
  assert.equal(await fs.readFile(path.join(vault, 'catalog-control.md'), 'utf8'), beforeMd);
  record('native global rename/delete UI routes are blocked before any HTML or Markdown write');

  const batch = await evaluate(`(async()=>{const v=${view};const md=v.doms['目录对照专属'];const html=v.doms['目录专属'];v.tree.handleItemSelection(new MouseEvent('click',{altKey:true}),md);v.tree.handleItemSelection(new MouseEvent('click',{altKey:true}),html);const selected=v.tree.selectedDoms.size;let blocked=false;try{await v.deleteProperty(md);}catch(e){blocked=e.message.includes('整批阻止');}v.tree.clearSelectedDoms();return {selected,blocked};})()`);
  assert.deepEqual(batch, { selected: 2, blocked: true });
  assert.equal(await fs.readFile(path.join(vault, 'catalog.html'), 'utf8'), a);
  assert.equal(await fs.readFile(path.join(vault, 'catalog-control.md'), 'utf8'), beforeMd);
  record('mixed native multi-selection is blocked before its first Markdown-only deletion');

  await evaluate(`app.fileManager.renameProperty('目录对照专属','目录对照改名')`);
  await waitFor(`${view}.doms['目录对照改名']?.flairEl.textContent==='1'`, 'Markdown-only native global rename');
  await evaluate(`${view}.deleteProperty(${view}.doms['目录对照改名'])`);
  for (let i = 0; i < 80 && (await fs.readFile(path.join(vault, 'catalog-control.md'), 'utf8')).includes('目录对照改名'); i++) await sleep(100);
  assert.ok(!(await fs.readFile(path.join(vault, 'catalog-control.md'), 'utf8')).includes('目录对照改名'));
  assert.equal(await fs.readFile(path.join(vault, 'catalog.html'), 'utf8'), a);
  record('unselected Markdown-only global rename/delete remain functional without touching HTML');

  await evaluate(`(()=>{const row=${view}.doms['目录专属'];row.selfEl.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:900,clientY:250}));const sub=[...document.querySelectorAll('.menu-item-title')].find(e=>e.textContent==='属性类型');if(!sub)throw Error('Missing type menu');sub.closest('.menu-item').click();const text=[...document.querySelectorAll('.menu-item-title')].find(e=>e.textContent==='文本');if(!text)throw Error('Missing text type');text.closest('.menu-item').click();})()`);
  await waitFor(`app.metadataTypeManager.getAssignedWidget('目录专属')==='text'`, 'global native type selection');
  record('the native global directory can assign a persistent type to an HTML-only property');

  await evaluate(`app.plugins.disablePlugin('html-frontmatter')`);
  await count(1);
  assert.deepEqual(await values(), ['Markdown']);
  await waitFor(`!${view}.doms.casekey`, 'unload removes HTML-only automatic type rows');
  assert.equal(await fs.readFile(path.join(vault, 'catalog.html'), 'utf8'), a);
  record('unloading restores Markdown-only counts/suggestions and removes automatic HTML-only directory rows');

  await evaluate(`app.plugins.enablePlugin('html-frontmatter')`);
  await flush();
  await count(2);
  assert.deepEqual(await values(), ['HTML-A', 'Markdown']);
  record('re-enabling reconstructs the native directory from HTML files');

  const screenshot = await client.send('Page.captureScreenshot', { format: 'png' });
  await fs.writeFile(path.join(output, 'catalog.png'), Buffer.from(screenshot.data, 'base64'));
  await fs.writeFile(path.join(output, 'catalog.json'), JSON.stringify({ results, expected: { count: 2, values: ['HTML-A', 'Markdown'], types: { '目录专属': 'text', '目录列表': 'multitext' } } }, null, 2) + '\n');
  await fs.rm(path.join(output, 'catalog-failure.json'), { force: true });
  console.log(`Completed ${results.length} native catalog checks; restart remains separate.`);
} catch (error) {
  await fs.writeFile(path.join(output, 'catalog-failure.json'), JSON.stringify({ results, error: String(error) }, null, 2));
  throw error;
} finally {
  if (restoreIgnore) await evaluate(`app.vault.setConfig('userIgnoreFilters',${JSON.stringify(originalIgnore)})`).catch(() => {});
  client.close();
}
