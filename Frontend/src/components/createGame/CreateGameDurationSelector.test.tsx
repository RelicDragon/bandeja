// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('CreateGameDurationSelector', () => {
  it('uses a wrapped radio grid when there are many duration choices', async () => {
    const { CreateGameDurationSelector } = await import('./CreateGameDurationSelector');
    const options = [1, 1.5, 2, 3, 4, 5, 6, 7, 8];

    const html = renderToStaticMarkup(
      <CreateGameDurationSelector
        duration={5}
        durationOptions={options}
        getDurationLabel={(value) => `${value} hours`}
        onDurationChange={vi.fn()}
      />,
    );

    expect(html).toContain('role="radiogroup"');
    expect(html.match(/type="radio"/g)).toHaveLength(options.length);
    expect(html).toContain('checked="" value="5"');
    expect(html).toContain('>8 hours</span>');
  });

  it('keeps the compact segmented switch for short duration lists', async () => {
    const { CreateGameDurationSelector } = await import('./CreateGameDurationSelector');

    const html = renderToStaticMarkup(
      <CreateGameDurationSelector
        duration={1.5}
        durationOptions={[1, 1.5, 2]}
        getDurationLabel={(value) => `${value} hours`}
        onDurationChange={vi.fn()}
      />,
    );

    expect(html).toContain('role="tablist"');
    expect(html).not.toContain('role="radiogroup"');
  });
});
