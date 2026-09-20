import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { SeriesNextPrompt } from '@/api/series';

/**
 * PRD 345 — the "Same time next week?" card.
 *
 * Rendered server-side so no jsdom is needed: the assertions are about which
 * controls exist, which copy keys are used and that no physical-direction
 * utility leaks in (RTL). The interactive morph is covered by the manual UI
 * test plan, because it is a 1.2 s timer plus a spring.
 */

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
    i18n: { language: 'en-GB' },
  }),
}));

vi.mock('@/hooks/usePrefersReducedMotion', () => ({
  usePrefersReducedMotion: () => true,
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

const mutateAsync = vi.fn(async () => ({ message: 'series.seatKept', action: 'accept' as const }));
vi.mock('./useSeries', () => ({
  useRespondToNextOccurrence: () => ({ mutateAsync }),
}));

vi.mock('@/components/ClubAvatar', () => ({
  ClubAvatar: ({ club }: { club: { name: string } }) => <span>{club.name}</span>,
}));

const { SeriesNextWeekCard } = await import('./SeriesNextWeekCard');

function makePrompt(overrides: Partial<SeriesNextPrompt> = {}): SeriesNextPrompt {
  return {
    seriesId: 'series-1',
    seriesName: 'Tuesday Regulars',
    cadence: 'WEEKLY',
    ownerId: 'owner-1',
    viewerIsOwner: false,
    viewerIsRegular: true,
    nextGameId: 'game-next',
    nextStartTime: '2026-10-06T17:00:00.000Z',
    nextOccurrenceDate: '2026-10-06',
    nextClubName: 'Padel Centar',
    seatDeadlineAt: '2026-10-04T17:00:00.000Z',
    confirmedCount: 2,
    regularCount: 4,
    viewerIsPlaying: false,
    regulars: [],
    ...overrides,
  };
}

describe('SeriesNextWeekCard', () => {
  it('offers both answers and names the next occurrence', () => {
    const html = renderToStaticMarkup(
      <SeriesNextWeekCard prompt={makePrompt()} sourceGameId="game-done" />,
    );
    expect(html).toContain('series.nextWeekTitle');
    expect(html).toContain('series.imIn');
    expect(html).toContain('series.skip');
    // The date is rendered through Intl, not a hard-coded English string.
    expect(html).toContain('Oct');
    expect(html).toContain('Padel Centar');
  });

  it('renders nothing once the viewer already holds a seat next week', () => {
    const html = renderToStaticMarkup(
      <SeriesNextWeekCard prompt={makePrompt({ viewerIsPlaying: true })} sourceGameId="g" />,
    );
    expect(html).toBe('');
  });

  it('links to the series page when the caller supplies a handler', () => {
    const withLink = renderToStaticMarkup(
      <SeriesNextWeekCard prompt={makePrompt()} sourceGameId="g" onOpenSeries={() => {}} />,
    );
    expect(withLink).toContain('series.partOf');

    const withoutLink = renderToStaticMarkup(
      <SeriesNextWeekCard prompt={makePrompt()} sourceGameId="g" />,
    );
    expect(withoutLink).not.toContain('series.partOf');
  });

  it('keeps every control at a 44 px tap target', () => {
    const html = renderToStaticMarkup(
      <SeriesNextWeekCard prompt={makePrompt()} sourceGameId="g" />,
    );
    const buttons = html.match(/<button[^>]*>/g) ?? [];
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect(button).toContain('min-h-[44px]');
    }
  });

  it('uses only logical spacing utilities so `ar` mirrors', () => {
    const html = renderToStaticMarkup(
      <SeriesNextWeekCard
        prompt={makePrompt()}
        sourceGameId="g"
        clubName="Padel Centar"
        onOpenSeries={() => {}}
      />,
    );
    expect(html).not.toMatch(/\bclass="[^"]*\b(ml|mr|pl|pr)-/);
    expect(html).not.toMatch(/\bclass="[^"]*\b(left|right)-/);
  });

  it('carries an accessible section label rather than relying on the heading alone', () => {
    const html = renderToStaticMarkup(
      <SeriesNextWeekCard prompt={makePrompt()} sourceGameId="g" />,
    );
    expect(html).toContain('aria-label="series.nextWeekTitle"');
  });
});
