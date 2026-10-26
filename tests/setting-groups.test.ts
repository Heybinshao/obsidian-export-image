import { describe, expect, it } from 'vitest';
import { SETTING_GROUPS, groupForPath, groupRank } from '../src/settingGroups';

describe('setting groups', () => {
  it('keeps the planned group order', () => {
    expect(SETTING_GROUPS.map(group => group.id)).toEqual([
      'output',
      'layout',
      'content',
      'table',
      'split',
      'author',
      'watermark',
    ]);
  });

  it('maps settings to the right group', () => {
    expect(groupForPath('width')).toBe('output');
    expect(groupForPath('padding.top')).toBe('layout');
    expect(groupForPath('stripNoteInfo')).toBe('content');
    expect(groupForPath('showMetadata')).toBe('content');
    expect(groupForPath('tableForceWrap')).toBe('table');
    expect(groupForPath('split.mode')).toBe('split');
    expect(groupForPath('authorInfo.avatar')).toBe('author');
    expect(groupForPath('watermark.enable')).toBe('watermark');
  });

  it('sorts groups in display order', () => {
    expect(groupRank('output')).toBeLessThan(groupRank('layout'));
    expect(groupRank('layout')).toBeLessThan(groupRank('content'));
    expect(groupRank('content')).toBeLessThan(groupRank('table'));
    expect(groupRank('table')).toBeLessThan(groupRank('split'));
    expect(groupRank('split')).toBeLessThan(groupRank('author'));
    expect(groupRank('author')).toBeLessThan(groupRank('watermark'));
  });
});
