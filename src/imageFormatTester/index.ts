import {getMime} from 'src/utils';
import {jpg, png, webp} from './tiny';

async function tester(image: string) {
  try {
    const blob = await (await fetch(image)).blob();
    const data: ClipboardItem[] = [];
    data.push(
      new ClipboardItem({
        [blob.type]: blob,
      }),
    );
    await navigator.clipboard.write(data);
    return true;
  } catch (error) {
    console.log(error);
    return false;
  }
}

const copyCache: Partial<Record<FileFormat, Promise<boolean>>> = {
  pdf: Promise.resolve(false),
};
const createCache: Partial<Record<FileFormat, boolean>> = {
  pdf: true,
};

export async function isCopiable(type: FileFormat) {
  if (type in copyCache) {
    return copyCache[type];
  }

  if (type === 'jpg') {
    copyCache[type] = tester(jpg);
    return copyCache[type];
  }

  if (type === 'webp') {
    copyCache[type] = tester(webp);
    return copyCache[type];
  }

  const result = tester(png);
  copyCache.png0 = result;
  copyCache.png1 = result;
  return result;
}

export async function isCreatable(type: FileFormat): Promise<boolean> {
  if (type in createCache) {
    return createCache[type]!;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const mime = getMime(type);
  return new Promise(resolve => {
    try {
      canvas.toBlob(blob => {
        // Browsers silently fall back to PNG for unsupported MIME types.
        const supported = Boolean(blob) && blob!.type === mime;
        if (type.includes('png')) {
          createCache.png0 = supported;
          createCache.png1 = supported;
        } else {
          createCache[type] = supported;
        }

        resolve(supported);
      }, mime);
    } catch {
      if (type.includes('png')) {
        createCache.png0 = false;
        createCache.png1 = false;
      } else {
        createCache[type] = false;
      }

      resolve(false);
    }
  });
}
