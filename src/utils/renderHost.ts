import {
  type App,
  MarkdownRenderChild,
  MarkdownRenderer,
} from 'obsidian';
import { delay, waitForAsyncRenderers } from '.';

type PeleLike = {
  mount?: (el: HTMLElement, text: string, options?: Record<string, unknown>) => unknown;
};

function getPele(): PeleLike | undefined {
  return (window as unknown as { pele?: PeleLike }).pele;
}

export function getContentWidth(settings: ISettings): number {
  const width = settings.width || 640;
  const left = settings.padding?.left ?? 0;
  const right = settings.padding?.right ?? 0;
  return Math.max(40, width - left - right);
}

export function nextFrame(): Promise<void> {
  return new Promise(resolve => {
    requestAnimationFrame(() => resolve());
  });
}

export async function waitForFonts(timeoutMs = 3000): Promise<void> {
  if (!document.fonts?.ready) return;
  await Promise.race([document.fonts.ready, delay(timeoutMs)]);
}

export async function waitForImages(root: HTMLElement, timeoutMs = 3000): Promise<void> {
  const images = Array.from(root.querySelectorAll('img'));
  await Promise.all(images.map(image => new Promise<void>(resolve => {
    const done = () => resolve();
    if (image.complete && image.naturalWidth > 0) {
      void image.decode?.().catch(() => undefined).finally(done);
      return;
    }
    image.addEventListener('load', done, { once: true });
    image.addEventListener('error', done, { once: true });
    setTimeout(done, timeoutMs);
  })));
}

/**
 * Extract mermaid fenced blocks in document order. Used as a fallback source
 * when Obsidian's post-processor did not mount a diagram (e.g. in a detached
 * render host, where it defers mounting until the node is inserted).
 */
export function extractMermaidSources(markdown: string): string[] {
  const sources: string[] = [];
  const fence = /^(```|~~~)mermaid[^\n]*\n([\s\S]*?)^\1[ \t]*$/gm;
  for (const match of markdown.matchAll(fence)) {
    sources.push(match[2].trimEnd());
  }
  return sources;
}

/**
 * Make sure every `.mermaid` block in the render host has an SVG. Obsidian
 * 1.15 mounts Pele through its post-processor, but only after the node is
 * shown; a host that is offscreen or detached can stay empty. In that case
 * mount the diagram ourselves at the export content width.
 */
export async function waitForPele(
  host: HTMLElement,
  markdown: string,
  width: number,
  timeoutMs = 3000,
): Promise<void> {
  const sources = extractMermaidSources(markdown);
  const started = Date.now();
  const attempted = new WeakSet<HTMLElement>();

  while (Date.now() - started < timeoutMs) {
    const containers = Array.from(host.querySelectorAll<HTMLElement>('.mermaid'));
    if (containers.length === 0) return;

    // Only map sources by index when the counts line up. Embeds can add
    // diagrams that are not in this markdown string; mounting those with the
    // wrong source would be worse than waiting for Obsidian's own renderer.
    const canMapSources = sources.length === containers.length;
    let pending = false;
    for (let index = 0; index < containers.length; index++) {
      const container = containers[index];
      if (container.querySelector('svg')) continue;

      const source = canMapSources ? sources[index] : undefined;
      const pele = getPele();
      if (!source || !pele?.mount || attempted.has(container)) {
        pending = true;
        continue;
      }

      attempted.add(container);
      try {
        pele.mount(container, source, { maxWidth: width, zoom: false });
      } catch (error) {
        console.error('export-image: failed to mount Pele diagram', error);
      }
    }

    if (!pending && containers.every(container => container.querySelector('svg'))) {
      await nextFrame();
      return;
    }

    await delay(50);
  }

  console.warn('export-image: Pele diagrams did not settle before the timeout');
}

/**
 * Render markdown in an attached, offscreen host at the export content width.
 * Rendering into a detached element breaks Obsidian 1.15's Pele post-processor
 * and makes computed layout (width, line wrapping) meaningless.
 */
export async function renderMarkdownHost(
  app: App,
  markdown: string,
  sourcePath: string,
  width: number,
): Promise<HTMLDivElement> {
  const host = document.createElement('div');
  host.className = 'export-image-render-host';
  host.style.cssText = [
    'position:absolute',
    'left:-100000px',
    'top:0',
    `width:${Math.max(40, width)}px`,
    'min-height:1px',
    'pointer-events:none',
  ].join(';');
  document.body.appendChild(host);

  try {
    await MarkdownRenderer.render(
      app,
      markdown,
      host,
      sourcePath,
      new MarkdownRenderChild(host),
    );

    await waitForAsyncRenderers(host, 300, 5000);
    await waitForPele(host, markdown, width);
    await waitForFonts();
    await waitForImages(host);
    await nextFrame();
    await nextFrame();

    return host;
  } catch (error) {
    host.remove();
    throw error;
  }
}

/** Pele draws its zoom controls inside the diagram container. */
export function stripPeleChrome(root: HTMLElement): void {
  root.querySelectorAll('.pele-zoom').forEach(element => element.remove());
}
