import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CachedMetadata } from 'obsidian';
import { PropertyCatalog } from '../src/property-catalog.ts';
import type { PropertyCache, PropertyTypeManager } from '../src/property-catalog.ts';
import type { Properties } from '../src/metadata.ts';

function environment() {
  const base: [string, CachedMetadata][] = [
    ['control.md', { frontmatter: { shared: 'Markdown' } }],
    ['note.html', { frontmatter: { stale: 'old native HTML entry' } }],
  ];
  const html = new Map<string, Properties>([['note.html', { shared: 'HTML', fresh: 1 }]]);
  const ignored = new Set<string>();
  const cache: PropertyCache = {
    iterateFileCache(callback) { for (const [path, data] of base) callback(path, structuredClone(data)); },
    isUserIgnored(path) { return ignored.has(path); },
    getFrontmatterPropertyValuesForKey(key) {
      const values = new Set<string>();
      this.iterateFileCache((_, data) => { const value = data.frontmatter?.[key]; if (typeof value === 'string') values.add(value); });
      return [...values].sort();
    },
  };
  let directory: string[] = [];
  const manager: PropertyTypeManager = {
    rebuildProperties() { directory = []; cache.iterateFileCache((path) => { directory.push(path); }); },
    getPropertyOccurrences() {
      const counts: Record<string, number> = {};
      cache.iterateFileCache((_, data) => { for (const key of Object.keys(data.frontmatter ?? {})) counts[key] = (counts[key] ?? 0) + 1; });
      return counts;
    },
    trigger() { this.rebuildProperties(); },
  };
  const catalog = new PropertyCatalog(cache, manager, () => html.entries());
  const paths = () => { const result: string[] = []; cache.iterateFileCache((path) => { result.push(path); }); return result; };
  return { cache, manager, html, ignored, catalog, paths, directory: () => directory };
}

test('property queries replace stale native HTML once, without exposing virtual entries to general enumeration', () => {
  const e = environment();
  e.html.set('second.HTM', { shared: 'HTML 2' });
  e.catalog.install();
  assert.deepEqual(e.paths(), ['control.md', 'note.html']);
  assert.deepEqual(e.manager.getPropertyOccurrences(), { shared: 3, fresh: 1 });
  assert.deepEqual(e.cache.getFrontmatterPropertyValuesForKey('shared'), ['HTML', 'HTML 2', 'Markdown']);
  e.catalog.refresh();
  assert.deepEqual(e.directory(), ['control.md', 'note.html', 'second.HTM']);
  assert.deepEqual(e.paths(), ['control.md', 'note.html']);
  e.catalog.dispose();
});

test('ignored, removed and newly added HTML are reflected by the next property query', () => {
  const e = environment();
  e.catalog.install();
  e.ignored.add('note.html');
  assert.deepEqual(e.manager.getPropertyOccurrences(), { shared: 1 });
  e.ignored.clear();
  e.html.delete('note.html');
  e.html.set('renamed.html', { added: false });
  e.catalog.refresh();
  assert.deepEqual(e.manager.getPropertyOccurrences(), { shared: 1, added: 1 });
  assert.deepEqual(e.directory(), ['control.md', 'renamed.html']);
  e.catalog.dispose();
});

test('pre-registered rebuild listeners see HTML during native changed events', () => {
  const e = environment();
  const listener = e.manager.rebuildProperties;
  e.manager.trigger = () => { listener.call(e.manager); };
  e.html.set('new.htm', { onlyHtml: true });
  e.catalog.install();
  e.catalog.refresh();
  assert.deepEqual(e.directory(), ['control.md', 'note.html', 'new.htm']);
  assert.deepEqual(e.paths(), ['control.md', 'note.html']);
  e.catalog.dispose();
  assert.deepEqual(e.directory(), ['control.md', 'note.html']);
});

test('errors in a scoped consumer never leave virtual enumeration enabled', () => {
  const e = environment();
  e.manager.rebuildProperties = () => { e.cache.iterateFileCache(() => { throw new Error('consumer failed'); }); };
  e.catalog.install();
  assert.throws(() => e.manager.rebuildProperties(), /consumer failed/);
  assert.deepEqual(e.paths(), ['control.md', 'note.html']);
  // Keep teardown separate from the deliberately failing consumer.
  e.manager.trigger = () => {};
  e.catalog.dispose();
});

test('dispose restores method identities and rebuilds the native-only directory', () => {
  const e = environment();
  const iterate = e.cache.iterateFileCache;
  const values = e.cache.getFrontmatterPropertyValuesForKey;
  const rebuild = e.manager.rebuildProperties;
  const counts = e.manager.getPropertyOccurrences;
  e.catalog.install();
  e.catalog.refresh();
  e.catalog.dispose();
  assert.equal(e.cache.iterateFileCache, iterate);
  assert.equal(e.cache.getFrontmatterPropertyValuesForKey, values);
  assert.equal(e.manager.rebuildProperties, rebuild);
  assert.equal(e.manager.getPropertyOccurrences, counts);
  assert.deepEqual(e.directory(), ['control.md', 'note.html']);
  assert.deepEqual(e.manager.getPropertyOccurrences(), { shared: 1, stale: 1 });
});

test('an incompatible method causes installation to restore earlier wrappers', () => {
  const e = environment();
  const iterate = e.cache.iterateFileCache;
  const rebuild = e.manager.rebuildProperties;
  (e.manager as unknown as Record<string, unknown>).getPropertyOccurrences = undefined;
  assert.throws(() => e.catalog.install(), /接口不匹配/);
  assert.equal(e.cache.iterateFileCache, iterate);
  assert.equal(e.manager.rebuildProperties, rebuild);
});
