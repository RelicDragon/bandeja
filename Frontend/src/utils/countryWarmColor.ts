import { COUNTRY_ADJACENCY } from '@/utils/countryAdjacency';

/** Distinct warm RGBs — spaced so neighbors stay readable at ~0.4 fill alpha. */
const WARM_RGB = [
  [234, 179, 8], // gold
  [249, 115, 22], // orange
  [244, 63, 94], // rose
  [220, 38, 38], // red
  [180, 83, 9], // brown-amber
  [251, 146, 60], // peach
  [219, 39, 119], // fuchsia
  [202, 138, 4], // mustard
  [194, 65, 12], // terracotta
  [251, 113, 133], // light rose
  [153, 27, 27], // deep red
  [245, 158, 11], // amber
] as const;

export function assignCountryWarmColorIndexes(countries: readonly string[]): Map<string, number> {
  const nodes = [...new Set(countries.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const active = new Set(nodes);
  const colorByCountry = new Map<string, number>();

  for (const country of nodes) {
    const neighborColors = new Set<number>();
    for (const neighbor of COUNTRY_ADJACENCY[country] ?? []) {
      if (!active.has(neighbor)) continue;
      const c = colorByCountry.get(neighbor);
      if (c != null) neighborColors.add(c);
    }
    let color = 0;
    while (neighborColors.has(color) && color < WARM_RGB.length) color += 1;
    colorByCountry.set(country, color < WARM_RGB.length ? color : 0);
  }

  return colorByCountry;
}

export function getCountryWarmRgbByIndex(index: number): readonly [number, number, number] {
  return WARM_RGB[((index % WARM_RGB.length) + WARM_RGB.length) % WARM_RGB.length];
}

export function getCountryWarmFillByIndex(index: number, alpha = 0.42): string {
  const [r, g, b] = getCountryWarmRgbByIndex(index);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function getCountryWarmStrokeByIndex(index: number, alpha = 0.78): string {
  const [r, g, b] = getCountryWarmRgbByIndex(index);
  return `rgba(${r},${g},${b},${alpha})`;
}
