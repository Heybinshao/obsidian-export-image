import { beforeEach, describe, expect, it } from 'vitest';
import {
  extractMermaidSources,
  getContentWidth,
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
      padding: { top: 6, right: 6, bottom: 6, left: 6 },
    } as never)).toBe(628);
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
});
