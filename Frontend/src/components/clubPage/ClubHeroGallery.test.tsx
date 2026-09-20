// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key}:${JSON.stringify(options)}` : key,
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

const photos = [
  { originalUrl: 'a.jpg', thumbnailUrl: 'a-t.jpg' },
  { originalUrl: 'b.jpg', thumbnailUrl: 'b-t.jpg' },
  { originalUrl: 'c.jpg', thumbnailUrl: 'c-t.jpg' },
];

describe('ClubHeroGallery', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function render(list = photos) {
    const { ClubHeroGallery } = await import('./ClubHeroGallery');
    await act(async () => {
      root.render(
        <ClubHeroGallery
          photos={list}
          clubName="Padel Central"
          parallaxOffset={0}
          reducedMotion
        />,
      );
    });
    return container.querySelector<HTMLDivElement>('[role="region"]');
  }

  it('is a labelled, focusable region', async () => {
    const region = await render();
    expect(region).not.toBeNull();
    expect(region?.getAttribute('tabindex')).toBe('0');
    expect(region?.getAttribute('aria-label')).toContain('Padel Central');
  });

  it('loads only the first photo eagerly', async () => {
    await render();
    const images = [...container.querySelectorAll('img')];
    expect(images).toHaveLength(3);
    expect(images[0].getAttribute('loading')).toBe('eager');
    expect(images[1].getAttribute('loading')).toBe('lazy');
    expect(images[2].getAttribute('loading')).toBe('lazy');
    // Only the full-bleed first photo is worth the original; the rest page in.
    expect(images[0].getAttribute('src')).toBe('a.jpg');
    expect(images[1].getAttribute('src')).toBe('b-t.jpg');
  });

  it('pages with the arrow keys', async () => {
    const region = await render();
    if (!region) throw new Error('no region');
    const scrollTo = vi.fn();
    Object.defineProperty(region, 'clientWidth', { value: 320, configurable: true });
    region.scrollTo = scrollTo as unknown as typeof region.scrollTo;

    await act(async () => {
      region.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
      );
    });
    expect(scrollTo).toHaveBeenCalledWith({ left: 320, behavior: 'auto' });

    await act(async () => {
      region.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    });
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 640, behavior: 'auto' });

    await act(async () => {
      region.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    });
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, behavior: 'auto' });
  });

  it('clamps paging at the ends', async () => {
    const region = await render();
    if (!region) throw new Error('no region');
    const scrollTo = vi.fn();
    Object.defineProperty(region, 'clientWidth', { value: 320, configurable: true });
    region.scrollTo = scrollTo as unknown as typeof region.scrollTo;

    await act(async () => {
      region.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    });
    expect(scrollTo).toHaveBeenCalledWith({ left: 0, behavior: 'auto' });
  });

  it('renders a gradient placeholder instead of an empty region when there are no photos', async () => {
    const region = await render([]);
    expect(region).toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('announces the current page for screen readers', async () => {
    await render();
    const live = container.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toContain('"current":1');
    expect(live?.textContent).toContain('"total":3');
  });
});
