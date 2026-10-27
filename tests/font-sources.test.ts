import { beforeEach, describe, expect, it } from 'vitest';
import { collectMissingFontCss, collectUsedFontFamilies, extractFontFaceBlocks, parseFontFaceBlock } from '../src/utils/fontSources';

type Files = Record<string, string>;

function fakeApp(files: Files) {
  return {
    vault: {
      configDir: '.obsidian',
      adapter: {
        list: async (dir: string) => ({
          files: Object.keys(files).filter(path => path.startsWith(`${dir}/`)),
          folders: [],
        }),
        stat: async () => ({ mtime: 1, size: 1 }),
        read: async (path: string) => files[path],
      },
    },
  } as never;
}

const FONT_CSS = `@font-face {
  font-family: "Vault Font";
  src: local("VaultFont"), url("data:font/woff2;base64,AAAA") format("woff2");
  font-weight: 400;
}`;

describe('font sources', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  it('collects the families used by the export subtree', () => {
    const root = document.createElement('div');
    root.style.fontFamily = '"Vault Font", "PingFang SC", sans-serif';
    // Static test markup, not user content.
    root.innerHTML = '<span style="font-family: \'Other Font\', serif">x</span>';
    document.body.appendChild(root);

    const families = collectUsedFontFamilies(root);
    expect(families.has('vault font')).toBe(true);
    expect(families.has('pingfang sc')).toBe(true);
    expect(families.has('other font')).toBe(true);
  });

  it('reads @font-face rules from vault snippets when the document cannot see them', async () => {
    const root = document.createElement('div');
    root.style.fontFamily = '"Vault Font", sans-serif';
    document.body.appendChild(root);

    const app = fakeApp({
      '.obsidian/snippets/font.css': FONT_CSS,
      '.obsidian/appearance.json': JSON.stringify({ cssTheme: '' }),
    });

    const css = await collectMissingFontCss(app, root);
    expect(css).toContain('Vault Font');
    expect(css).toContain('data:font/woff2');
  });

  it('returns nothing when the document already exposes the family', async () => {
    document.head.innerHTML = `<style>${FONT_CSS}</style>`;
    const root = document.createElement('div');
    root.style.fontFamily = '"Vault Font", sans-serif';
    document.body.appendChild(root);

    const app = fakeApp({ '.obsidian/snippets/font.css': FONT_CSS });
    const css = await collectMissingFontCss(app, root);
    expect(css).toBe('');
  });

  it('still embeds the vault face when the readable rule only has local()', async () => {
    // A readable sheet whose face has no data URI is useless on a phone that
    // does not have the font installed; the vault copy has to fill the gap.
    document.head.innerHTML = `<style>@font-face {
      font-family: "Vault Font";
      src: local("VaultFont");
      font-weight: 400;
    }</style>`;
    const root = document.createElement('div');
    root.style.fontFamily = '"Vault Font", sans-serif';
    document.body.appendChild(root);

    const app = fakeApp({ '.obsidian/snippets/font.css': FONT_CSS });
    const css = await collectMissingFontCss(app, root);
    expect(css).toContain('data:font/woff2');
  });
});

describe('font face parsing', () => {
  it('slices blocks with nested braces and keeps the data URI', () => {
    const css = `@media (min-width: 0px) {
      @font-face {
        font-family: "Nested";
        src: url("data:font/woff2;base64,AA{BB}") format("woff2");
        unicode-range: U+0-7F;
      }
    }`;
    const blocks = extractFontFaceBlocks(css);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toContain('Nested');
    expect(blocks[0].endsWith('}')).toBe(true);
  });

  it('replaces font-display: swap with a blocking strategy', () => {
    const block = parseFontFaceBlock(`@font-face {
      font-family: "Vault Font";
      src: url("data:font/woff2;base64,AAAA");
      font-display: swap;
    }`);
    expect(block?.css).toContain('font-display: block');
    expect(block?.css).not.toContain('swap');
    expect(block?.hasData).toBe(true);
    expect(block?.weight).toBe('normal');
  });
});
