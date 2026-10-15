import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readMetadata } from '../../src/metadata.ts';
import { connect } from './cdp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const vault = path.join(root, 'test-vault');
const output = path.join(root, 'tmp/e2e');
await fs.mkdir(output, { recursive: true });
const client = await connect();
const results = [];
const evaluate = (expression) => client.evaluate(expression);
const source = () => fs.readFile(path.join(vault, 'sample.html'), 'utf8');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const record = (name) => { results.push({ name, passed: true }); console.log(`PASS ${name}`); };
const settle = () => evaluate(`app.plugins.plugins['html-frontmatter']?.flush()`);
async function waitProperties(predicate, description) {
  for (let attempt = 0; attempt < 80; attempt++) {
    const properties = readMetadata(await source()).properties;
    if (predicate(properties)) return properties;
    await sleep(100);
  }
  throw new Error(`Timed out: ${description}; actual=${JSON.stringify(readMetadata(await source()).properties)}`);
}
async function focusField(key, selector) {
  return evaluate(`(() => {
    const row=[...document.querySelectorAll('.metadata-property')].find(e=>e.dataset.propertyKey===${JSON.stringify(key)});
    const input=row?.querySelector(${JSON.stringify(selector)});
    if(!input)throw Error('Missing native field: '+${JSON.stringify(key)});
    input.focus();
    if(document.activeElement!==input)throw Error('Native field is not visible/focusable: '+${JSON.stringify(key)});
    if(input instanceof HTMLInputElement) input.select();
    else {const range=document.createRange();range.selectNodeContents(input);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);}
    return true;
  })()`);
}
async function key(name, code) {
  await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code: name, windowsVirtualKeyCode: code });
  await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code: name, windowsVirtualKeyCode: code });
}
async function enterField(keyName, selector, text) {
  await focusField(keyName, selector);
  await client.send('Input.insertText', { text });
  await key('Tab', 9);
}

