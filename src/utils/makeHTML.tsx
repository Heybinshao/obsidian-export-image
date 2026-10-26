/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  type App,
  type TFile,
} from 'obsidian';
import React from 'react';
import { flushSync } from 'react-dom';
import { type Root, createRoot } from 'react-dom/client';
import Target from 'src/components/common/Target';
import { getContentWidth, nextFrame, renderMarkdownHost } from './renderHost';
import { delay, getMetadata } from '.';
import { preprocessMarkdown } from './preprocessMarkdown';

let root: Root | undefined;

// eslint-disable-next-line @typescript-eslint/naming-convention
export default async function makeHTML(
  file: TFile,
  settings: ISettings,
  app: App,
  container: HTMLElement,
) {
  if (root) {
    root.unmount();
    await delay(20);
    container.empty();
  }

  const markdown = await app.vault.cachedRead(file);
  const frontmatter = getMetadata(file, app);
  const host = await renderMarkdownHost(
    app,
    preprocessMarkdown(markdown, frontmatter),
    file.path,
    getContentWidth(settings),
  );

  try {
    /* @ts-ignore */
    const metadataMap: Record<string, { type: MetadataType }> = app.metadataCache.getAllPropertyInfos();

    container.style.width = `${settings.width || 640}px`;
    root = createRoot(container);
    flushSync(() => {
      root!.render(
        <Target
          frontmatter={frontmatter}
          setting={settings}
          title={file.basename}
          markdownEl={host}
          app={app}
          metadataMap={metadataMap}
          isProcessing
        />,
      );
    });

    const element = container.querySelector<HTMLElement>('.export-image-root');
    if (!element) {
      throw new Error('export-image-root was not rendered');
    }

    const clip = element.parentElement;
    if (!clip) {
      throw new Error('export-image clip wrapper was not rendered');
    }

    await nextFrame();
    return { element: clip, contentElement: element };
  } finally {
    host.remove();
  }
}
