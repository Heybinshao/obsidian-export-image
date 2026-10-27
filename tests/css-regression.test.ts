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

  it('pins the export modal to the dialog height and scrolls the settings column', () => {
    expect(css).toMatch(/\.modal\.export-image-modal\s*\{[^}]*height:\s*var\(--dialog-max-height/s);
    expect(css).toMatch(/\.modal\.export-image-modal \.export-image-preview-left\s*\{[^}]*overflow-y:\s*auto/s);
    expect(css).toMatch(/\.modal\.export-image-modal \.export-image-preview-right\s*\{[^}]*display:\s*flex/s);
    expect(css).toMatch(/\.modal\.export-image-modal \.export-image-preview-out\s*\{[^}]*flex:\s*1 1 auto/s);
  });

  it('centres the avatar crop and keeps its gap out of the settings preview', () => {
    expect(css).toMatch(/\.user-info-avatar\s*\{[^}]*background-position:\s*center/s);
    expect(css).toMatch(/\.export-image-root \.user-info-avatar\s*\{[^}]*margin:\s*0 20px 0 0/s);
    // The base class must not carry the export gap, otherwise the avatar in the
    // settings row is pushed 20px away from its buttons.
    expect(css).not.toMatch(/\n\.user-info-avatar\s*\{[^}]*margin:\s*0 20px 0 0/s);
  });

  it('keeps the avatar preview inside its circle even with global img snippets', () => {
    // A vault snippet like `img:not(.thumbnailImage) { margin-block: 2em;
    // height: auto; border: 1px solid }` has the same specificity and loads
    // later, so these declarations must be !important.
    expect(css).toMatch(/\.user-info-avatar img\s*\{[^}]*position:\s*absolute\s*!important/s);
    expect(css).toMatch(/\.user-info-avatar img\s*\{[^}]*inset:\s*0\s*!important/s);
    expect(css).toMatch(/\.user-info-avatar img\s*\{[^}]*height:\s*100%\s*!important/s);
    expect(css).toMatch(/\.user-info-avatar img\s*\{[^}]*margin:\s*0\s*!important/s);
    expect(css).toMatch(/\.user-info-avatar img\s*\{[^}]*border:\s*none\s*!important/s);
  });

  it('ships the phone layout: tabs, full-height preview and 44px touch targets', () => {
    expect(css).toMatch(/\.is-phone \.export-image-mobile-tabs\s*\{[^}]*display:\s*flex/s);
    expect(css).toMatch(/\.is-phone \.export-image-file-modal \.export-image-preview-out\s*\{[^}]*flex:\s*1 1 auto/s);
    expect(css).toMatch(/\.is-phone \.export-image-preview-actions button\s*\{[^}]*min-height:\s*44px/s);
    expect(css).toMatch(/\.is-phone \.export-image-select-photo-main\s*\{[^}]*flex-direction:\s*column-reverse/s);
    expect(css).toMatch(/\.export-image-select-item\s*\{[^}]*min-height:\s*44px/s);
  });
});
