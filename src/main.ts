import { Plugin, TFile, Notice, FuzzySuggestModal, apiVersion } from 'obsidian';
import type { App, CachedMetadata } from 'obsidian';
import { applyChanges, diffProperties, readMetadata, validateProperties, writeMetadata } from './metadata.ts';
import type { Properties, PropertyChange } from './metadata.ts';
import { getPropertiesInternals, isPropertiesView, isAllPropertiesView, wrapMethod } from './compat.ts';
import type { PropertiesView, AllPropertiesView } from './compat.ts';
import { PropertyCatalog } from './property-catalog.ts';

const isHtml = (file: unknown): file is TFile => file instanceof TFile && /^(html|htm)$/i.test(file.extension);
type Snapshot = { properties: Properties; error?: undefined } | { properties?: undefined; error: string };
type PanelState = { path: string; submitted: Properties; pending: number; restorers: (() => void)[] };

class HtmlPicker extends FuzzySuggestModal<TFile> {
  choose: (file: TFile) => void;
  constructor(app: App, choose: (file: TFile) => void) {
    super(app);
    this.choose = choose;
    this.setPlaceholder('选择要编辑属性的 HTML 文件');
  }
  getItems(): TFile[] { return this.app.vault.getFiles().filter(isHtml); }
  getItemText(file: TFile): string { return file.path; }
  onChooseItem(file: TFile): void { this.choose(file); }
}

export default class HtmlFrontmatterPlugin extends Plugin {
  active = false;
  snapshots = new Map<string, Snapshot>();
  errors: string[] = [];
  private jobs = new Set<Promise<unknown>>();
  private revisions = new Map<string, number>();
  private queues = new Map<string, Promise<unknown>>();
  private panels = new Map<PropertiesView, PanelState>();
  private globalPanels = new Map<AllPropertiesView, () => void>();
  private restorers: (() => void)[] = [];
  private catalog: PropertyCatalog | null = null;
  private catalogRefresh: Promise<void> | null = null;

