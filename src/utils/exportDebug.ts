import { Platform, type App } from 'obsidian';

/**
 * Temporary diagnostics for the mobile export path. Writes a small JSON next to
 * the plugin so the desktop side can read what the phone actually did (platform
 * flags, font faces found, share result) without a console.
 */
let state: Record<string, unknown> = {};

export function debugReset(extra: Record<string, unknown>): void {
  state = {
    at: new Date().toISOString(),
    platform: {
      isMobile: Platform.isMobile,
      isPhone: Platform.isPhone,
      isTablet: Platform.isTablet,
      bodyClass: document.body.className,
    },
    ...extra,
  };
}

export function debugSet(key: string, value: unknown): void {
  state[key] = value;
}

export async function debugFlush(app: App): Promise<void> {
  try {
    const path = `${app.vault.configDir}/plugins/obsidian-export-image/export-debug.json`;
    await app.vault.adapter.write(path, JSON.stringify(state, null, 2));
  } catch (error) {
    console.warn('export-image: could not write export-debug.json', error);
  }
}
