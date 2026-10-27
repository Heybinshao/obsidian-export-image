import {
  Notice, requestUrl, type App, type TFile,
} from 'obsidian';
import { inlineCalloutIconsDynamic } from './calloutIcons';
import saveAs from 'file-saver';
import JsPdf from 'jspdf';
import JSZip from 'jszip';
import domtoimage from '../dom-to-image-more';
import L from '../L';
import makeHTML from './makeHTML';
import { fileToBase64, getMime } from '.';
import { nextFrame, waitForFonts } from './renderHost';
import { calculateSplitPositions, getElementMeasures } from './split';
import { collectMissingFontCss, collectUsedFontFamilies, ensureFontsLoaded, getFontDiagnostics, summarizeDocumentFonts } from './fontSources';
import { debugFlush, debugReset, debugSet } from './exportDebug';
import { isMobileApp } from './platform';

export class ExportCancelledError extends Error {
  constructor() {
    super('export cancelled');
    this.name = 'ExportCancelledError';
  }
}

async function getBlob(app: App, el: HTMLElement, resolutionMode: ResolutionMode, type: string): Promise<Blob> {
  // Inline callout icons before capture (inject fallbacks if needed for export)
  await inlineCalloutIconsDynamic(el, false, true);
  await waitForFonts();
  await ensureFontsLoaded(el);
  await nextFrame();

  const scale = getEffectiveScale(el, resolutionMode);
  const extraFontCss = await collectMissingFontCss(app, el);
  const mobile = isMobileApp();
  if (mobile) {
    debugReset({
      families: [...collectUsedFontFamilies(el)],
      documentFonts: summarizeDocumentFonts(),
      fontSources: getFontDiagnostics(),
      extraFontCssBytes: extraFontCss.length,
      skipLocalFonts: !mobile,
      scale,
      width: el.clientWidth,
      height: el.clientHeight,
    });
  }

  const blob = await domtoimage.toBlob(el, {
    width: el.clientWidth,
    height: el.clientHeight,
    quality: 0.85,
    scale: scale,
    requestUrl,
    type,
    // On desktop the user's font is usually installed locally; embedding the
    // 32 MB base64 copy into every SVG is the main export slowdown.
    skipLocalFonts: !mobile,
    extraFontCss,
  }) as Blob;

  if (mobile) {
    debugSet('blobBytes', blob.size);
    await debugFlush(app);
  }

  return blob;
}

function getScale(resolutionMode: ResolutionMode): number {
  return resolutionMode === '2x' ? 2 : resolutionMode === '3x' ? 3 : resolutionMode === '4x' ? 4 : 1;
}

/**
 * Mobile Safari/WebView dies when a canvas exceeds roughly 16M pixels; a 3x
 * export of a long note easily crosses that and the export appears to hang.
 * Lower the scale instead of allocating an impossible canvas.
 */
function getEffectiveScale(el: HTMLElement, resolutionMode: ResolutionMode): number {
  const requested = getScale(resolutionMode);
  const area = el.clientWidth * el.clientHeight;
  if (!area) return requested;

  const maxArea = isMobileApp() ? 16_000_000 : 64_000_000;
  const maxScale = Math.sqrt(maxArea / area);
  const effective = Math.max(1, Math.min(requested, Math.floor(maxScale * 100) / 100));
  if (effective < requested) {
    console.warn(`export-image: scale reduced from ${requested}x to ${effective}x to fit the canvas budget`);
    // Mobile users have no console; a blurry image without explanation reads
    // as a bug. Warn once per session.
    if (isMobileApp() && !scaleWarningShown) {
      scaleWarningShown = true;
      new Notice(`图片较长，已按设备内存把清晰度降到 ${effective}x`);
    }
  }

  return effective;
}

let scaleWarningShown = false;

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('canvas.toBlob returned null'));
    }, type, 0.85);
  });
}

