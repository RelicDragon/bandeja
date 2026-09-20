import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Trophy } from 'lucide-react';
import { StatTile } from './StatTile';

describe('StatTile', () => {
  it('renders the label and exposes the value as text', () => {
    const html = renderToStaticMarkup(<StatTile label="Games" value={42} />);
    // Both are plain text nodes, so a screen reader reads "Games 42".
    expect(html).toContain('>Games<');
    expect(html).toContain('>42<');
    expect(html).not.toContain('aria-hidden');
  });

  it('renders a hint and keeps numbers on tabular figures', () => {
    const html = renderToStaticMarkup(
      <StatTile label="Win rate" value="62%" hint="Last 12 months" />,
    );
    expect(html).toContain('Last 12 months');
    expect(html).toContain('tabular-nums');
  });

  it('marks the icon decorative and applies the tone to the value', () => {
    const html = renderToStaticMarkup(
      <StatTile label="Streak" value={3} icon={Trophy} tone="success" />,
    );
    expect(html).toContain('aria-hidden');
    expect(html).toContain('text-green-600');
  });

  it('uses only logical spacing utilities so RTL mirrors', () => {
    const html = renderToStaticMarkup(<StatTile label="Games" value={1} className="py-4" />);
    expect(html).not.toMatch(/\b(ml|mr|pl|pr)-/);
    expect(html).toContain('py-4');
  });
});
