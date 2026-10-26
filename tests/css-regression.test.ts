import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/settings-normalize';

const css = readFileSync('styles.css', 'utf8');

describe('CSS regressions', () => {
  it('does not contain the old invalid alignitems property', () => {
    expect(css).not.toMatch(/alignitems\s*:/i);
  });

  it('centers the author info row', () => {
    expect(css).toMatch(/\.export-image-root \.user-info-container\s*\{[^}]*align-items:\s*center/s);
    expect(css).toMatch(/\.user-info-text\s*\{[^}]*justify-content:\s*center/s);
  });

  it('clips the avatar image into the circular frame', () => {
    expect(css).toMatch(/\.user-info-avatar img\s*\{[^}]*position:\s*absolute/s);
    expect(css).toMatch(/\.user-info-avatar img\s*\{[^}]*inset:\s*0/s);
    expect(css).toMatch(/\.user-info-avatar img\s*\{[^}]*border-radius:\s*50%/s);
  });

  it('keeps the requested 50px default padding', () => {
    expect(DEFAULT_SETTINGS.padding).toEqual({ top: 50, right: 50, bottom: 50, left: 50 });
    expect(DEFAULT_SETTINGS.stripNoteInfo).toBe(false);
    expect(DEFAULT_SETTINGS.tableForceWrap).toBe(false);
  });

  it('only forces table wrapping when the opt-in class is present', () => {
    expect(css).toMatch(/\.export-image-root\.export-image-table-force-wrap table\s*\{[^}]*table-layout:\s*fixed/s);
    expect(css).toMatch(/\.export-image-root\.export-image-table-force-wrap th[\s\S]*white-space:\s*normal/s);
  });
});
