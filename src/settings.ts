import { isCreatable } from './imageFormatTester';

export { DEFAULT_SETTINGS, normalizeSettings } from './settings-normalize';

const knownFormats: FileFormat[] = ['png0', 'png1', 'jpg', 'pdf'];

/** Formats every Chromium build can encode; `webp` is appended if supported. */
export const formatAvailable: FileFormat[] = [...knownFormats];

/** Resolves after the optional format probe has finished. */
export const formatReady: Promise<void> = (async () => {
  if (formatAvailable.includes('webp')) return;
  if (await isCreatable('webp')) {
    const pdfIndex = formatAvailable.indexOf('pdf');
    formatAvailable.splice(pdfIndex >= 0 ? pdfIndex : formatAvailable.length, 0, 'webp');
  }
})();
