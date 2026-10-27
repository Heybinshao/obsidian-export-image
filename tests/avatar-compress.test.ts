import { describe, expect, it } from 'vitest';
import { downscaleDataImage } from '../src/utils/image';

describe('downscaleDataImage', () => {
  it('leaves non-inline sources untouched', async () => {
    await expect(downscaleDataImage('https://example.com/a.png', 256)).resolves.toBe('https://example.com/a.png');
    await expect(downscaleDataImage('assets/a.png', 256)).resolves.toBe('assets/a.png');
    await expect(downscaleDataImage('', 256)).resolves.toBe('');
  });

  it('leaves svg data urls untouched', async () => {
    const svg = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>';
    await expect(downscaleDataImage(svg, 256)).resolves.toBe(svg);
  });
});