async function getFullCanvas(app: App, el: HTMLElement, resolutionMode: ResolutionMode): Promise<HTMLCanvasElement> {
  await inlineCalloutIconsDynamic(el, false, true);
  await waitForFonts();
  await ensureFontsLoaded(el);
  await nextFrame();

  const extraFontCss = await collectMissingFontCss(app, el);
  if (isMobileApp()) {
    debugSet('fontSources', getFontDiagnostics());
    debugSet('splitExtraFontCssBytes', extraFontCss.length);
  }

  return domtoimage.toCanvas(el, {
    width: el.clientWidth,
    height: el.clientHeight,
    scale: getEffectiveScale(el, resolutionMode),
    requestUrl,
    skipLocalFonts: !isMobileApp(),
    extraFontCss,
  }) as Promise<HTMLCanvasElement>;
}

async function makePdf(blob: Blob, el: HTMLElement) {
  const dataUrl = await fileToBase64(blob);
  const pdf = new JsPdf({
    unit: 'in',
    format: [el.clientWidth / 96, el.clientHeight / 96],
    orientation: el.clientWidth > el.clientHeight ? 'l' : 'p',
    compress: true,
  });
  pdf.addImage(
    dataUrl,
    'PNG',
    0,
    0,
    el.clientWidth / 96,
    el.clientHeight / 96,
  );
  return pdf;
}

type ShareResult = 'shared' | 'cancelled' | 'inactive' | 'unsupported';

/** `awaiting-share` = the bitmap is ready but the tap's activation expired. */
export type SaveOutcome = 'done' | 'awaiting-share';

function toFile(blob: Blob, filename: string): File {
  return new File([blob], filename, { type: blob.type || 'image/png' });
}

/**
 * Web Share needs a live user gesture. A 3x capture of a long note can outlast
 * it, so when the browser reports NotAllowedError we keep the rendered files
 * and let the dialog offer a dedicated share button — its own tap is a fresh
 * gesture, unlike asking the user to press the export button again.
 */
let pendingShare: { files: File[]; title: string } | undefined;

export function hasPendingShare(): boolean {
  return Boolean(pendingShare?.files.length);
}

async function shareFiles(files: File[], title: string): Promise<ShareResult> {
  if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') {
    return 'unsupported';
  }
  if (!navigator.canShare({ files })) {
    return 'unsupported';
  }

  try {
    await navigator.share({ files, title });
    return 'shared';
  } catch (error) {
    if ((error as Error).name === 'AbortError') return 'cancelled';
    if ((error as Error).name === 'NotAllowedError') return 'inactive';
    console.warn('export-image: share sheet failed', error);
    return 'unsupported';
  }
}

async function shareMobile(files: File[], title: string): Promise<SaveOutcome> {
  const result = await shareFiles(files, title);
  debugSet('share', { result, files: files.length, bytes: files.reduce((sum, file) => sum + file.size, 0) });
  if (result === 'shared') {
    pendingShare = undefined;
    new Notice('已打开系统分享面板');
    return 'done';
  }
  if (result === 'cancelled') {
    pendingShare = undefined;
    return 'done';
  }
  if (result === 'inactive') {
    pendingShare = { files, title };
    return 'awaiting-share';
  }
  pendingShare = undefined;
  new Notice('当前环境不支持系统分享，图片没有导出');
  return 'done';
}

/** Share the files rendered by the previous attempt, from a fresh tap. */
export async function sharePendingFiles(): Promise<SaveOutcome> {
  if (!pendingShare) return 'done';
  const { files, title } = pendingShare;
  return shareMobile(files, title);
}

export function discardPendingShare(): void {
  pendingShare = undefined;
}

async function saveMobile(blob: Blob, filename: string, title: string): Promise<SaveOutcome> {
  return shareMobile([toFile(blob, filename)], title);
}

