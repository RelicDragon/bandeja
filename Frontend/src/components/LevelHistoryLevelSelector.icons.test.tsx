// @vitest-environment jsdom
/**
 * Issue #343 — SegmentedSwitch passes `aria-hidden` to every tab icon (the tab
 * already has a name). The sport and social-level tab icons must forward it
 * instead of exposing their decorative image/SVGs to assistive tech, and keep
 * their sizing classes (no visual change).
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Sports } from '@shared/sport';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { LevelHistoryLevelSelector } from './LevelHistoryLevelSelector';
import { SocialLevelIcon } from './profile/SocialLevelIcon';
import { SportPublicIcon } from './sport/SportPublicIcon';

function renderSelector() {
  const html = renderToStaticMarkup(
    <LevelHistoryLevelSelector
      sports={[Sports.PADEL, Sports.TENNIS]}
      value={{ kind: 'competitive', sport: Sports.PADEL }}
      onChange={() => {}}
    />,
  );
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return Array.from(doc.querySelectorAll('[role="tab"]'));
}

describe('LevelHistoryLevelSelector tab icons', () => {
  it('hides the sport tab images from assistive tech and keeps their 20px sizing', () => {
    const [padel, tennis] = renderSelector();
    for (const tab of [padel, tennis]) {
      const img = tab?.querySelector('img');
      expect(img?.getAttribute('aria-hidden')).toBe('true');
      expect(img?.getAttribute('alt')).toBe('');
      expect(img?.className.split(' ')).toEqual(
        expect.arrayContaining(['h-5', 'w-5', 'object-contain', 'shrink-0']),
      );
    }
  });

  it('hides the social-level tab icon subtree from assistive tech', () => {
    const social = renderSelector().at(-1);
    const root = social?.querySelector('svg')?.parentElement;
    expect(root?.getAttribute('aria-hidden')).toBe('true');
    expect(root?.className).toContain('shrink-0');
  });
});

describe('icon defaults for other call sites', () => {
  it('SocialLevelIcon leaves its root wrapper alone unless asked', () => {
    const html = renderToStaticMarkup(<SocialLevelIcon size={14} />);
    expect(html.startsWith('<div class="relative flex shrink-0 items-center ">')).toBe(true);
  });

  it('SportPublicIcon keeps its default className and adds no size attributes', () => {
    const html = renderToStaticMarkup(<SportPublicIcon sport={Sports.PADEL} />);
    expect(html).toContain('class="h-6 w-6 object-contain"');
    expect(html).not.toContain('width=');
    expect(html).not.toContain('aria-hidden');
  });
});
