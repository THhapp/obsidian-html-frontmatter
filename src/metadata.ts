import { parse } from 'parse5';

export const METADATA_ID = 'obsidian-frontmatter';
export type PropertyValue = string | number | boolean | null | (string | number | boolean | null)[];
export type Properties = Record<string, PropertyValue>;
export interface MetadataDocument {
  properties: Properties;
  region: { start: number; end: number; contentStart: number; contentEnd: number } | null;
  insertionOffset: number;
}
export interface PropertyChange {
  key: string;
  beforeExists: boolean;
  before?: PropertyValue;
  afterExists: boolean;
  after?: PropertyValue;
}

export function validateProperties(value: unknown): Properties {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error('属性数据必须是 JSON 对象。');
  }
  const scalar = (item: unknown) => item === null || typeof item === 'string' || typeof item === 'boolean'
    || (typeof item === 'number' && Number.isFinite(item));
  for (const [key, item] of Object.entries(value)) {
    if (!key || ['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error(`不支持的属性名：${key}`);
    if (!(scalar(item) || (Array.isArray(item) && item.every(scalar)))) throw new Error(`不支持的属性值：${key}`);
    if (['tags', 'aliases', 'cssclasses'].includes(key) && !(Array.isArray(item) && item.every((v) => typeof v === 'string'))) {
      throw new Error(`${key} 必须是字符串列表。`);
    }
  }
  return JSON.parse(JSON.stringify(value)) as Properties;
}

export function readMetadata(source: string): MetadataDocument {
  const tree = parse(source, { sourceCodeLocationInfo: true });
  const matches: { node: any; parent: any }[] = [];
  let insertionOffset = 0;
  function walk(node: any, parent: any = null): void {
    const location = node.sourceCodeLocation;
    if (node.nodeName === '#documentType' && location) insertionOffset = Math.max(insertionOffset, location.endOffset);
    if (node.tagName === 'html' && location?.startTag) insertionOffset = Math.max(insertionOffset, location.startTag.endOffset);
    if (node.tagName === 'head' && location?.startTag) insertionOffset = Math.max(insertionOffset, location.startTag.endOffset);
    if (node.tagName === 'script' && node.attrs?.some((a: any) => a.name === 'id' && a.value === METADATA_ID)) matches.push({ node, parent });
    for (const child of node.childNodes ?? []) walk(child, node);
    // Template contents are not active document metadata.
  }
  walk(tree);
  if (matches.length > 1) throw new Error('发现重复的 HTML 属性数据块，已停止写入。');
  if (!matches.length) return { properties: {}, region: null, insertionOffset };
  const node = matches[0].node;
  const type = node.attrs.find((a: any) => a.name === 'type')?.value.toLowerCase();
  const location = node.sourceCodeLocation;
  if (type !== 'application/json' || !location?.startTag || !location?.endTag) throw new Error('HTML 属性数据块类型或结束标签不正确。');
  const content = source.slice(location.startTag.endOffset, location.endTag.startOffset);
  let value: unknown;
  try { value = JSON.parse(content); } catch { throw new Error('HTML 属性 JSON 无效，原文件未修改。'); }
  return {
    properties: validateProperties(value),
    region: { start: location.startOffset, end: location.endOffset, contentStart: location.startTag.endOffset, contentEnd: location.endTag.startOffset },
    insertionOffset,
  };
}

export function writeMetadata(source: string, value: unknown): string {
  const metadata = readMetadata(source);
  const properties = validateProperties(value);
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const json = JSON.stringify(properties, null, 2).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029').replace(/\n/g, eol);
  const content = eol + json + eol;
  if (metadata.region) return source.slice(0, metadata.region.contentStart) + content + source.slice(metadata.region.contentEnd);
  const block = `<script type="application/json" id="${METADATA_ID}">${content}</script>`;
  return source.slice(0, metadata.insertionOffset) + block + source.slice(metadata.insertionOffset);
}

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export function diffProperties(before: Properties, after: Properties): PropertyChange[] {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((key) =>
    Object.hasOwn(before, key) !== Object.hasOwn(after, key) || !equal(before[key], after[key]),
  ).map((key) => ({ key, beforeExists: Object.hasOwn(before, key), before: before[key], afterExists: Object.hasOwn(after, key), after: after[key] }));
}

export function applyChanges(source: string, changes: PropertyChange[]): string {
  const current = readMetadata(source).properties;
  for (const change of changes) {
    const exists = Object.hasOwn(current, change.key);
    const isBefore = exists === change.beforeExists && equal(current[change.key], change.before);
    const isAfter = exists === change.afterExists && equal(current[change.key], change.after);
    if (!isBefore && !isAfter) throw new Error(`属性“${change.key}”已被其他操作修改，请重新读取后编辑。`);
    if (change.afterExists) current[change.key] = change.after!;
    else delete current[change.key];
  }
  return changes.length ? writeMetadata(source, current) : source;
}