try {
  const actual = await evaluate(`({path:app.vault.adapter.basePath,plugins:Object.keys(app.plugins.plugins),htmlHandler:app.viewRegistry.typeByExtension.html??null})`);
  assert.equal(path.resolve(actual.path), vault, 'Never run against a personal vault');
  assert.deepEqual(actual.plugins, ['html-frontmatter']);
  assert.equal(actual.htmlHandler, null);
  record('isolated vault has only this community plugin and no HTML renderer');

  await evaluate(`app.workspace.getLeavesOfType('file-properties').forEach(leaf=>leaf.detach())`);
  await settle();
  for (const name of ['sample.html', 'control.md']) {
    const fixture = await fs.readFile(path.join(root, 'tests/fixtures', name), 'utf8');
    await evaluate(`app.vault.modify(app.vault.getFileByPath(${JSON.stringify(name)}),${JSON.stringify(fixture)})`);
  }
  await settle();

  await client.send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 850, deviceScaleFactor: 1, mobile: false });
  await client.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  const initial = await source();
  const before = readMetadata(initial);
  await evaluate(`app.plugins.plugins['html-frontmatter'].openProperties(app.vault.getFileByPath('sample.html'))`);
  const controls = await evaluate(`Object.fromEntries([...document.querySelectorAll('.metadata-property')].map(e=>[e.dataset.propertyKey,e.querySelector('.metadata-property-value')?.dataset.propertyType]))`);
  assert.deepEqual(controls, { 标题: 'text', 章节: 'number', 完成: 'checkbox', tags: 'tags' });
  record('real native property controls infer text, number, checkbox and tags');

  await enterField('标题', '.metadata-input-longtext', '原生面板修改😀');
  await waitProperties((p) => p.标题 === '原生面板修改😀', 'native text edit');
  record('native text editing writes JSON metadata');

  await enterField('章节', 'input[type=number]', '9');
  await waitProperties((p) => p.章节 === 9, 'native number edit');
  record('native number editing preserves number type');

  await evaluate(`document.querySelector('[data-property-key="完成"] input[type="checkbox"]').click()`);
  await waitProperties((p) => p.完成 === true, 'native checkbox edit');
  record('native checkbox editing preserves boolean type');

  await focusField('tags', '.multi-select-input');
  await client.send('Input.insertText', { text: '复习/重点' });
  await key('Enter', 13);
  await key('Tab', 9);
  await waitProperties((p) => p.tags.includes('复习/重点'), 'native tag edit');
  record('native tag input adds a nested tag');
  await settle();

  await evaluate(`document.querySelector('.metadata-add-button').click()`);
  await enterField('', '.metadata-property-key-input', '临时属性');
  await waitProperties((p) => Object.hasOwn(p, '临时属性'), 'native property addition');
  await settle();
  await sleep(150); // Native key suggestions defer focus to the new value control.
  await enterField('临时属性', '.metadata-property-key-input', '改名属性');
  await waitProperties((p) => Object.hasOwn(p, '改名属性') && !Object.hasOwn(p, '临时属性'), 'native property rename');
  await settle();
  await sleep(150);
  await evaluate(`document.querySelector('[data-property-key="改名属性"]').focus()`);
  await key('Delete', 46);
  await waitProperties((p) => !Object.hasOwn(p, '改名属性'), 'native property deletion');
  record('native UI adds, renames and deletes a single-file property');
  await settle();

  const edited = await source();
  const after = readMetadata(edited);
  assert.equal(edited.slice(0, after.region.contentStart), initial.slice(0, before.region.contentStart));
  assert.equal(edited.slice(after.region.contentEnd), initial.slice(before.region.contentEnd));
  record('all source characters outside metadata payload remain unchanged');

  await evaluate(`(async()=>{const leaf=app.workspace.getLeavesOfType('file-properties')[0];await leaf.setViewState({type:'empty'});await app.plugins.plugins['html-frontmatter'].openProperties(app.vault.getFileByPath('sample.html'));})()`);
  const reopened = await evaluate(`app.workspace.getLeavesOfType('file-properties')[0].view.frontmatter`);
  assert.deepEqual(reopened, after.properties);
  record('closing and reopening the native panel preserves saved properties');

  const external = edited.replace('原生面板修改😀', '外部更新');
  await evaluate(`app.vault.modify(app.vault.getFileByPath('sample.html'),${JSON.stringify(external)})`);
  await settle();
  for (let i = 0; i < 80; i++) {
    const title = await evaluate(`app.workspace.getLeavesOfType('file-properties').find(l=>l.view.file?.path==='sample.html').view.frontmatter?.标题`);
    if (title === '外部更新') break;
    await sleep(100);
  }
  assert.equal(await evaluate(`app.metadataCache.getFileCache(app.vault.getFileByPath('sample.html')).frontmatter.标题`), '外部更新');
  assert.equal(await evaluate(`app.workspace.getLeavesOfType('file-properties').find(l=>l.view.file?.path==='sample.html').view.frontmatter?.标题`), '外部更新');
  await evaluate(`app.fileManager.processFrontMatter(app.vault.getFileByPath('sample.html'),data=>{data.标题='原生面板修改😀';})`);
  await settle();
  assert.equal(await source(), edited);
  record('external source changes refresh the panel/cache and processFrontMatter writes HTML safely');

  const invalid = edited.slice(0, after.region.contentStart) + '{broken' + edited.slice(after.region.contentEnd);
  await evaluate(`app.vault.modify(app.vault.getFileByPath('sample.html'),${JSON.stringify(invalid)})`);
  await settle();
  const refused = await evaluate(`(async()=>{let count=0;const p=app.plugins.plugins['html-frontmatter'];const f=app.vault.getFileByPath('sample.html');for(const action of [()=>p.openProperties(f),()=>app.fileManager.processFrontMatter(f,d=>{d.标题='不可写入';})]){try{await action();}catch(e){if(e.message.includes('JSON 无效'))count++;}}return count;})()`);
  assert.equal(refused, 2);
  assert.equal(await source(), invalid);
  await evaluate(`app.vault.modify(app.vault.getFileByPath('sample.html'),${JSON.stringify(edited)})`);
  await settle();
  await evaluate(`app.plugins.plugins['html-frontmatter'].openProperties(app.vault.getFileByPath('sample.html'))`);
  record('invalid JSON is refused by both panel opening and API writing without overwriting it');

  const originalMd = await fs.readFile(path.join(vault, 'control.md'), 'utf8');
  const blocked = await evaluate(`(async()=>{const outcomes=[];for(const name of ['renameProperty','deleteProperty']){try{await app.fileManager[name]('章节','单元');outcomes.push(false);}catch(e){outcomes.push(e.message.includes('实验版暂不支持'));}}return outcomes;})()`);
  assert.deepEqual(blocked, [true, true]);
  assert.equal(await source(), edited);
  assert.equal(await fs.readFile(path.join(vault, 'control.md'), 'utf8'), originalMd);
  record('unsupported global operations are blocked before changing HTML or Markdown');

  const screenshot = await client.send('Page.captureScreenshot', { format: 'png' });
  await fs.writeFile(path.join(output, 'native-html-properties.png'), Buffer.from(screenshot.data, 'base64'));

  await evaluate(`(async()=>{await app.plugins.plugins['html-frontmatter'].flush();await app.plugins.disablePlugin('html-frontmatter');})()`);
  const unloaded = await evaluate(`({pluginPresent:!!app.plugins.plugins['html-frontmatter'],cache:app.metadataCache.getCache('sample.html')})`);
  assert.equal(unloaded.pluginPresent, false);
  assert.deepEqual(unloaded.cache, {});
  assert.equal(await source(), edited);
  await evaluate(`(async()=>{const leaf=app.workspace.getLeavesOfType('file-properties')[0];await leaf.setViewState({type:'file-properties',state:{file:'control.md'}});})()`);
  await enterField('标题', '.metadata-input-longtext', '插件停用后仍可编辑');
  for (let i = 0; i < 60 && !(await fs.readFile(path.join(vault, 'control.md'), 'utf8')).includes('插件停用后仍可编辑'); i++) await sleep(100);
  assert.ok((await fs.readFile(path.join(vault, 'control.md'), 'utf8')).includes('插件停用后仍可编辑'));
  record('unloading restores native cache and native Markdown UI editing remains functional');

  await evaluate(`app.plugins.enablePlugin('html-frontmatter')`);
  await evaluate(`app.plugins.plugins['html-frontmatter'].openProperties(app.vault.getFileByPath('sample.html'))`);
  assert.deepEqual(await evaluate(`app.workspace.getLeavesOfType('file-properties').find(leaf=>leaf.view.file?.path==='sample.html').view.frontmatter`), after.properties);
  record('plugin re-enable restores HTML properties without a renderer');

  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ results, expectedAfterRestart: after.properties, screenshots: ['native-html-properties.png'] }, null, 2) + '\n');
  await fs.rm(path.join(output, 'failure.json'), { force: true });
  console.log(`Completed ${results.length} live checks; restart validation remains separate.`);
} catch (error) {
  await fs.writeFile(path.join(output, 'failure.json'), JSON.stringify({ results, error: String(error) }, null, 2));
  throw error;
} finally { client.close(); }
