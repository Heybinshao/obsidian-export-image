// eslint-disable-next-line @typescript-eslint/naming-convention
export const DEFAULT_SETTINGS: ISettings = {
  width: 640,
  showFilename: true,
  // eslint-disable-next-line @typescript-eslint/naming-convention
  resolutionMode: '3x' as ResolutionMode,
  format: 'png0',
  showMetadata: false,
  recursive: false,
  quickExportSelection: false,
  padding: {
    top: 6,
    right: 6,
    bottom: 6,
    left: 6,
  },
  authorInfo: {
    show: false,
    align: 'right',
    position: 'bottom',
  },
  watermark: {
    enable: false,
    type: 'text',
    text: {
      content: '',
      fontSize: 28,
      color: '#cccccc',
    },
    image: {
      src: '',
    },
    opacity: 0.2,
    rotate: 30,
    height: 64,
    width: 120,
    x: 100,
    y: 100,
  },
  split: {
    height: 1000,
    overlap: 80,
    mode: 'none' as SplitMode,
  },
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepMerge<T>(base: T, override: unknown): T {
  if (!isObject(base)) {
    return (override === undefined ? base : override) as T;
  }

  const result: Record<string, unknown> = { ...base };
  if (isObject(override)) {
    for (const [key, value] of Object.entries(override)) {
      if (value === undefined) continue;
      const baseValue = (base as Record<string, unknown>)[key];
      result[key] = isObject(baseValue) && isObject(value)
        ? deepMerge(baseValue, value)
        : value;
    }
  }

  return result as T;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

/**
 * Merge persisted settings with defaults and migrate the pre-2.4 shape
 * (`2x: true` instead of `resolutionMode`). A shallow spread used to drop
 * nested keys such as `padding`, producing `undefinedpx` in the export style.
 */
export function normalizeSettings(raw: unknown): ISettings {
  const data = isObject(raw) ? raw : {};
  const merged = deepMerge(DEFAULT_SETTINGS, data);

  if (data.resolutionMode === undefined && data['2x'] === true) {
    merged.resolutionMode = '2x';
  }
  if (!['1x', '2x', '3x', '4x'].includes(merged.resolutionMode)) {
    merged.resolutionMode = DEFAULT_SETTINGS.resolutionMode;
  }
  if (!['png0', 'png1', 'jpg', 'webp', 'pdf'].includes(merged.format)) {
    merged.format = DEFAULT_SETTINGS.format;
  }
  if (!['none', 'fixed', 'hr', 'auto'].includes(merged.split.mode)) {
    merged.split.mode = 'none';
  }

  merged.width = clampNumber(merged.width, 20, 4000, DEFAULT_SETTINGS.width ?? 640);
  merged.padding = {
    top: clampNumber(merged.padding?.top, 0, 500, DEFAULT_SETTINGS.padding.top),
    right: clampNumber(merged.padding?.right, 0, 500, DEFAULT_SETTINGS.padding.right),
    bottom: clampNumber(merged.padding?.bottom, 0, 500, DEFAULT_SETTINGS.padding.bottom),
    left: clampNumber(merged.padding?.left, 0, 500, DEFAULT_SETTINGS.padding.left),
  };
  merged.split = {
    ...merged.split,
    height: clampNumber(merged.split?.height, 50, 20_000, DEFAULT_SETTINGS.split.height),
    overlap: clampNumber(merged.split?.overlap, 0, 5000, DEFAULT_SETTINGS.split.overlap),
  };
  merged.watermark = {
    ...merged.watermark,
    opacity: clampNumber(merged.watermark?.opacity, 0, 1, DEFAULT_SETTINGS.watermark.opacity ?? 0.2),
    rotate: clampNumber(merged.watermark?.rotate, -180, 180, DEFAULT_SETTINGS.watermark.rotate ?? 30),
    width: clampNumber(merged.watermark?.width, 1, 5000, DEFAULT_SETTINGS.watermark.width ?? 120),
    height: clampNumber(merged.watermark?.height, 1, 5000, DEFAULT_SETTINGS.watermark.height ?? 64),
    x: clampNumber(merged.watermark?.x, 1, 5000, DEFAULT_SETTINGS.watermark.x ?? 100),
    y: clampNumber(merged.watermark?.y, 1, 5000, DEFAULT_SETTINGS.watermark.y ?? 100),
  };

  return merged;
}
