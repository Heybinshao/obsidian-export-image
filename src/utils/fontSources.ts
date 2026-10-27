import { type App } from 'obsidian';

/**
 * Obsidian serves vault CSS (snippets, themes) from a different origin on
 * mobile, so `styleSheet.cssRules` throws and the capture pipeline cannot see
 * the `@font-face` rules that make the note's font work. The exported image
 * then silently falls back to a system font. Read the CSS from the vault and
 * hand the missing faces to the capture as extra font CSS.
 */

const FONT_FACE_RULE = 5; // CSSRule.FONT_FACE_RULE

export type FontFaceBlock = {
  family: string;
  weight: string;
  style: string;
  css: string;
  hasData: boolean;
};

type FaceFile = { mtime: number; blocks: FontFaceBlock[] };

const fileCache = new Map<string, FaceFile>();
/** Per-run trace of how each CSS file was read, surfaced in the debug dump. */
let notes: string[] = [];

function normalizeFamily(value: string): string {
  return String(value || '')
    .split(',')[0]
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .toLowerCase();
}

function unquote(value: string): string {
  return String(value || '').trim().replace(/^['"]|['"]$/g, '');
}

/**
 * Slice out every `@font-face { … }` block with a brace/quote aware scanner.
 * A plain `[^}]*` regex breaks as soon as a block contains a nested brace
 * (custom properties, `@supports` wrappers) and silently drops the face.
 */
export function extractFontFaceBlocks(css: string): string[] {
  const blocks: string[] = [];
  const lower = css.toLowerCase();
  let index = lower.indexOf('@font-face');
  while (index !== -1) {
    let cursor = index + '@font-face'.length;
    while (cursor < css.length && /\s/.test(css[cursor])) cursor++;
    if (css[cursor] !== '{') {
      index = lower.indexOf('@font-face', cursor);
      continue;
    }

    let depth = 0;
    let quote: string | undefined;
    let end = -1;
    for (let i = cursor; i < css.length; i++) {
      const char = css[i];
      if (quote) {
        if (char === '\\') i++;
        else if (char === quote) quote = undefined;
        continue;
      }

      if (char === '"' || char === '\'') {
        quote = char;
      } else if (char === '{') {
        depth++;
      } else if (char === '}') {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }

    if (end === -1) break;
    blocks.push(css.slice(index, end));
    index = lower.indexOf('@font-face', end);
  }

  return blocks;
}

function readProperty(block: string, property: string): string {
  const match = new RegExp(`${property}\\s*:\\s*([^;}]+)`, 'i').exec(block);
  return match ? unquote(match[1]) : '';
}

export function parseFontFaceBlock(css: string): FontFaceBlock | undefined {
  const family = normalizeFamily(readProperty(css, 'font-family'));
  if (!family) return undefined;

  const weight = readProperty(css, 'font-weight') || 'normal';
  const style = readProperty(css, 'font-style') || 'normal';
  const src = readProperty(css, 'src');
  const hasData = /url\(\s*["']?data:/i.test(src) || /url\(\s*["']?data:/i.test(css);

  return {
    family,
    weight: weight.toLowerCase(),
    style: style.toLowerCase(),
    hasData,
    // An SVG image is rasterised once, right after it loads. `font-display:
    // swap` lets the engine paint the fallback face first, and the swap never
    // repaints — the exported bitmap keeps the system font. Force the blocking
    // strategy so the text is only painted once the embedded face is ready.
    css: css.replace(/font-display\s*:\s*[^;}]+/gi, 'font-display: block;'),
  };
}

export function collectUsedFontFamilies(root: HTMLElement): Set<string> {
  const families = new Set<string>();
  const elements = [root, ...Array.from(root.querySelectorAll('*'))];
  for (const element of elements) {
    if (!(element instanceof Element)) continue;
    const value = getComputedStyle(element).fontFamily || '';
    for (const part of value.split(',')) {
      const family = normalizeFamily(part);
      if (family) families.add(family);
    }
  }
  return families;
}

/** Diagnostic summary of which stylesheets the capture pipeline can read. */
export function summarizeDocumentFonts(): {
  sheets: number;
  accessible: number;
  blocked: number;
  families: string[];
} {
  let accessible = 0;
  let blocked = 0;
  const families = new Set<string>();
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
      accessible++;
    } catch {
      blocked++;
      continue;
    }
    for (const rule of Array.from(rules)) {
      if (rule.type !== FONT_FACE_RULE) continue;
      const family = normalizeFamily((rule as CSSFontFaceRule).style.getPropertyValue('font-family'));
      if (family) families.add(family);
    }
  }
  return { sheets: document.styleSheets.length, accessible, blocked, families: [...families] };
}

/**
 * The faces the capture will embed on its own, keyed by family+weight+style.
 * A rule that only carries `local()` is useless on a phone that does not have
 * the font installed, so `hasData` decides whether it really covers the need.
 */
function readableFaces(): Map<string, boolean> {
  const faces = new Map<string, boolean>();
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      // Cross-origin vault stylesheet (mobile): handled by the disk fallback.
      continue;
    }
    for (const rule of Array.from(rules)) {
      if (rule.type !== FONT_FACE_RULE) continue;
      const style = (rule as CSSFontFaceRule).style;
      const family = normalizeFamily(style.getPropertyValue('font-family'));
      if (!family) continue;
      const weight = (style.getPropertyValue('font-weight') || 'normal').toLowerCase();
      const fontStyle = (style.getPropertyValue('font-style') || 'normal').toLowerCase();
      const src = style.getPropertyValue('src');
      const key = `${family}|${weight}|${fontStyle}`;
      faces.set(key, Boolean(faces.get(key)) || /data:/i.test(src));
    }
  }
  return faces;
}

