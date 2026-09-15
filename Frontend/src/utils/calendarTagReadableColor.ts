export type CalendarTagSurface = 'light' | 'dark' | 'selected';

const WHITE: [number, number, number] = [255, 255, 255];
const MIN_LUMINANCE: Record<CalendarTagSurface, number> = {
  light: 0,
  dark: 0.58,
  selected: 0.88,
};

function parseHex(hex: string): [number, number, number] | null {
  const match = /^#([0-9A-Fa-f]{6})$/.exec(hex.trim());
  if (!match) return null;
  const n = Number.parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(rgb: [number, number, number]): string {
  return `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

function channelToLinear(channel: number): number {
  const s = channel / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(rgb: [number, number, number]): number {
  return (
    0.2126 * channelToLinear(rgb[0]) +
    0.7152 * channelToLinear(rgb[1]) +
    0.0722 * channelToLinear(rgb[2])
  );
}

function mixRgb(
  from: [number, number, number],
  to: [number, number, number],
  t: number,
): [number, number, number] {
  return [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t,
    from[2] + (to[2] - from[2]) * t,
  ];
}

function liftToLuminance(
  rgb: [number, number, number],
  target: number,
): [number, number, number] {
  if (relativeLuminance(rgb) >= target) return rgb;
  let lo = 0;
  let hi = 1;
  let best = 1;
  for (let i = 0; i < 20; i += 1) {
    const mid = (lo + hi) / 2;
    const mixed = mixRgb(rgb, WHITE, mid);
    if (relativeLuminance(mixed) >= target) {
      best = mid;
      hi = mid;
    } else {
      lo = mid;
    }
  }
  const lifted = mixRgb(rgb, WHITE, best);
  return [Math.round(lifted[0]), Math.round(lifted[1]), Math.round(lifted[2])];
}

/** Campaign tag hex, lifted on dark/selected cells so 7px labels stay readable. */
export function calendarTagReadableColor(hex: string, surface: CalendarTagSurface): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const target = MIN_LUMINANCE[surface];
  if (target <= 0) return toHex(rgb);
  return toHex(liftToLuminance(rgb, target));
}
