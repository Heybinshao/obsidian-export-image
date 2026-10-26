export type SettingGroupId =
  | 'output'
  | 'layout'
  | 'content'
  | 'table'
  | 'split'
  | 'author'
  | 'watermark';

export interface SettingGroup {
  id: SettingGroupId;
  title: string;
  description: string;
}

/** Display order is the array order. */
export const SETTING_GROUPS: SettingGroup[] = [
  {
    id: 'output',
    title: '基础输出',
    description: '画布尺寸、清晰度、文件格式与快速导出。',
  },
  {
    id: 'layout',
    title: '版式与边距',
    description: '控制导出图四周的留白。',
  },
  {
    id: 'content',
    title: '内容信息',
    description: '控制文件名与笔记属性是否进入导出图。',
  },
  {
    id: 'table',
    title: '表格',
    description: '控制超宽表格的换行策略。',
  },
  {
    id: 'split',
    title: '长图分割',
    description: '把超长笔记拆成多张图或一个多页 PDF。',
  },
  {
    id: 'author',
    title: '作者信息',
    description: '导出图顶部或底部的署名区域。',
  },
  {
    id: 'watermark',
    title: '水印',
    description: '文字或图片水印。',
  },
];

export function groupRank(id?: string): number {
  const index = SETTING_GROUPS.findIndex(group => group.id === id);
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}

export function groupForPath(path: string): SettingGroupId {
  if (path.startsWith('padding.')) return 'layout';
  if (path.startsWith('split.')) return 'split';
  if (path.startsWith('authorInfo.')) return 'author';
  if (path.startsWith('watermark.')) return 'watermark';
  if (path === 'tableForceWrap') return 'table';
  if (['showFilename', 'showMetadata', 'stripNoteInfo'].includes(path)) return 'content';
  return 'output';
}
