import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyChanges, diffProperties, readMetadata, writeMetadata, validateProperties } from '../src/metadata.ts';

const source = '<!doctype html>\r\n<html><head><style>body{color:red}</style><script TYPE="application/json" id="obsidian-frontmatter">\r\n{"标题":"原始😀","章节":6,"完成":false,"tags":["课程/数据库"]}\r\n</script><script>window.keep = "<b>unchanged</b>";</script></head><body>正文😀<!-- keep --></body></html>';

test('existing metadata updates only its payload, preserving every other character', () => {
  const before = readMetadata(source);
  const next = writeMetadata(source, { 标题: '</script><img src=x>', 章节: 0, 完成: true, tags: ['课程/数据库', '理论'] });
  const after = readMetadata(next);
  assert.equal(next.slice(0, after.region!.contentStart), source.slice(0, before.region!.contentStart));
  assert.equal(next.slice(after.region!.contentEnd), source.slice(before.region!.contentEnd));
  assert.equal(after.properties.标题, '</script><img src=x>');
  assert.equal(after.properties.章节, 0);
  assert.equal(after.properties.完成, true);
  assert.ok(next.includes('\\u003c/script>'));
});

test('missing metadata can be initialized without changing the original surrounding source', () => {
  const input = '<!doctype html><html><head><title>标题</title></head><body>😀</body></html>';
  const next = writeMetadata(input, { tags: [], 空: '', 无: null, 零: 0, 否: false });
  const metadata = readMetadata(next);
  assert.equal(next.slice(0, metadata.region!.start) + next.slice(metadata.region!.end), input);
  assert.deepEqual(metadata.properties, { tags: [], 空: '', 无: null, 零: 0, 否: false });
});

test('comments and script strings are not mistaken for metadata elements', () => {
  const input = '<!doctype html><!-- <script id="obsidian-frontmatter" type="application/json">{}</script> --><script>const x = "obsidian-frontmatter";</script>';
  assert.equal(readMetadata(input).region, null);
});

test('invalid, duplicate and wrong-type metadata blocks cannot be overwritten', () => {
  for (const input of [
    '<script type="application/json" id="obsidian-frontmatter">bad</script>',
    '<script type="text/javascript" id="obsidian-frontmatter">{}</script>',
    '<script type="application/json" id="obsidian-frontmatter">{}</script>'.repeat(2),
    '<script type="application/json" id="obsidian-frontmatter">{"x":1}',
  ]) assert.throws(() => writeMetadata(input, { x: 2 }));
});

test('unsupported values and dangerous object keys are refused without coercion', () => {
  for (const value of [{ x: undefined }, { x: NaN }, { x: { nested: 1 } }, { tags: 'one' }, JSON.parse('{"__proto__":1}')]) {
    assert.throws(() => validateProperties(value));
  }
});

test('field-level changes preserve unrelated external edits', () => {
  const before = { a: 'old', b: 1 };
  const changes = diffProperties(before, { a: 'new', b: 1 });
  const latest = writeMetadata('<html><head></head></html>', { a: 'old', b: 2 });
  assert.deepEqual(readMetadata(applyChanges(latest, changes)).properties, { a: 'new', b: 2 });
});

test('conflicting edits to the same property do not overwrite the latest source', () => {
  const changes = diffProperties({ a: 'old' }, { a: 'new' });
  const latest = writeMetadata('<html></html>', { a: 'external' });
  assert.throws(() => applyChanges(latest, changes), /其他操作修改/);
});

test('delete and rename changes preserve missing versus null values', () => {
  const input = writeMetadata('<html></html>', { old: 1, nullable: null });
  const changes = diffProperties({ old: 1, nullable: null }, { renamed: 1, nullable: null });
  assert.deepEqual(readMetadata(applyChanges(input, changes)).properties, { nullable: null, renamed: 1 });
});

test('sequential and idempotent property patches can be applied safely', () => {
  const input = writeMetadata('<html></html>', { a: 1 });
  const first = diffProperties({ a: 1 }, { a: 2 });
  const second = diffProperties({ a: 2 }, { a: 3 });
  const once = applyChanges(input, first);
  assert.equal(applyChanges(once, first), once);
  assert.equal(readMetadata(applyChanges(once, second)).properties.a, 3);
});