async function readCssFile(app: App, path: string): Promise<void> {
  const adapter = app.vault.adapter;
  let mtime = 0;
  let size = 0;
  try {
    const info = await adapter.stat(path);
    mtime = info?.mtime ?? 0;
    size = info?.size ?? 0;
  } catch {
    notes.push(`${path}: stat failed`);
    return;
  }

  const cached = fileCache.get(path);
  if (cached && cached.mtime === mtime) {
    notes.push(`${path}: cached (${cached.blocks.length} faces)`);
    return;
  }

  const readBinary = async (): Promise<string> => {
    const buffer = await adapter.readBinary(path);
    return new TextDecoder('utf-8').decode(buffer);
  };

  let css = '';
  try {
    css = await adapter.read(path);
  } catch {
    notes.push(`${path}: read() threw`);
  }

  // A truncated read keeps the head of the file and silently drops the faces
  // further down, so compare against the size the adapter reported.
  if (!css || (size > 0 && css.length < size * 0.9)) {
    try {
      const binary = await readBinary();
      if (binary.length > css.length) css = binary;
    } catch {
      // Fall through to the resource URL.
    }
  }

  if (!css) {
    // Last resort: the resource URL is served by the app itself.
    try {
      const response = await fetch(adapter.getResourcePath(path));
      css = await response.text();
    } catch {
      notes.push(`${path}: all read paths failed`);
      return;
    }
  }

  if (!css) return;

  const blocks = extractFontFaceBlocks(css)
    .map(block => parseFontFaceBlock(block))
    .filter((block): block is FontFaceBlock => Boolean(block));
  fileCache.set(path, { mtime, blocks });
  notes.push(`${path}: ${blocks.length} faces (${css.length} chars)`);
}

async function listCssFiles(app: App): Promise<string[]> {
  const adapter = app.vault.adapter;
  const configDir = app.vault.configDir;
  const files: string[] = [];

  try {
    const snippets = await adapter.list(`${configDir}/snippets`);
    files.push(...snippets.files.filter(path => path.toLowerCase().endsWith('.css')));
  } catch {
    // No snippets folder.
  }

  try {
    const appearance = JSON.parse(await adapter.read(`${configDir}/appearance.json`)) as { cssTheme?: string };
    if (appearance.cssTheme) {
      files.push(`${configDir}/themes/${appearance.cssTheme}/theme.css`);
    }
  } catch {
    // No appearance.json.
  }

  return files;
}

async function vaultFaces(app: App): Promise<FontFaceBlock[]> {
  const blocks: FontFaceBlock[] = [];
  for (const path of await listCssFiles(app)) {
    const cached = fileCache.get(path);
    if (cached) {
      blocks.push(...cached.blocks);
      continue;
    }

    await readCssFile(app, path);
    const refreshed = fileCache.get(path);
    if (refreshed) blocks.push(...refreshed.blocks);
  }

  return blocks;
}

export type FontDiagnostics = {
  files: string[];
  notes: string[];
  vaultFaces: number;
  usedFamilies: string[];
  missing: string[];
  embeddedFaces: number;
  extraFontCssBytes: number;
};

let lastDiagnostics: FontDiagnostics | undefined;

export function getFontDiagnostics(): FontDiagnostics | undefined {
  return lastDiagnostics;
}

/**
 * @font-face CSS for families used by `root` that the document cannot prove it
 * will embed with real font data. Empty string when nothing is missing.
 */
export async function collectMissingFontCss(app: App, root: HTMLElement): Promise<string> {
  notes = [];
  const used = collectUsedFontFamilies(root);
  if (used.size === 0) return '';

  const readable = readableFaces();
  const files = await listCssFiles(app);
  notes.push(`readable sheets: ${document.styleSheets.length}, usable faces: ${readable.size}`);
  const faces = await vaultFaces(app);

  const seen = new Set<string>();
  const missing = new Set<string>();
  const selected: FontFaceBlock[] = [];
  for (const face of faces) {
    if (!used.has(face.family)) continue;
    const key = `${face.family}|${face.weight}|${face.style}`;
    // The capture already embeds readable faces that carry font data.
    if (readable.get(key)) continue;
    missing.add(face.family);
    if (seen.has(key)) continue;
    if (!face.hasData) continue;
    seen.add(key);
    selected.push(face);
  }

  const css = selected.map(face => face.css).join('\n');
  lastDiagnostics = {
    files,
    notes: [...notes],
    vaultFaces: faces.length,
    usedFamilies: [...used],
    missing: [...missing],
    embeddedFaces: selected.length,
    extraFontCssBytes: css.length,
  };
  return css;
}

/**
 * Make sure every family used by the export is resolved in the document before
 * the clone is serialised; the SVG image itself still needs the bytes, but a
 * pending face can make the first paint fall back to the system font.
 */
export async function ensureFontsLoaded(root: HTMLElement): Promise<void> {
  const used = collectUsedFontFamilies(root);
  await Promise.all([...used].map(async family => {
    try {
      await document.fonts.load(`16px "${family}"`);
    } catch {
      // Unknown family on this platform; nothing to load.
    }
  }));
}
