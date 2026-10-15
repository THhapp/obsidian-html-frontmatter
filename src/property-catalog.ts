import type { CachedMetadata } from 'obsidian';
import { wrapMethod } from './compat.ts';
import { validateProperties } from './metadata.ts';
import type { Properties } from './metadata.ts';

export interface PropertyCache {
  iterateFileCache(callback: (path: string, cache: CachedMetadata) => void): void;
  getFrontmatterPropertyValuesForKey(key: string): string[];
  isUserIgnored(path: string): boolean;
}
export interface PropertyTypeManager {
  rebuildProperties(): void;
  getPropertyOccurrences(): Record<string, number>;
  trigger(event: 'changed'): void;
}
const isHtmlPath = (path: string) => /\.(html|htm)$/i.test(path);

/** Use native property rules without exposing virtual HTML to unrelated enumerators.
 * All three scoped native methods were checked to enumerate synchronously in 1.14.4.
 */
export class PropertyCatalog {
  private depth = 0;
  private restorers: (() => void)[] = [];
  private active = false;
  private cache: PropertyCache;
  private manager: PropertyTypeManager;
  private entries: () => Iterable<readonly [string, Properties]>;

  constructor(cache: PropertyCache, manager: PropertyTypeManager, entries: () => Iterable<readonly [string, Properties]>) {
    this.cache = cache;
    this.manager = manager;
    this.entries = entries;
  }

  install(): void {
    if (this.active) return;
    this.active = true;
    try {
      this.restorers.push(wrapMethod(this.cache, 'iterateFileCache', (receiver, original, [callback]) => {
        if (!this.depth) return original.call(receiver, callback);
        // Replace native HTML entries (if any), including stale or now-invalid data.
        original.call(receiver, (path: string, cache: CachedMetadata) => {
          if (!isHtmlPath(path)) callback(path, cache);
        });
        for (const [path, properties] of this.entries()) {
          if (isHtmlPath(path) && !this.cache.isUserIgnored(path)) {
            callback(path, { frontmatter: validateProperties(properties) } satisfies CachedMetadata);
          }
        }
      }));
      this.restorers.push(wrapMethod(this.manager, 'rebuildProperties', (receiver, original, args) =>
        this.withHtmlEntries(() => original.apply(receiver, args))));
      this.restorers.push(wrapMethod(this.manager, 'getPropertyOccurrences', (receiver, original, args) =>
        this.withHtmlEntries(() => original.apply(receiver, args))));
      this.restorers.push(wrapMethod(this.cache, 'getFrontmatterPropertyValuesForKey', (receiver, original, args) =>
        this.withHtmlEntries(() => original.apply(receiver, args))));
      // The manager registered its original rebuild function as an event listener
      // before plugin load. Wrapping the method alone cannot reach that callback.
      this.restorers.push(wrapMethod(this.manager, 'trigger', (receiver, original, args) => {
        if (args[0] !== 'changed') return original.apply(receiver, args);
        return this.withHtmlEntries(() => original.apply(receiver, args));
      }));
    } catch (error) { this.dispose(); throw error; }
  }

  private withHtmlEntries<T>(run: () => T): T {
    this.depth++;
    try { return run(); }
    finally { this.depth--; }
  }

  refresh(): void {
    if (this.active) this.manager.trigger('changed');
  }

  dispose(): void {
    const wasActive = this.active;
    this.active = false;
    for (const restore of this.restorers.splice(0).reverse()) restore();
    // Rebuild via restored native methods and redraw existing native property views.
    if (wasActive) this.manager.trigger('changed');
  }
}
