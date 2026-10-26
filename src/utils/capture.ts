import {
  Notice, Platform, requestUrl, type App, type TFile,
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

async function getBlob(el: HTMLElement, resolutionMode: ResolutionMode, type: string): Promise<Blob> {
  // Inline callout icons before capture (inject fallbacks if needed for export)
  await inlineCalloutIconsDynamic(el, false, true);
  await waitForFonts();
  await nextFrame();

  const scale = getScale(resolutionMode);
  return domtoimage.toBlob(el, {
    width: el.clientWidth,
    height: el.clientHeight,
    quality: 0.85,
    scale: scale,
    requestUrl,
    type,
    // On desktop the user's font is usually installed locally; embedding the
    // 32 MB base64 copy into every SVG is the main export slowdown.
    skipLocalFonts: !Platform.isMobile,
  }) as Promise<Blob>;
}

function getScale(resolutionMode: ResolutionMode): number {
  return resolutionMode === '2x' ? 2 : resolutionMode === '3x' ? 3 : resolutionMode === '4x' ? 4 : 1;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('canvas.toBlob returned null'));
    }, type, 0.85);
  });
}

async function getFullCanvas(el: HTMLElement, resolutionMode: ResolutionMode): Promise<HTMLCanvasElement> {
  await inlineCalloutIconsDynamic(el, false, true);
  await waitForFonts();
  await nextFrame();

  return domtoimage.toCanvas(el, {
    width: el.clientWidth,
    height: el.clientHeight,
    scale: getScale(resolutionMode),
    requestUrl,
    skipLocalFonts: !Platform.isMobile,
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

async function saveToVault(app: App, blob: Blob, filename: string) {
  const filePath = await app.fileManager.getAvailablePathForAttachment(filename);
  await app.vault.createBinary(filePath, await blob.arrayBuffer());
  return filePath;
}

export async function save(
  app: App,
  el: HTMLElement,
  title: string,
  resolutionMode: ResolutionMode,
  format: FileFormat,
  isMobile: boolean,
) {
  const blob: Blob = await getBlob(
    el,
    resolutionMode,
    format === 'pdf' ? 'image/png' : getMime(format),
  );
  const filename = `${title.replaceAll(/\s+/g, '_')}.${format.replace(/\d$/, '')}`;
  switch (format) {
    case 'jpg':
    case 'webp':
    case 'png0':
    case 'png1': {
      if (isMobile) {
        const filePath = await app.fileManager.getAvailablePathForAttachment(
          filename,
        );
        await app.vault.createBinary(filePath, await blob.arrayBuffer());
        new Notice(L.saveSuccess({ filePath }));
      } else {
        saveAs(blob, filename);
      }

      break;
    }

    case 'pdf': {
      const pdf = await makePdf(blob, el);
      if (isMobile) {
        const filePath = await app.fileManager.getAvailablePathForAttachment(
          filename,
        );
        await app.vault.createBinary(filePath, pdf.output('arraybuffer'));
        new Notice(L.saveSuccess({ filePath }));
      } else {
        pdf.save(filename);
      }

      break;
    }
  }
}

export async function copy(
  el: HTMLElement,
  resolutionMode: ResolutionMode,
  format: FileFormat,
) {
  if (format === 'pdf') {
    new Notice(L.copyNotAllowed());
    return;
  }

  const blob = await getBlob(
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
) {
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

    const scale = getScale(resolutionMode);
    const pageWidth = target.contentElement.clientWidth;
    const fullHeight = target.contentElement.clientHeight;
    const maxArea = Platform.isMobile ? 16_000_000 : 64_000_000;

    // Render the whole note once and crop pages from that bitmap. The old
    // loop re-cloned the DOM, re-embedded fonts and re-inlined images for
    // every page, so a 5-page split cost roughly 5× a single export.
    let fullCanvas: HTMLCanvasElement | undefined;
    if (pageWidth > 0 && fullHeight > 0 && pageWidth * scale * fullHeight * scale <= maxArea) {
      try {
        fullCanvas = await getFullCanvas(target.contentElement, resolutionMode);
      } catch (error) {
        console.error('export-image: full canvas failed, falling back to per-page render', error);
      }
    }

    const pageBlob = async (startY: number, height: number, type: string): Promise<Blob> => {
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
      return getBlob(target.element, resolutionMode, type);
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
      if (Platform.isMobile) {
        const filePath = await saveToVault(app, new Blob([pdf!.output('arraybuffer')]), filename);
        new Notice(L.saveSuccess({ filePath }));
      } else {
        pdf?.save(filename);
      }
    } else {
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

      if (Platform.isMobile) {
        // 在移动端直接保存到 vault
        for (const { blob, filename } of blobs) {
          const filePath = await saveToVault(app, blob, filename);
          new Notice(L.saveSuccess({ filePath }));
        }
      } else {
        // 在桌面端创建 zip
        for (const { blob, filename } of blobs) {
          zip.file(filename, blob);
        }
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        saveAs(zipBlob, `${title.replaceAll(/\s+/g, '_')}.zip`);
      }
    }
  } finally {
    // 确保无论成功还是失败都恢复原始状态
    target.resetClip();
  }
}
