import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readMetadata } from '../../src/metadata.ts';
import { connect } from './cdp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const vault = path.join(root, 'test-vault');
const output = path.join(root, 'tmp/e2e');
const client = await connect();
const evaluate = (expression) => client.evaluate(expression);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];
const record = (name) => { results.push({ name, passed: true }); console.log(`PASS ${name}`); };
const panel = `app.workspace.getLeavesOfType('file-properties').find(l=>l.view.file?.path==='types.html').view`;
const read = (name = 'types.html') => fs.readFile(path.join(vault, name), 'utf8');
const flush = () => evaluate(`app.plugins.plugins['html-frontmatter'].flush()`);
async function waitFor(expression, description) {
  for (let i = 0; i < 80; i++) {
    if (await evaluate(expression)) return;
    await sleep(100);
  }
  throw new Error(`Timed out: ${description}`);
}
async function key(name, code) {
  await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code: name, windowsVirtualKeyCode: code });
  await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code: name, windowsVirtualKeyCode: code });
}
async function focus(keyName, selector, file = 'types.html') {
  await evaluate(`(() => {
    const view=app.workspace.getLeavesOfType('file-properties').find(l=>l.view.file?.path===${JSON.stringify(file)}).view;
    const row=[...view.containerEl.querySelectorAll('.metadata-property')].find(e=>e.dataset.propertyKey===${JSON.stringify(keyName)});
    const input=row?.querySelector(${JSON.stringify(selector)});
    if(!input)throw Error('Missing native input');
    input.focus();
    if(document.activeElement!==input)throw Error('Native input is not focusable');
    if(input instanceof HTMLInputElement)input.select();
    else {const range=document.createRange();range.selectNodeContents(input);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);}
  })()`);
}
async function selectType(keyName, label, type) {
  await evaluate(`(() => {
    const view=${panel};
    const row=[...view.containerEl.querySelectorAll('.metadata-property')].find(e=>e.dataset.propertyKey===${JSON.stringify(keyName)});
    row.querySelector('.metadata-property-icon').click();
    const menu=[...document.querySelectorAll('.menu-item-title')].find(e=>e.textContent==='属性类型');
    if(!menu)throw Error('Missing native property type menu');
    menu.closest('.menu-item').click();
    const item=[...document.querySelectorAll('.menu-item-title')].find(e=>e.textContent===${JSON.stringify(label)});
    if(!item)throw Error('Missing requested native type');
    item.closest('.menu-item').click();
  })()`);
  await waitFor(`app.metadataTypeManager.getAssignedWidget(${JSON.stringify(keyName)})===${JSON.stringify(type)}`, `assigned ${type}`);
}
async function fillDate(keyName, inputType, value, expected = value) {
  // Chromium date inputs use segmented editing. Like browser fill(), set the native
  // input value and dispatch its DOM events; never call our metadata writer here.
  await evaluate(`(() => {
    const row=[...(${panel}).containerEl.querySelectorAll('.metadata-property')].find(e=>e.dataset.propertyKey===${JSON.stringify(keyName)});
    const input=row.querySelector('input[type="${inputType}"]');
    if(!input)throw Error('Missing date control');
    input.focus();input.value=${JSON.stringify(value)};
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.dispatchEvent(new Event('change',{bubbles:true}));input.blur();
  })()`);
  await flush();
  assert.equal(readMetadata(await read()).properties[keyName], expected);
}

