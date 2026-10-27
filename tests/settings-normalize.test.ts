import { describe, expect, it } from 'vitest';
import { normalizeSettings } from '../src/settings-normalize';

describe('normalizeSettings', () => {
  it('migrates the legacy 2x key and restores nested defaults', () => {
    const settings = normalizeSettings({
      width: 640,
      '2x': true,
      format: 'png0',
      watermark: { enable: true },
      split: { height: 1000, overlap: 80, mode: 'none' },
    });

    expect(settings.resolutionMode).toBe('2x');
    expect(settings.padding).toEqual({ top: 50, right: 50, bottom: 50, left: 50 });
    expect(settings.watermark.opacity).toBe(0.2);
    expect(settings.watermark.width).toBe(120);
    expect(settings.split.height).toBe(1000);
  });

  it('clamps invalid values instead of producing NaN styles', () => {
    const settings = normalizeSettings({
      width: 0,
      padding: { top: 'x' },
      split: { mode: 'bad', height: -1, overlap: -1 },
      resolutionMode: '9x',
    });

    expect(settings.width).toBe(20);
    expect(settings.padding).toEqual({ top: 50, right: 50, bottom: 50, left: 50 });
    expect(settings.split.mode).toBe('none');
    expect(settings.split.height).toBe(50);
    expect(settings.split.overlap).toBe(0);
    expect(settings.resolutionMode).toBe('3x');
  });

  it('does not let a legacy 2x key override an explicit resolutionMode', () => {
    const settings = normalizeSettings({ '2x': true, resolutionMode: '4x' });
    expect(settings.resolutionMode).toBe('4x');
  });

  it('defaults the new content and table switches to off', () => {
    const settings = normalizeSettings({});
    expect(settings.stripNoteInfo).toBe(false);
    expect(settings.tableForceWrap).toBe(false);
  });

  it('does not treat a truthy string as an enabled switch', () => {
    const settings = normalizeSettings({ stripNoteInfo: 'true', tableForceWrap: 'yes' });
    expect(settings.stripNoteInfo).toBe(false);
    expect(settings.tableForceWrap).toBe(false);
  });

  it('defaults the export theme to follow and rejects unknown values', () => {
    expect(normalizeSettings({}).themeMode).toBe('follow');
    expect(normalizeSettings({ themeMode: 'dark' }).themeMode).toBe('dark');
    expect(normalizeSettings({ themeMode: 'sepia' }).themeMode).toBe('follow');
  });
});
