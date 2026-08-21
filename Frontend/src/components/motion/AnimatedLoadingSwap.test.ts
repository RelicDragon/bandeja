import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AnimatedLoadingSwap } from './AnimatedLoadingSwap';

const src = readFileSync(join(__dirname, 'AnimatedLoadingSwap.tsx'), 'utf8');

describe('AnimatedLoadingSwap', () => {
  it('swaps loading and content without AnimatePresence', () => {
    expect(src).not.toMatch(/AnimatePresence/);
    expect(src).not.toMatch(/mode=["']wait["']/);
    expect(src).toMatch(/isLoading \? loading : children/);
  });

  it('renders content as soon as loading is false', () => {
    const html = renderToStaticMarkup(
      createElement(
        AnimatedLoadingSwap,
        { isLoading: false, loading: createElement('span', null, 'skeleton') },
        createElement('span', null, 'cards'),
      ),
    );
    expect(html).toContain('cards');
    expect(html).not.toContain('skeleton');
  });

  it('renders skeleton while loading', () => {
    const html = renderToStaticMarkup(
      createElement(
        AnimatedLoadingSwap,
        { isLoading: true, loading: createElement('span', null, 'skeleton') },
        createElement('span', null, 'cards'),
      ),
    );
    expect(html).toContain('skeleton');
    expect(html).not.toContain('cards');
  });
});
