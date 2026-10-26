import { beforeEach, describe, expect, it } from 'vitest';
import {
  extractMermaidSources,
  getContentWidth,
  hydrateImages,
  renderMarkdownHost,
  stripPeleChrome,
} from '../src/utils/renderHost';

describe('renderHost', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    (window as unknown as { pele: unknown }).pele = {
      mount: (element: HTMLElement) => {
        element.innerHTML = '<svg class="pele"></svg><div class="pele-zoom"></div>';
      },
    };
  });

  it('subtracts horizontal padding from the export width', () => {
    expect(getContentWidth({
      width: 640,
      padding: { top: 20, right: 20, bottom: 20, left: 20 },
    } as never)).toBe(600);
  });

  it('extracts mermaid fences in order', () => {
    const markdown = [
      '```mermaid',
      'flowchart LR',
      '  A --> B',
      '```',
      '',
      '~~~mermaid',
      'sequenceDiagram',
      '  A->>B: hi',
      '~~~',
    ].join('\n');

    expect(extractMermaidSources(markdown)).toEqual([
      'flowchart LR\n  A --> B',
      'sequenceDiagram\n  A->>B: hi',
    ]);
  });

  it('renders in an attached host at the content width and mounts Pele', async () => {
    const host = await renderMarkdownHost(
      {} as never,
      '```mermaid\nflowchart LR\n  A --> B\n```',
      'note.md',
      628,
    );

    expect(host.isConnected).toBe(true);
    expect(host.style.width).toBe('628px');
    expect(host.querySelector('.mermaid svg')).not.toBeNull();
    expect(host.querySelector('.pele-zoom')).not.toBeNull();

    stripPeleChrome(host);
    expect(host.querySelector('.pele-zoom')).toBeNull();

    host.remove();
  });

  it('replaces a vault image URL with the original file data URL', async () => {
    const image = document.createElement('img');
    image.src = 'file:///vault/assets/diagram.svg?123';
    document.body.appendChild(image);

    const app = {
      vault: {
        resolveFileUrl: () => ({ path: 'assets/diagram.svg', extension: 'svg' }),
        readBinary: async () => new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>').buffer,
      },
      metadataCache: { getFirstLinkpathDest: () => null },
    };

    await hydrateImages(document.body, app as never, 'note.md');
    expect(image.src.startsWith('data:image/svg+xml;base64,')).toBe(true);
    expect(image.getAttribute('data-export-image-original')).toBe('true');
  });
});