try {
  const actual = await evaluate(`({path:app.vault.adapter.basePath,plugins:Object.keys(app.plugins.plugins)})`);
  assert.equal(path.resolve(actual.path), vault, 'Never run against a personal vault');
  assert.deepEqual(actual.plugins, ['html-frontmatter']);
  await fs.mkdir(output, { recursive: true });
  await client.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await evaluate(`app.workspace.getLeavesOfType('file-properties').forEach(l=>l.detach())`);
  await flush();
  for (const name of ['types.html', 'types-control.md']) {
    const fixture = await fs.readFile(path.join(root, 'tests/fixtures', name), 'utf8');
    await evaluate(`(async()=>{const f=app.vault.getFileByPath(${JSON.stringify(name)});if(f)await app.vault.modify(f,${JSON.stringify(fixture)});else await app.vault.create(${JSON.stringify(name)},${JSON.stringify(fixture)});})()`);
  }
  await flush();
  const initial = await read();
  await evaluate(`app.plugins.plugins['html-frontmatter'].openProperties(app.vault.getFileByPath('types.html'))`);

  await selectType('主题', '列表', 'multitext');
  await focus('主题', '.multi-select-input');
  await client.send('Input.insertText', { text: '范式' });
  await key('Enter', 13);
  await key('Tab', 9);
  await flush();
  assert.deepEqual(readMetadata(await read()).properties.主题, ['函数依赖', '范式']);
  record('native list type selection and editing preserve a string list');

  await selectType('复习日期', '日期', 'date');
  await fillDate('复习日期', 'date', '2026-10-20');
  record('native date control saves an ISO date without timezone conversion');

  await selectType('记录时间', '日期 & 时间', 'datetime');
  await fillDate('记录时间', 'datetime-local', '2026-10-20T21:45', '2026-10-20T21:45:00');
  record('native datetime control saves local date/time without timezone conversion');

  const expectedTypes = { 主题: 'multitext', 复习日期: 'date', 记录时间: 'datetime' };
  const viewTypes = await evaluate(`Object.fromEntries([...(${panel}).containerEl.querySelectorAll('.metadata-property')].map(e=>[e.dataset.propertyKey,e.querySelector('.metadata-property-value')?.dataset.propertyType]))`);
  for (const [name, type] of Object.entries(expectedTypes)) assert.equal(viewTypes[name], type);

  await focus('标题', '.metadata-input-longtext');
  const rapidTitle = '连续输入不会丢字0123456789';
  for (const text of rapidTitle) await client.send('Input.insertText', { text });
  await key('Tab', 9);
  await flush();
  assert.equal(readMetadata(await read()).properties.标题, rapidTitle);
  record('rapid native text input preserves every character');

  await evaluate(`(async()=>{const f=app.vault.getFileByPath('types.html');await Promise.all(Array.from({length:30},(_,i)=>app.fileManager.processFrontMatter(f,d=>{d.序号=i+1;})));})()`);
  assert.equal(readMetadata(await read()).properties.序号, 30);
  record('30 queued property writes retain the final value');

  const expectedHtml = await read();
  await evaluate(`(async()=>{const leaf=app.workspace.getLeavesOfType('file-properties').find(l=>l.view.file?.path==='types.html');await leaf.setViewState({type:'file-properties',state:{file:'types-control.md'}});await app.workspace.revealLeaf(leaf);})()`);
  const mdTypes = await evaluate(`Object.fromEntries([...app.workspace.getLeavesOfType('file-properties').find(l=>l.view.file?.path==='types-control.md').view.containerEl.querySelectorAll('.metadata-property')].map(e=>[e.dataset.propertyKey,e.querySelector('.metadata-property-value')?.dataset.propertyType]))`);
  for (const [name, type] of Object.entries(expectedTypes)) assert.equal(mdTypes[name], type);
  record('HTML and Markdown use the same explicitly assigned native property types');

  await focus('标题', '.metadata-input-longtext', 'types-control.md');
  await client.send('Input.insertText', { text: '切到 Markdown 后编辑' });
  await key('Tab', 9);
  for (let i = 0; i < 80 && !(await read('types-control.md')).includes('切到 Markdown 后编辑'); i++) await sleep(100);
  assert.ok((await read('types-control.md')).includes('切到 Markdown 后编辑'));
  assert.equal(await read(), expectedHtml);

  await evaluate(`app.plugins.plugins['html-frontmatter'].openProperties(app.vault.getFileByPath('types.html'))`);
  await focus('标题', '.metadata-input-longtext');
  await client.send('Input.insertText', { text: '切回 HTML 后编辑' });
  await key('Tab', 9);
  await flush();
  assert.equal(readMetadata(await read()).properties.标题, '切回 HTML 后编辑');
  assert.ok((await read('types-control.md')).includes('切到 Markdown 后编辑'));
  record('switching the same native panel between HTML and Markdown writes only the selected file');

  const finalSource = await read();
  const before = readMetadata(initial).region;
  const after = readMetadata(finalSource).region;
  assert.equal(finalSource.slice(0, after.contentStart), initial.slice(0, before.contentStart));
  assert.equal(finalSource.slice(after.contentEnd), initial.slice(before.contentEnd));
  assert.equal(await evaluate(`window.__extendedBodyExecuted!==undefined`), false);
  record('extended edits preserve all content outside JSON and never execute HTML');

  const savedTypes = JSON.parse(await fs.readFile(path.join(vault, '.obsidian/types.json'), 'utf8')).types;
  for (const [name, type] of Object.entries(expectedTypes)) assert.equal(savedTypes[name], type);
  record('explicit native type choices persist in the test vault type configuration');

  const expectedAfterRestart = readMetadata(finalSource).properties;
  const screenshot = await client.send('Page.captureScreenshot', { format: 'png' });
  await fs.writeFile(path.join(output, 'extended-properties.png'), Buffer.from(screenshot.data, 'base64'));
  await fs.writeFile(path.join(output, 'extended.json'), JSON.stringify({ results, expectedAfterRestart, expectedTypes }, null, 2) + '\n');
  await fs.rm(path.join(output, 'extended-failure.json'), { force: true });
  console.log(`Completed ${results.length} extended live checks; restart remains separate.`);
} catch (error) {
  await fs.writeFile(path.join(output, 'extended-failure.json'), JSON.stringify({ results, error: String(error) }, null, 2));
  throw error;
} finally { client.close(); }