export async function save(
  app: App,
  el: HTMLElement,
  title: string,
  resolutionMode: ResolutionMode,
  format: FileFormat,
  isMobile: boolean,
  shouldCancel?: () => boolean,
): Promise<SaveOutcome> {
  const blob: Blob = await getBlob(
    app,
    el,
    resolutionMode,
    format === 'pdf' ? 'image/png' : getMime(format),
  );
  if (shouldCancel?.()) throw new ExportCancelledError();
  const filename = `${title.replaceAll(/\s+/g, '_')}.${format.replace(/\d$/, '')}`;
  switch (format) {
    case 'jpg':
    case 'webp':
    case 'png0':
    case 'png1': {
      if (isMobile) {
        const outcome = await saveMobile(blob, filename, title);
        await debugFlush(app);
        return outcome;
      }

      saveAs(blob, filename);
      return 'done';
    }

    case 'pdf': {
      const pdf = await makePdf(blob, el);
      if (isMobile) {
        const outcome = await saveMobile(
          new Blob([pdf.output('arraybuffer')], { type: 'application/pdf' }),
          filename,
          title,
        );
        await debugFlush(app);
        return outcome;
      }

      pdf.save(filename);
      return 'done';
    }
  }

  return 'done';
}

export async function copy(
  app: App,
  el: HTMLElement,
  resolutionMode: ResolutionMode,
  format: FileFormat,
) {
  if (format === 'pdf') {
    new Notice(L.copyNotAllowed());
    return;
  }

  const blob = await getBlob(
    app,
    el,
    resolutionMode,
    getMime(format),
  );
  const data: ClipboardItem[] = [];
  data.push(
    new ClipboardItem({
      [blob.type]: blob,
    }),
  );
  await navigator.clipboard.write(data);
  new Notice(L.copiedSuccess());
}

export async function saveMultipleFiles(
  files: TFile[],
  settings: ISettings,
  onProgress: (finished: number) => void,
  app: App,
  folderName: string,
  containner: HTMLDivElement,
) {
  let finished = 0;
  const { format, resolutionMode, split } = settings;

  for (const file of files) {
    const { element, contentElement } = await makeHTML(file, settings, app, containner);

    const target = {
      element,
      contentElement,
      setClip: (startY: number, height: number) => {
        element.style.height = `${height}px`;
        element.style.overflow = 'hidden';
        contentElement.style.transform = `translateY(-${startY}px)`;
      },
      resetClip: () => {
        element.style.height = '';
        element.style.overflow = '';
        contentElement.style.transform = '';
      },
    };

    await saveAll(
      target,
      format,
      resolutionMode,
      split.height,
      split.overlap,
      split.mode,
      app,
      file.basename,
    );

    finished++;
    onProgress(finished);
  }
}

export async function getRemoteImageUrl(url?: string) {
  if (!url || !url.startsWith('http')) {
    return url;
  }
  try {
    const response = await requestUrl({
      url,
      method: 'GET',
    });
    const blob = new Blob([response.arrayBuffer], { type: response.headers['content-type'] || 'application/octet-stream' });
    const res = URL.createObjectURL(blob);
    return res;
  } catch (error) {
    console.error('Failed to load image:', error);
    return url;
  }
}

