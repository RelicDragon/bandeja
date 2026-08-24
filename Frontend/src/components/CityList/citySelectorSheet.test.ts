import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CITY_SELECTOR_SHEET_BODY_CLASS,
  CITY_SELECTOR_SHEET_CLASS,
  citySelectorSheetHeightPx,
} from './citySelectorSheet';

const surfacesCss = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../styles/keyboard/surfaces.css'),
  'utf8',
);

describe('citySelectorSheetHeightPx', () => {
  it('uses resting 94vh cap when the keyboard is hidden', () => {
    expect(citySelectorSheetHeightPx({ viewportPx: 800, keyboardPx: 0, safeTopPx: 47 })).toBe(752);
  });

  it('clamps to the space above the keyboard so search stays on-screen', () => {
    expect(citySelectorSheetHeightPx({ viewportPx: 800, keyboardPx: 336, safeTopPx: 47 })).toBe(393);
  });
});

describe('city selector keyboard CSS', () => {
  it('clamps city-selector height with --keyboard-height without changing generic sheets', () => {
    expect(surfacesCss).toContain(`.${CITY_SELECTOR_SHEET_CLASS}`);
    expect(surfacesCss).toContain(`.${CITY_SELECTOR_SHEET_BODY_CLASS}`);
    expect(surfacesCss).toContain('body.keyboard-visible .cap-keyboard-aware-sheet.city-selector-sheet');
    expect(surfacesCss).toContain('--keyboard-height');
    expect(surfacesCss).toMatch(/height:\s*min\(/);
  });
});
