import {
  Plugin,
  PluginSettingTab,
  type App,
  TFile,
  Notice,
  TFolder,
  Editor,
  MarkdownView,
} from 'obsidian';
import L from './L';
import { isMarkdownFile, getMetadata } from './utils';
import { compressAvatar } from './utils/image';
import { normalizeSettings } from './settings';
import exportFolder from './components/folder/exportFolder';
import { createSettingConfig } from './formConfig';
import { SettingRenderer } from './SettingRenderer';
import exportImage from './components/file/exportImage';

export default class ExportImagePlugin extends Plugin {
  settings: ISettings;

  private persistSettings = (settings: ISettings) => {
    this.settings = normalizeSettings(settings);
    void this.saveSettings();
  };

  async exportFile(file: TFile) {
    const frontmatter = getMetadata(file, this.app);
    const markdown = await this.app.vault.cachedRead(file);
    await exportImage(this.app, this.settings, markdown, file, frontmatter, 'file', this.persistSettings);
  }

  async onload() {
    await this.loadSettings();

    // Mobile has no right-click menu; the ribbon is the shortest path to an export.
    this.addRibbonIcon('image-down', '导出当前笔记为图片', () => {
      const file = this.app.workspace.getActiveFile();
      if (!file || !isMarkdownFile(file)) {
        new Notice('当前没有打开的 Markdown 笔记');
        return;
      }
      void this.exportFile(file);
    });

    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (file instanceof TFile && isMarkdownFile(file)) {
          menu.addItem(item => {
            item
              .setTitle(L.exportImage())
              .setIcon('image-down')
              .onClick(async () => {
                await this.exportFile(file);
              });
          });
        } else if (file instanceof TFolder) {
          menu.addItem(item => {
            item
              .setTitle(L.exportFolder())
              .setIcon('image-down')
              .onClick(async () => {
                await exportFolder(this.app, this.settings, file, this.persistSettings);
              });
          });
        }
      }),
    );

    this.registerEvent(
      this.app.workspace.on('editor-menu', (menu, editor) => {
        const file: TFile
          // @ts-ignore: Obsidian ts defined incomplete.
          = editor.editorComponent.file as (TFile | undefined) ?? this.app.workspace.getActiveFile()!;
        const frontmatter = getMetadata(file, this.app);
        if (!file) {
          return;
        }

        if (editor.somethingSelected()) {
          menu.addItem(item => {
            item
              .setTitle(L.exportSelectionImage())
              .setIcon('text-select')
              .onClick(async () =>
                exportImage(
                  this.app,
                  this.settings,
                  editor.getSelection(),
                  file,
                  frontmatter,
                  'selection',
                  this.persistSettings,
                ),
              );
          });
        }

        menu.addItem(item => {
          item
            .setTitle(L.exportImage())
            .setIcon('image-down')
            .onClick(async () =>
              exportImage(
                this.app,
                this.settings,
                editor.getValue(),
                file,
                frontmatter,
                'file',
                this.persistSettings,
              ),
            );
        });
      }),
    );

    this.addCommand({
      id: 'export-image',
      name: L.command(),
      checkCallback: (checking: boolean) => {
        // If checking is true, we're simply "checking" if the command can be run.
        // If checking is false, then we want to actually perform the operation.
        if (!checking) {
          (async () => {
            const activeFile = this.app.workspace.getActiveFile();
            if (
              !activeFile
              || !['md', 'markdown'].includes(activeFile.extension)
            ) {
              new Notice(L.noActiveFile());
              return;
            }

            const frontmatter = getMetadata(activeFile, this.app);
            const markdown = await this.app.vault.cachedRead(activeFile);
            await exportImage(
              this.app,
              this.settings,
              markdown,
              activeFile,
              frontmatter,
              'file',
              this.persistSettings,
            );
          })();
        }
        // This command will only show up in Command Palette when the check function returns true
        return true;
      },
    });

    this.addCommand({
      id: 'export-image-selection',
      name: L.exportSelectionImage(),
      editorCheckCallback: (checking: boolean, editor: Editor, view: MarkdownView) => {
        const file = view.file;
        if (!file || !['md', 'markdown'].includes(file.extension)) {
          return false;
        }
        const frontmatter = getMetadata(file, this.app);
        const selection = editor.getSelection();
        if (!selection) {
          return false;
        }
        if (!checking) {
          exportImage(
            this.app,
            this.settings,
            selection,
            file,
            frontmatter,
            'selection',
            this.persistSettings,
          );
        }
        return true;
      },
    });

    // This adds a settings tab so the user can configure various aspects of the plugin
    this.addSettingTab(new ImageSettingTab(this.app, this));
  }

  onunload() {
    // Empty
  }

  async loadSettings() {
    this.settings = normalizeSettings(await this.loadData());
    void this.shrinkStoredAvatar();
  }

  /**
   * One-off migration: avatars used to be stored as the original camera image
   * (hundreds of KB of base64 inside `data.json`, embedded into every export).
   * Shrink whatever is already saved, then persist the smaller copy.
   */
  private async shrinkStoredAvatar() {
    const avatar = this.settings.authorInfo?.avatar;
    if (!avatar || !avatar.startsWith('data:image/')) return;

    const compressed = await compressAvatar(avatar);
    if (compressed === avatar) return;

    this.settings.authorInfo.avatar = compressed;
    await this.saveSettings();
  }

  async saveSettings() {
    this.settings = normalizeSettings(this.settings);
    await this.saveData(this.settings);
  }
}

class ImageSettingTab extends PluginSettingTab {
  plugin: ExportImagePlugin;
  settingRenderer: SettingRenderer;

  constructor(app: App, plugin: ExportImagePlugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.settingRenderer = new SettingRenderer(app, plugin, this.containerEl);
  }

  async display(): Promise<void> {
    await this.settingRenderer.render(await createSettingConfig(this.app));
  }
}
