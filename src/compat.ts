import type { ItemView, TFile, View } from 'obsidian';
import type { Properties } from './metadata.ts';

export interface PropertiesView extends ItemView {
  file: TFile | null;
  modifyingFile: TFile | null;
  frontmatter: Properties | null;
  rawFrontmatter: string | null;
  isSupportedFile(file: TFile | null): boolean;
  updateFrontmatter(file: TFile | null, source: string): void;
  saveFrontmatter(data: Properties): void;
  requestUpdate(): void;
  update(): void;
  metadataEditor: { synchronize(data: Properties | null): void; addProperty(): void };
}

export interface PropertyRow { property: { name: string } }
export interface AllPropertiesView extends ItemView {
  tree: { selectedDoms: Set<PropertyRow> };
  deleteProperty(row: PropertyRow): Promise<void>;
}
export function isAllPropertiesView(view: View): view is AllPropertiesView {
  const candidate = view as Partial<AllPropertiesView>;
  return view.getViewType() === 'all-properties' && typeof candidate.deleteProperty === 'function'
    && candidate.tree?.selectedDoms instanceof Set;
}

// All untyped native method wrapping is kept at this compatibility boundary.
type Method = (...args: any[]) => any;
export function wrapMethod(target: any, name: string, handler: (receiver: any, original: Method, args: any[]) => any): () => void {
  const original = target[name];
  if (typeof original !== 'function') throw new Error(`Obsidian 接口不匹配：${name}`);
  let enabled = true;
  function replacement(this: any, ...args: any[]): any {
    return enabled ? handler(this, original, args) : original.apply(this, args);
  }
  target[name] = replacement;
  return () => {
    enabled = false;
    if (target[name] === replacement) target[name] = original;
  };
}

export function isPropertiesView(view: View): view is PropertiesView {
  const candidate = view as Partial<PropertiesView>;
  return view.getViewType() === 'file-properties' && ['isSupportedFile', 'updateFrontmatter', 'saveFrontmatter', 'requestUpdate', 'update']
    .every((key) => typeof (candidate as any)[key] === 'function');
}
