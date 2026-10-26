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

  it('keeps the requested 20px default padding', () => {
    expect(DEFAULT_SETTINGS.padding).toEqual({ top: 20, right: 20, bottom: 20, left: 20 });
  });
});
