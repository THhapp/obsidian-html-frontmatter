/*
 * Read the locally installed Obsidian bundle and exercise its native graph
 * data builder in an isolated VM with synthetic inputs. No Obsidian process,
 * vault, plugin registry, or metadata database is changed by this script.
 * Extraction anchors are intentionally version-sensitive research tooling.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const asarFlag = process.argv.indexOf('--asar');
if (asarFlag < 0 || !process.argv[asarFlag + 1]) {
  throw new Error('Usage: node native-graph-contract.cjs --asar <installed-obsidian.asar>');
}
const asarPath = path.resolve(process.argv[asarFlag + 1]);
const bundle = fs.readFileSync(asarPath);
const headerSize = bundle.readUInt32LE(4);
const jsonSize = bundle.readUInt32LE(12);
assert.ok(jsonSize > 0 && jsonSize < bundle.length - 16, 'ASAR header bounds');
const header = JSON.parse(bundle.subarray(16, 16 + jsonSize).toString('utf8'));
const entry = header.files['app.js'];
assert.ok(entry && !entry.unpacked, 'Packed app.js exists');
const start = 8 + headerSize + Number(entry.offset);
assert.ok(start >= 0 && start + entry.size <= bundle.length, 'app.js bounds');
const appBytes = bundle.subarray(start, start + entry.size);
const source = appBytes.toString('utf8');

function extract(begin, end, skip = 0) {
  const from = source.indexOf(begin);
  assert.ok(from >= 0, `Extraction anchor exists: ${begin}`);
  assert.equal(source.indexOf(begin, from + begin.length), -1, 'Anchor is unique');
  const to = source.indexOf(end, from + begin.length);
  assert.ok(to > from, `Closing anchor exists: ${end}`);
  return source.slice(from + skip, to);
}

const graphSource = extract(
  'var c=function(e,t,n,i){var r=e.resolvedLinks',
  '(n.metadataCache,s,',
  'var c='.length,
);
const cacheSource = extract(
  'function(e){if(Wl(e)){var t=this.vault.externalFileManager.getLoadedFile(e);',
  ',t.prototype.getFileInfo=',
);
const getCacheSource = cacheSource.endsWith('}') ? cacheSource : null;
assert.ok(getCacheSource, 'getCache extraction ends at function boundary');
assert.ok(source.includes('Ax=Sx.concat(xx,Tx)'), 'Native attachment classifier anchor');
for (const marker of ['Sx=["md"]', 'xx=["canvas"]', 'Tx=["base"]']) {
  assert.ok(source.includes(marker), `Native note-like extension marker: ${marker}`);
}

const context = vm.createContext({
  Wl: () => false, // External-file paths are outside these synthetic cases.
  Tl: (value) => value.split('/').at(-1),
  Ll: (value) => value.split('.').at(-1),
  Lx: (value) => !['md', 'canvas', 'base'].includes(value.split('.').at(-1)),
  gZ: (type = '') => ({ type, links: {} }),
  _m: (metadata) => metadata?.tags?.map((item) => item.tag) ?? null,
  isBoolean: (value) => typeof value === 'boolean',
});
const graph = vm.runInContext(`(${graphSource})`, context, { timeout: 1000 });
const nativeGetCache = vm.runInContext(`(${getCacheSource})`, context, { timeout: 1000 });

const syntheticMetadata = {
  'Topic A.html': { tags: [{ tag: '#course/database' }] },
  'Topic B.html': { tags: [] },
  'Index.md': { tags: [{ tag: '#index' }] },
};
const syntheticFileCache = Object.fromEntries(
  Object.keys(syntheticMetadata).map((file) => [file, { hash: file }]),
);
const receiver = { fileCache: syntheticFileCache, metadataCache: syntheticMetadata };
const originalCache = (file) => nativeGetCache.call(receiver, file);
const overlayCache = (file) => file.endsWith('.html')
  ? syntheticMetadata[file]
  : originalCache(file);

function metadata({ cache = originalCache, htmlEdge = false } = {}) {
  return {
    vault: {},
    resolvedLinks: {
      'Index.md': { 'Topic A.html': 1 },
      ...(htmlEdge ? { 'Topic A.html': { 'Topic B.html': 1 } } : {}),
    },
    unresolvedLinks: {},
    getCachedFiles: () => Object.keys(syntheticMetadata),
    getCache: cache,
    getTags: () => ({ '#index': 1, '#course/database': 1 }),
    isUserIgnored: () => false,
  };
}
const options = { showAttachments: true, showTags: true, showOrphans: true, hideUnresolved: true };
const render = (cache, overrides = {}) => graph(cache, { ...options, ...overrides }, () => true, 0);
const cases = [];
function check(name, callback) {
  callback();
  cases.push({ name, passed: true });
}

check('Native getCache ignores stored HTML metadata', () => {
  assert.deepEqual(Object.keys(originalCache('Topic A.html')), []);
});
check('Native getCache retains Markdown metadata', () => {
  assert.equal(originalCache('Index.md'), syntheticMetadata['Index.md']);
});
check('Scoped overlay can expose HTML metadata without changing Markdown', () => {
  assert.equal(overlayCache('Topic A.html'), syntheticMetadata['Topic A.html']);
  assert.equal(overlayCache('Index.md'), originalCache('Index.md'));
});
check('Native graph accepts Markdown-to-HTML edges with attachments enabled', () => {
  assert.equal(render(metadata()).nodes['Index.md'].links['Topic A.html'], true);
});
check('HTML metadata alone does not generate HTML-to-HTML edges', () => {
  assert.equal(render(metadata({ cache: overlayCache })).nodes['Topic A.html'].links['Topic B.html'], undefined);
});
check('Resolved HTML edges are consumed by the unmodified native graph builder', () => {
  assert.equal(render(metadata({ htmlEdge: true })).nodes['Topic A.html'].links['Topic B.html'], true);
});
check('Resolved edges alone do not expose HTML tag edges', () => {
  assert.equal(render(metadata({ htmlEdge: true })).nodes['Topic A.html'].links['#course/database'], undefined);
});
check('HTML metadata overlay supplies tag nodes and tag edges', () => {
  const result = render(metadata({ htmlEdge: true, cache: overlayCache }));
  assert.equal(result.nodes['Topic A.html'].links['#course/database'], true);
  assert.equal(result.nodes['#course/database'].type, 'tag');
});
check('Disabling attachments excludes HTML nodes and incoming HTML edges', () => {
  const result = render(metadata({ htmlEdge: true, cache: overlayCache }), { showAttachments: false });
  assert.equal(result.nodes['Topic A.html'], undefined);
  assert.equal(result.nodes['Index.md'].links['Topic A.html'], undefined);
});
check('Disabling tags leaves file edges intact and removes tag nodes', () => {
  const result = render(metadata({ htmlEdge: true, cache: overlayCache }), { showTags: false });
  assert.equal(result.nodes['Topic A.html'].links['Topic B.html'], true);
  assert.equal(result.nodes['#course/database'], undefined);
});

console.log(JSON.stringify({
  inspectedBundle: path.basename(asarPath),
  appJsSha256: crypto.createHash('sha256').update(appBytes).digest('hex'),
  extractionOffsets: {
    graphBuilder: source.indexOf('var c=function(e,t,n,i){var r=e.resolvedLinks'),
    getCache: source.indexOf('function(e){if(Wl(e)){var t=this.vault.externalFileManager.getLoadedFile(e);'),
  },
  result: `${cases.length}/${cases.length} passed`,
  cases,
  limitations: [
    'Offline execution of two extracted native functions with synthetic inputs and mocked helpers.',
    'Not an installed plugin, live cache injection, graph UI test, or mobile compatibility test.',
    'Lifecycle, rename rewriting, graph filters and compatibility with other patches remain unverified.',
  ],
}, null, 2));