export async function saveAll(
  target: { element: HTMLElement; contentElement: HTMLElement; setClip: (startY: number, height: number) => void; resetClip: () => void },
  format: FileFormat,
  resolutionMode: ResolutionMode,
  splitHeight: number,
  splitOverlap: number,
  splitMode: SplitMode,
  app: App,
  title: string,
  shouldCancel?: () => boolean,
): Promise<SaveOutcome> {
  try {
    // 计算需要分割的页数和位置
    const totalHeight = target.contentElement.clientHeight;
    const elements = getElementMeasures(target.contentElement, splitMode);

    const splitPositions = calculateSplitPositions({
      mode: splitMode,
      height: splitHeight,
      overlap: splitOverlap,
      totalHeight,
    }, elements);

    // A note without <hr> in hr mode used to produce no pages at all.
    if (splitPositions.length === 0) {
      splitPositions.push({ startY: 0, height: Math.max(1, totalHeight) });
    }

    const scale = getEffectiveScale(target.contentElement, resolutionMode);
    const pageWidth = target.contentElement.clientWidth;
    const fullHeight = target.contentElement.clientHeight;
    const maxArea = isMobileApp() ? 16_000_000 : 64_000_000;

    // Render the whole note once and crop pages from that bitmap. The old
    // loop re-cloned the DOM, re-embedded fonts and re-inlined images for
    // every page, so a 5-page split cost roughly 5× a single export.
    let fullCanvas: HTMLCanvasElement | undefined;
    if (pageWidth > 0 && fullHeight > 0 && pageWidth * scale * fullHeight * scale <= maxArea) {
      try {
        fullCanvas = await getFullCanvas(app, target.contentElement, resolutionMode);
      } catch (error) {
        console.error('export-image: full canvas failed, falling back to per-page render', error);
      }
    }

    const pageBlob = async (startY: number, height: number, type: string): Promise<Blob> => {
      if (shouldCancel?.()) throw new ExportCancelledError();
      if (fullCanvas) {
        const pixelScale = fullCanvas.width / pageWidth;
        const sourceY = Math.min(
          fullCanvas.height - 1,
          Math.max(0, Math.round(startY * pixelScale)),
        );
        const sourceHeight = Math.max(
          1,
          Math.min(fullCanvas.height - sourceY, Math.round(height * pixelScale)),
        );
        const page = document.createElement('canvas');
        page.width = fullCanvas.width;
        page.height = sourceHeight;
        const context = page.getContext('2d');
        if (!context) throw new Error('cannot create 2d context for split page');
        context.drawImage(
          fullCanvas,
          0,
          sourceY,
          fullCanvas.width,
          sourceHeight,
          0,
          0,
          page.width,
          page.height,
        );
        return canvasToBlob(page, type);
      }

      target.setClip(startY, height);
      await nextFrame();
      await nextFrame(); // 等待布局与字体稳定
      return getBlob(app, target.element, resolutionMode, type);
    };

    if (format === 'pdf') {
      // PDF 格式：创建多页 PDF
      let pdf: JsPdf | undefined;

      for (const { startY, height } of splitPositions) {
        const blob = await pageBlob(startY, height, 'image/png');
        const dataUrl = await fileToBase64(blob);

        if (!pdf) {
          pdf = new JsPdf({
            unit: 'in',
            format: [pageWidth / 96, height / 96],
            orientation: pageWidth > height ? 'l' : 'p',
            compress: true,
          });
        } else {
          pdf.addPage([pageWidth / 96, height / 96], pageWidth > height ? 'l' : 'p');
        }

        pdf.addImage(dataUrl, 'PNG', 0, 0, pageWidth / 96, height / 96);
      }

      const filename = `${title.replaceAll(/\s+/g, '_')}.pdf`;
      if (isMobileApp()) {
        const outcome = await saveMobile(
          new Blob([pdf!.output('arraybuffer')], { type: 'application/pdf' }),
          filename,
          title,
        );
        await debugFlush(app);
        return outcome;
      }

      pdf?.save(filename);
      return 'done';
    }

    // 其他图片格式：分别保存每个部分
    const ext = format.replace(/\d$/, '');
    const zip = new JSZip();
    const blobs: { blob: Blob; filename: string }[] = [];

    for (let i = 0; i < splitPositions.length; i++) {
      const { startY, height } = splitPositions[i];
      const blob = await pageBlob(startY, height, getMime(format));
      const filename = `${title.replaceAll(/\s+/g, '_')}_${i + 1}.${ext}`;
      blobs.push({ blob, filename });
    }

    if (isMobileApp()) {
      // One share sheet with every page attached; the user saves them to
      // Photos/Files from there. Never write into the vault on mobile.
      const outcome = await shareMobile(
        blobs.map(({ blob, filename }) => toFile(blob, filename)),
        title,
      );
      await debugFlush(app);
      return outcome;
    }

    // 在桌面端创建 zip
    for (const { blob, filename } of blobs) {
      zip.file(filename, blob);
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    saveAs(zipBlob, `${title.replaceAll(/\s+/g, '_')}.zip`);
    return 'done';
  } finally {
    // 确保无论成功还是失败都恢复原始状态
    target.resetClip();
  }
}
