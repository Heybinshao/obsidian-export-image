import { describe, expect, it } from 'vitest';
import { calculateSplitPositions } from '../src/utils/split';

describe('calculateSplitPositions', () => {
  it('falls back to one page when hr mode has no separators', () => {
    const positions = calculateSplitPositions({
      mode: 'hr',
      height: 1000,
      overlap: 0,
      totalHeight: 1200,
    }, []);

    expect(positions).toEqual([{ startY: 0, height: 1200 }]);
  });

  it('covers the full height in fixed mode without zero-height pages', () => {
    const positions = calculateSplitPositions({
      mode: 'fixed',
      height: 1000,
      overlap: 80,
      totalHeight: 2500,
    });

    expect(positions.length).toBeGreaterThan(0);
    for (const page of positions) {
      expect(page.height).toBeGreaterThan(0);
    }
    const last = positions.at(-1)!;
    expect(last.startY + last.height).toBe(2500);
  });

  it('splits at hr positions', () => {
    const positions = calculateSplitPositions({
      mode: 'hr',
      height: 1000,
      overlap: 0,
      totalHeight: 900,
    }, [
      { top: 300, height: 0 },
      { top: 600, height: 0 },
    ]);

    expect(positions).toEqual([
      { startY: 0, height: 300 },
      { startY: 300, height: 300 },
      { startY: 600, height: 300 },
    ]);
  });
});
