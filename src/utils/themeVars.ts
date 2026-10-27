/**
 * Force a light/dark palette on the export subtree.
 *
 * Obsidian declares the base palette on `.theme-light` / `.theme-dark`, but the
 * derived variables (`--background-primary`, `--text-normal`, ...) are declared
 * once on `body` and resolve there. Adding a theme class to a nested element
 * therefore only swaps the base palette and leaves every derived colour from
 * the app theme — a nested `.theme-light` inside a dark app still exports dark
 * surfaces.
 *
 * Instead we read the whole custom-property set from a temporarily re-classed
 * `body` and replay it inline on the export root. The class swap and the read
 * happen in one synchronous task, so the browser never paints the intermediate
 * state and the app UI is untouched.
 */

type ResolvedTheme = 'light' | 'dark';

type ThemeSnapshot = {
  signature: string;
  vars: Record<string, string>;
};

const snapshots = new Map<ResolvedTheme, ThemeSnapshot>();
const appliedVars = new WeakMap<HTMLElement, string[]>();

/** The theme Obsidian is currently rendering the app with. */
export function currentAppTheme(): ResolvedTheme {
  return document.body.classList.contains('theme-dark') ? 'dark' : 'light';
}

/**
 * Palette variables depend on the active theme, the accent colour and any
 * loaded snippet, so the cache is keyed by everything that can change them.
 */
function themeSignature(): string {
  return [
    document.body.className,
    document.body.getAttribute('style') ?? '',
    document.documentElement.className,
  ].join('|');
}

/**
 * Fallback for builds where `getComputedStyle()` does not enumerate custom
 * properties: collect every declared variable name from the loaded sheets and
 * read the values one by one.
 */
function collectDeclaredVariableNames(): string[] {
  const names = new Set<string>();
  const visit = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      const nested = (rule as CSSGroupingRule).cssRules;
      if (nested) {
        visit(nested);
        continue;
      }
      for (const match of (rule.cssText ?? '').matchAll(/(--[\w-]+)\s*:/g)) {
        names.add(match[1]);
      }
    }
  };

  for (const sheet of Array.from(document.styleSheets)) {
    try {
      visit(sheet.cssRules);
    } catch {
      // Cross-origin sheets cannot be inspected; skip them.
    }
  }
  return [...names];
}

function readThemeSnapshot(theme: ResolvedTheme): ThemeSnapshot {
  const signature = themeSignature();
  const cached = snapshots.get(theme);
  if (cached?.signature === signature) return cached;

  const body = document.body;
  const previousClass = body.className;
  try {
    body.classList.toggle('theme-dark', theme === 'dark');
    body.classList.toggle('theme-light', theme === 'light');
    // Reading a layout property flushes the style recalculation. The class is
    // restored before this task ends, so no frame is ever painted with it.
    void body.offsetHeight;

    const computed = getComputedStyle(body);
    const vars: Record<string, string> = {};
    for (let index = 0; index < computed.length; index++) {
      const name = computed[index];
      if (!name.startsWith('--')) continue;
      const value = computed.getPropertyValue(name);
      if (value) vars[name] = value;
    }

    if (Object.keys(vars).length === 0) {
      for (const name of collectDeclaredVariableNames()) {
        const value = computed.getPropertyValue(name);
        if (value) vars[name] = value;
      }
    }

    const snapshot = { signature, vars };
    snapshots.set(theme, snapshot);
    return snapshot;
  } finally {
    body.className = previousClass;
  }
}

/** Drop every inline variable this module added to `el`. */
export function clearExportTheme(el: HTMLElement): void {
  const names = appliedVars.get(el);
  if (!names) return;
  for (const name of names) el.style.removeProperty(name);
  appliedVars.delete(el);
}

/**
 * Replay the target palette on `el`.
 *
 * `follow` (or a target that already matches the app theme) removes a previous
 * override and lets the app theme through. The element's own theme class is
 * rendered by React (`Target`), so selector-scoped rules such as
 * `.theme-light .callout` also match.
 */
export function applyExportTheme(el: HTMLElement, theme: ThemeMode | undefined): void {
  clearExportTheme(el);
  if (theme !== 'light' && theme !== 'dark') return;
  if (theme === currentAppTheme()) return;

  const { vars } = readThemeSnapshot(theme);
  const names: string[] = [];
  for (const [name, value] of Object.entries(vars)) {
    el.style.setProperty(name, value);
    names.push(name);
  }

  // `color` is a regular property, not a variable: without it the root keeps
  // the app theme's inherited text colour even though the palette changed.
  el.style.setProperty('color', 'var(--text-normal)');
  names.push('color');

  appliedVars.set(el, names);
}
