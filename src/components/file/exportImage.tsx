/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import React from 'react';
import {
  type App,
  type FrontMatterCache,
  Modal,
  Notice,
  type TFile,
} from 'obsidian';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import L from '../../L';
import ModalContent from './ModalContent';
import { preprocessMarkdown } from 'src/utils/preprocessMarkdown';
import Target from '../common/Target';
import { copy } from 'src/utils/capture';
import { getContentWidth, renderMarkdownHost } from 'src/utils/renderHost';

export default async function (
  app: App,
  settings: ISettings,
  markdown: string,
  file: TFile,
  frontmatter: FrontMatterCache | undefined,
  type: 'file' | 'selection',
) {
  const source = preprocessMarkdown(markdown, frontmatter);
  const contentWidth = getContentWidth(settings);
  const skipConfig = type === 'selection' && settings.quickExportSelection;

  // Quick export: render offscreen, copy, clean up. The host is attached and
  // has the final content width so Pele lays diagrams out for the export.
  if (skipConfig) {
    const host = await renderMarkdownHost(app, source, file.path, contentWidth);
    const div = createDiv();
    div.style.width = `${settings.width || 640}px`;
    div.style.position = 'fixed';
    div.style.top = '9999px';
    div.style.left = '9999px';
    document.body.appendChild(div);

    const root = createRoot(div);
    flushSync(() => {
      root.render(
        <Target
          isProcessing={true}
          markdownEl={host}
          setting={{
            ...settings,
            showMetadata: false,
            showFilename: false,
            split: { overlap: 0, height: 0, mode: 'none' },
          }}
          frontmatter={{}}
          title={file.basename}
          metadataMap={{}}
          app={app}
        />,
      );
    });

    try {
      const target = div.querySelector<HTMLElement>('.export-image-root');
      if (!target) throw new Error('export-image-root was not rendered');
      await copy(target, settings.resolutionMode, settings.format);
    } catch (error) {
      console.error(error);
      new Notice(L.copyFail());
    } finally {
      root.unmount();
      div.remove();
      host.remove();
    }
    return;
  }

  const modal = new Modal(app);
  modal.setTitle(L.imageExportPreview());
  modal.modalEl.style.width = '85vw';
  modal.modalEl.style.maxWidth = '1500px';
  modal.open();

  let host: HTMLDivElement | undefined;
  let closed = false;
  modal.onClose = () => {
    closed = true;
    host?.remove();
  };

  const loading = modal.contentEl.createDiv({ cls: 'export-image-loading' });
  loading.createDiv({ cls: 'export-image-loading-spinner' });
  loading.createDiv({ cls: 'export-image-loading-text', text: L.loading() });

  try {
    host = await renderMarkdownHost(app, source, file.path, contentWidth);
  } catch (error) {
    console.error(error);
    new Notice(L.saveFail());
    modal.close();
    return;
  }

  if (closed) {
    host.remove();
    return;
  }

  modal.contentEl.empty();
  const root = createRoot(modal.contentEl);

  /* @ts-ignore */
  const metadataMap: Record<string, { type: MetadataType }> = app.metadataCache.getAllPropertyInfos();

  root.render(
    <ModalContent
      markdownEl={host}
      settings={settings}
      frontmatter={frontmatter}
      title={file.basename}
      metadataMap={metadataMap}
      app={app}
    />,
  );

  modal.onClose = () => {
    closed = true;
    root.unmount();
    host?.remove();
  };
}
