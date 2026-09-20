import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StatTile } from './StatTile';
import { StatTileRow } from './StatTileRow';

const tile = (label: string) => <StatTile key={label} label={label} value={1} />;

describe('StatTileRow', () => {
  it('renders nothing without tiles', () => {
    expect(renderToStaticMarkup(<StatTileRow>{null}</StatTileRow>)).toBe('');
  });

  it('lays three tiles out in one row with logical dividers only', () => {
    const html = renderToStaticMarkup(
      <StatTileRow>{['Games', 'Wins', 'Streak'].map(tile)}</StatTileRow>,
    );
    expect(html).toContain('grid-cols-3');
    expect((html.match(/border-s/g) ?? []).length).toBe(2);
    expect(html).not.toContain('border-l');
    expect(html).not.toContain('border-r');
  });

  it('wraps four tiles to a 2×2 grid below sm and back to one row above it', () => {
    const html = renderToStaticMarkup(
      <StatTileRow>{['A', 'B', 'C', 'D'].map(tile)}</StatTileRow>,
    );
    expect(html).toContain('grid-cols-2 sm:grid-cols-4');
    expect((html.match(/border-t /g) ?? []).length).toBe(2);
    expect((html.match(/sm:border-t-0/g) ?? []).length).toBe(2);
  });

  it('ignores tiles past the fourth', () => {
    const html = renderToStaticMarkup(
      <StatTileRow>{['A', 'B', 'C', 'D', 'E'].map(tile)}</StatTileRow>,
    );
    expect(html).not.toContain('>E<');
  });
});
