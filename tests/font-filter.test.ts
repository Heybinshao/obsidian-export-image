import { beforeEach, describe, expect, it } from 'vitest';
import domtoimage from '../src/dom-to-image-more';

const fontFaces = (domtoimage as unknown as {
  impl: {
    fontFaces: { resolveAll: (node: Node) => Promise<string> };
    options: Record<string, unknown>;
  };
}).impl.fontFaces;

describe('font embedding filter', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    document.head.innerHTML = `<style>
      @font-face {
        font-family: "Used Font";
        src: local("Used Font"), url(data:font/woff2;base64,AAAA) format("woff2");
        font-weight: 400;
      }
      @font-face {
        font-family: "Unused Font";
        src: url(data:font/woff2;base64,BBBB) format("woff2");
        font-weight: 400;
      }
    </style>`;
    (domtoimage as unknown as { impl: { options: Record<string, unknown> } }).impl.options.skipLocalFonts = false;
  });

  it('only embeds @font-face rules used by the captured subtree', async () => {
    const node = document.createElement('div');
    node.style.fontFamily = '"Used Font", sans-serif';
    node.textContent = '测试';
    document.body.appendChild(node);

    const css = await fontFaces.resolveAll(node);
    expect(css).toContain('Used Font');
    expect(css).not.toContain('Unused Font');
  });

  it('skips a local() face when the font is already available on desktop', async () => {
    const node = document.createElement('div');
    node.style.fontFamily = '"Used Font", sans-serif';
    node.textContent = '测试';
    document.body.appendChild(node);

    (domtoimage as unknown as { impl: { options: Record<string, unknown> } }).impl.options.skipLocalFonts = true;
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { check: () => true },
    });

    const css = await fontFaces.resolveAll(node);
    expect(css).not.toContain('Used Font');
  });
});