  async onload(): Promise<void> {
    if (apiVersion !== '1.14.4') throw new Error(`实验版仅验证 Obsidian 1.14.4，当前为 ${apiVersion}。`);
    this.active = true;
    try {
      const native = getPropertiesInternals(this.app);
      this.installFileGuards();
      this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
        if (isHtml(file)) menu.addItem((item) => item.setTitle('编辑 HTML 属性').setIcon('lucide-info').onClick(() => {
          void this.openProperties(file).catch((error) => this.report(error));
        }));
      }));
      this.addCommand({ id: 'edit-html-properties', name: '编辑 HTML 属性', callback: () => {
        new HtmlPicker(this.app, (file) => { void this.openProperties(file).catch((error) => this.report(error)); }).open();
      } });
      this.registerEvent(this.app.vault.on('create', (file) => { if (isHtml(file)) this.scheduleIndex(file); }));
      this.registerEvent(this.app.vault.on('modify', (file) => { if (isHtml(file)) this.scheduleIndex(file); }));
      this.registerEvent(this.app.vault.on('delete', (file) => { this.invalidate(file.path); }));
      this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
        this.invalidate(oldPath);
        if (isHtml(file)) this.scheduleIndex(file);
      }));
      this.registerEvent(native.vault.on('config-changed', (key) => {
        if (key === 'userIgnoreFilters') this.requestCatalogRefresh();
      }));
      this.registerEvent(this.app.workspace.on('layout-change', () => this.attachExistingPanels()));
      await Promise.all(this.app.vault.getFiles().filter(isHtml).map((file) => this.indexFile(file)));
      this.restorers.push(wrapMethod(this.app.metadataCache, 'getCache', (receiver, original, [path]) => {
        const snapshot = this.snapshots.get(path);
        if (snapshot?.properties) return { frontmatter: validateProperties(snapshot.properties) } satisfies CachedMetadata;
        return original.call(receiver, path);
      }));
      this.catalog = new PropertyCatalog(native.metadataCache, native.metadataTypeManager, () =>
        [...this.snapshots].flatMap(([path, snapshot]) => snapshot.properties && this.app.vault.getFileByPath(path)
          ? [[path, snapshot.properties] as const] : []),
      );
      this.catalog.install();
      this.catalog.refresh();
      this.app.workspace.onLayoutReady(() => { if (this.active) this.attachExistingPanels(); });
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  private installFileGuards(): void {
    const { fileManager } = getPropertiesInternals(this.app);
    for (const name of ['renameProperty', 'deleteProperty'] as const) {
      this.restorers.push(wrapMethod(fileManager, name, (receiver, original, args) => {
        const property = String(args[0]).toLowerCase();
        if (this.hasHtmlProperty(property)) {
          const message = '实验版暂不支持涉及 HTML 的全局属性重命名或删除。请在单文件属性面板中操作。';
          this.report(new Error(message));
          return Promise.reject(new Error(message));
        }
        return original.apply(receiver, args);
      }));
    }
    this.restorers.push(wrapMethod(fileManager, 'processFrontMatter', (receiver, original, [file, callback, options]) => {
      if (!isHtml(file)) return original.call(receiver, file, callback, options);
      return this.enqueue(file, (source) => {
        const properties = readMetadata(source).properties;
        callback(properties);
        return writeMetadata(source, properties);
      });
    }));
  }

  private hasHtmlProperty(name: string): boolean {
    return [...this.snapshots.values()].some((snapshot) => snapshot.properties
      && Object.keys(snapshot.properties).some((key) => key.toLowerCase() === name.toLowerCase()));
  }

  private report(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.errors.push(message);
    this.errors = this.errors.slice(-20);
    new Notice(`HTML 属性：${message}`, 7000);
  }

  private invalidate(path: string): void {
    this.revisions.set(path, (this.revisions.get(path) ?? 0) + 1);
    if (this.snapshots.delete(path)) this.requestCatalogRefresh();
  }

  private requestCatalogRefresh(): void {
    if (!this.active || !this.catalog || this.catalogRefresh) return;
    this.catalogRefresh = Promise.resolve().then(() => {
      this.catalogRefresh = null;
      if (this.active) this.catalog?.refresh();
    });
    this.track(this.catalogRefresh).catch((error) => this.report(error));
  }

  private track<T>(job: Promise<T>): Promise<T> {
    this.jobs.add(job);
    void job.then(() => this.jobs.delete(job), () => this.jobs.delete(job));
    return job;
  }

  private scheduleIndex(file: TFile): void {
    this.track(this.indexFile(file)).catch((error) => this.report(error));
  }

  private async indexFile(file: TFile): Promise<void> {
    const path = file.path;
    const revision = (this.revisions.get(path) ?? 0) + 1;
    this.revisions.set(path, revision);
    const source = await this.app.vault.read(file);
    if (!this.active || file.path !== path || this.revisions.get(path) !== revision) return;
    try { this.snapshots.set(path, { properties: readMetadata(source).properties }); }
    catch (error) { this.snapshots.set(path, { error: error instanceof Error ? error.message : String(error) }); }
    this.requestCatalogRefresh();
  }

  private enqueue(file: TFile, transform: (source: string) => string): Promise<void> {
    const path = file.path;
    const previous = this.queues.get(path) ?? Promise.resolve();
    const job = previous.catch(() => undefined).then(async () => {
      if (!this.active) throw new Error('插件已停用，待处理的写入已取消。');
      if (file.path !== path || this.app.vault.getFileByPath(path) !== file) throw new Error('文件已移动或删除，请重新打开属性。');
      await this.app.vault.process(file, (source) => {
        if (!this.active) throw new Error('插件已停用，写入已取消。');
        return transform(source);
      });
      await this.indexFile(file);
    });
    this.queues.set(path, job);
    void job.finally(() => { if (this.queues.get(path) === job) this.queues.delete(path); }).catch(() => undefined);
    return this.track(job);
  }

  private attachExistingPanels(): void {
    if (!this.active) return;
    const leaves = this.app.workspace.getLeavesOfType('file-properties');
    const liveViews = new Set(leaves.map((leaf) => leaf.view));
    for (const [view, state] of this.panels) {
      if (!liveViews.has(view)) {
        for (const restore of state.restorers.reverse()) restore();
        this.panels.delete(view);
      }
    }
    for (const leaf of leaves) {
      if (isPropertiesView(leaf.view)) this.attachPanel(leaf.view);
    }
    const globalLeaves = this.app.workspace.getLeavesOfType('all-properties');
    const globalViews = new Set(globalLeaves.map((leaf) => leaf.view));
    for (const [view, restore] of this.globalPanels) {
      if (!globalViews.has(view)) { restore(); this.globalPanels.delete(view); }
    }
    for (const leaf of globalLeaves) {
      const view = leaf.view;
      if (!isAllPropertiesView(view) || this.globalPanels.has(view)) continue;
      this.globalPanels.set(view, wrapMethod(view, 'deleteProperty', (receiver, original, args) => {
        const [row] = args;
        // The native context menu loops through deleteProperty() per selected row.
        // Preflight the entire selection before its first Markdown-only row writes.
        if ([row, ...view.tree.selectedDoms].some((item) => this.hasHtmlProperty(item.property.name))) {
          const error = new Error('实验版暂不支持涉及 HTML 的全局属性删除。混合选择已整批阻止，请在单文件属性面板中操作。');
          this.report(error);
          return Promise.reject(error);
        }
        return original.call(receiver, row);
      }));
    }
  }

  private attachPanel(view: PropertiesView): void {
    if (this.panels.has(view)) return;
    const restorers: (() => void)[] = [];
    this.panels.set(view, { path: '', submitted: {}, pending: 0, restorers });
    restorers.push(wrapMethod(view, 'isSupportedFile', (receiver, original, [file]) => isHtml(file) || original.call(receiver, file)));
    restorers.push(wrapMethod(view, 'updateFrontmatter', (receiver, original, [file, source]) => {
      if (!isHtml(file)) return original.call(receiver, file, source);
      const state = this.panels.get(view)!;
      if (state.path === file.path && state.pending > 0) return;
      state.path = file.path;
      try {
        const properties = readMetadata(source).properties;
        state.submitted = validateProperties(properties);
        view.rawFrontmatter = JSON.stringify(properties);
        view.frontmatter = validateProperties(properties);
      } catch (error) {
        view.rawFrontmatter = null;
        view.frontmatter = null;
        this.report(error);
      }
    }));
    restorers.push(wrapMethod(view, 'saveFrontmatter', (receiver, original, [value]) => {
      const file = view.file;
      if (!isHtml(file)) return original.call(receiver, value);
      const state = this.panels.get(view)!;
      let next: Properties;
      let changes: PropertyChange[];
      try {
        next = validateProperties(value);
        changes = diffProperties(state.submitted, next);
      } catch (error) { this.report(error); return; }
      if (!changes.length) return;
      state.submitted = next;
      view.frontmatter = validateProperties(next);
      view.rawFrontmatter = JSON.stringify(next);
      state.pending++;
      const job = this.enqueue(file, (source) => applyChanges(source, changes));
      void job.catch((error) => this.report(error)).finally(async () => {
        state.pending--;
        if (!this.active || state.pending > 0 || view.file !== file || state.path !== file.path) return;
        try { await this.refreshPanel(view, file); } catch (error) { this.report(error); }
      });
    }));
    if (isHtml(view.file)) {
      view.modifyingFile = view.file;
      void this.refreshPanel(view, view.file).catch((error) => this.report(error));
    }
  }

  private async refreshPanel(view: PropertiesView, file: TFile): Promise<void> {
    const source = await this.app.vault.read(file);
    if (!this.active || view.file !== file) return;
    view.updateFrontmatter(file, source);
    view.update();
  }

  async openProperties(file: TFile): Promise<void> {
    if (!this.active || !isHtml(file)) throw new Error('请选择 HTML 文件。');
    const core = getPropertiesInternals(this.app).internalPlugins.getEnabledPluginById('properties');
    if (!core) throw new Error('请先启用 Obsidian 内置的 Properties 核心功能。');
    const source = await this.app.vault.read(file);
    readMetadata(source); // Refuse invalid data before opening an editable panel.
    const leaf = this.app.workspace.getLeavesOfType('file-properties').find((candidate) =>
      isPropertiesView(candidate.view) && candidate.view.file === file,
    ) ?? this.app.workspace.getRightLeaf(false);
    if (!leaf) throw new Error('无法创建属性侧栏。');
    await leaf.setViewState({ type: 'file-properties', state: {} });
    await leaf.loadIfDeferred();
    if (!isPropertiesView(leaf.view)) throw new Error('原生属性视图接口不匹配。');
    this.attachPanel(leaf.view);
    leaf.setPinned(true);
    await leaf.setViewState({ type: 'file-properties', state: { file: file.path } });
    await this.refreshPanel(leaf.view, file);
    await this.app.workspace.revealLeaf(leaf);
  }

  async flush(): Promise<void> {
    while (this.jobs.size) await Promise.allSettled([...this.jobs]);
  }

  getStatus(): object {
    return { active: this.active, htmlFiles: this.snapshots.size, pendingJobs: this.jobs.size, adaptedPanels: this.panels.size, errors: [...this.errors] };
  }

  private dispose(): void {
    this.active = false;
    for (const restore of this.globalPanels.values()) restore();
    this.globalPanels.clear();
    this.catalog?.dispose();
    this.catalog = null;
    for (const state of this.panels.values()) for (const restore of state.restorers.reverse()) restore();
    for (const restore of this.restorers.splice(0).reverse()) restore();
    for (const view of this.panels.keys()) {
      if (isHtml(view.file)) {
        view.frontmatter = null;
        view.rawFrontmatter = null;
        view.modifyingFile = null;
        try { view.update(); } catch { /* A closed/deferred leaf no longer has live controls. */ }
      }
    }
    this.panels.clear();
    this.snapshots.clear();
  }

  onunload(): void { this.dispose(); }
}
