// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { LevelHistoryProfileStatsSection } from './LevelHistoryProfileStatsSection';

describe('LevelHistoryProfileStatsSection', () => {
  it('reads only-left flags from the public stats user object', () => {
    const html = renderToStaticMarkup(
      <LevelHistoryProfileStatsSection
        user={{
          preferredHandLeft: true,
          preferredHandRight: false,
          preferredCourtSideLeft: true,
          preferredCourtSideRight: false,
        }}
        followersCount={1}
        followingCount={2}
      />,
    );
    expect(html).toMatch(/data-testid="preference-chip-hand-left"[^>]*data-selected="true"/);
    expect(html).toMatch(/data-testid="preference-chip-hand-right"[^>]*data-selected="false"/);
    expect(html).toMatch(/data-testid="preference-chip-courtSide-left"[^>]*data-selected="true"/);
    expect(html).toMatch(/data-testid="preference-chip-courtSide-right"[^>]*data-selected="false"/);
    expect(html).toContain('bg-blue-600');
    expect(html).toContain('border-dashed');
    expect(html).toContain('aria-label="profile.preferredHand: profile.left"');
    expect(html).toContain('aria-label="profile.preferredCourtSide: profile.left"');
  });

  it('treats omitted public-stats flags as unset, not both-on', () => {
    const html = renderToStaticMarkup(
      <LevelHistoryProfileStatsSection user={{}} followersCount={0} followingCount={0} />,
    );
    expect(html).not.toContain('data-selected="true"');
    expect(html).not.toContain('bg-blue-600');
    expect(html).toContain('border-dashed');
  });
});
