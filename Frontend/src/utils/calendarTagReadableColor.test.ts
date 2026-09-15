import { describe, expect, it } from 'vitest';
import { calendarTagReadableColor } from './calendarTagReadableColor';

const CAMP = '#7C3AED';
const LIGHT_LAVENDER = '#E9D5FF';

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const lin = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

describe('calendarTagReadableColor', () => {
  it('keeps CAMP purple on light cells', () => {
    expect(calendarTagReadableColor(CAMP, 'light')).toBe(CAMP);
  });

  it('lifts CAMP purple on dark cells', () => {
    const dark = calendarTagReadableColor(CAMP, 'dark');
    expect(dark).not.toBe(CAMP);
    expect(luminance(dark)).toBeGreaterThan(0.57);
    expect(luminance(dark)).toBeGreaterThan(luminance(CAMP));
  });

  it('lifts CAMP further on selected primary cells', () => {
    const selected = calendarTagReadableColor(CAMP, 'selected');
    const dark = calendarTagReadableColor(CAMP, 'dark');
    expect(luminance(selected)).toBeGreaterThan(luminance(dark));
  });

  it('leaves an already-light color unchanged on dark', () => {
    expect(calendarTagReadableColor(LIGHT_LAVENDER, 'dark')).toBe(LIGHT_LAVENDER);
  });
});
