import type { App, DataWriteOptions, EventRef, ItemView, TFile, View } from 'obsidian';
import type { Properties } from './metadata.ts';
import type { PropertyCache, PropertyTypeManager } from './property-catalog.ts';

interface PropertyFileManager {
  renameProperty(name: string, newName: string): Promise<void>;
  deleteProperty(name: string): Promise<void>;
  processFrontMatter(file: TFile, callback: (properties: Properties) => void, options?: DataWriteOptions): Promise<void>;
}

interface PropertiesInternals {
  metadataCache: PropertyCache;
  metadataTypeManager: PropertyTypeManager;
  fileManager: PropertyFileManager;
  vault: { on(event: 'config-changed', callback: (key: string) => void): EventRef };
  internalPlugins: { getEnabledPluginById(id: string): unknown };
}

// Version-specific native interfaces, checked against Obsidian 1.14.4.
// Keep assertions for non-public APIs inside this compatibility boundary.
export function getPropertiesInternals(app: App): PropertiesInternals {
  return app as unknown as PropertiesInternals;
}

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

type Method = (...args: never[]) => unknown;
type MethodKeys<T> = { [K in keyof T]-?: T[K] extends Method ? K : never }[keyof T];
type NativeMethod<T, K extends keyof T> = Extract<T[K], Method>;
type WrappedMethod<T, K extends keyof T> = (this: T, ...args: Parameters<NativeMethod<T, K>>) => ReturnType<NativeMethod<T, K>>;

// Preserve each native method's receiver, argument tuple and return type.
export function wrapMethod<T extends object, K extends MethodKeys<T>>(
  target: T,
  name: K,
  handler: (receiver: T, original: WrappedMethod<T, K>, args: Parameters<NativeMethod<T, K>>) => ReturnType<NativeMethod<T, K>>,
): () => void {
  const method = target[name];
  if (typeof method !== 'function') throw new Error(`Obsidian 接口不匹配：${String(name)}`);
  const original = method as WrappedMethod<T, K>;
  let enabled = true;
  function replacement(this: T, ...args: Parameters<NativeMethod<T, K>>): ReturnType<NativeMethod<T, K>> {
    return enabled ? handler(this, original, args) : original.apply(this, args);
  }
  target[name] = replacement as T[K];
  return () => {
    enabled = false;
    if (target[name] === replacement) target[name] = method;
  };
}

export function isPropertiesView(view: View): view is PropertiesView {
  const candidate = view as Partial<PropertiesView>;
  const methods = ['isSupportedFile', 'updateFrontmatter', 'saveFrontmatter', 'requestUpdate', 'update'] as const;
  return view.getViewType() === 'file-properties' && methods.every((key) => typeof candidate[key] === 'function');
}
