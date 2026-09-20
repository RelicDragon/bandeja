import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

/**
 * PRD 345 — the create-game **Repeat** row.
 *
 * Covers the round trip the PRD asks for: `Once` shows no detail, a cadence
 * reveals the summary line and the Until chip, and the owner cap disables the
 * two repeating options with the helper line instead of hiding them.
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

const mySeries = { value: { activeCount: 0, maxActive: 10, series: [], seatDeadlineChoices: [] } };
vi.mock('./useSeries', () => ({
  useMySeries: () => ({ data: mySeries.value }),
}));

vi.mock('@/config/featureFlags', () => ({
  isGameSeriesEnabled: () => true,
}));

const { SeriesRepeatRow } = await import('./SeriesRepeatRow');

// Constructed in local time on purpose: create-game hands the row a local
// `Date`, and `2026-09-22` is a Tuesday in every timezone when built this way.
const START_DATE = new Date(2026, 8, 22);

function render(props: Partial<ComponentProps<typeof SeriesRepeatRow>> = {}) {
  return renderToStaticMarkup(
    <SeriesRepeatRow
      cadence="ONCE"
      onCadenceChange={() => {}}
      endsOn=""
      onEndsOnChange={() => {}}
      startDate={START_DATE}
      startTimeLocal="19:00"
      {...props}
    />,
  );
}

describe('SeriesRepeatRow', () => {
  it('offers exactly the three documented choices', () => {
    const html = render();
    expect(html).toContain('series.cadenceOnce');
    expect(html).toContain('series.cadenceWeekly');
    expect(html).toContain('series.cadenceBiweekly');
  });

  it('shows no summary and no Until chip while the game happens once', () => {
    const html = render();
    expect(html).not.toContain('series.repeatSummaryWeekly');
    expect(html).not.toContain('series.until"');
  });

  it('reveals the summary with weekday, time and start date once weekly is picked', () => {
    const html = render({ cadence: 'WEEKLY' });
    expect(html).toContain('series.repeatSummaryWeekly');
    expect(html).toContain('Tuesday');
    expect(html).toContain('19:00');
    expect(html).toContain('Sep');
    expect(html).toContain('series.until');
  });

  it('uses the biweekly summary for every-2-weeks', () => {
    const html = render({ cadence: 'BIWEEKLY' });
    expect(html).toContain('series.repeatSummaryBiweekly');
    expect(html).not.toContain('series.repeatSummaryWeekly');
  });

  it('shows the chosen end date and a way to clear it', () => {
    const html = render({ cadence: 'WEEKLY', endsOn: '2026-11-30' });
    expect(html).toContain('series.untilValue');
    expect(html).toContain('series.untilClear');
    expect(html).toContain('Nov');
  });

  it('disables the repeating options and explains the cap when it is reached', () => {
    mySeries.value = { activeCount: 10, maxActive: 10, series: [], seatDeadlineChoices: [] };
    const html = render();
    expect(html).toContain('series.capReached');
    expect(html).toContain('disabled');
    mySeries.value = { activeCount: 0, maxActive: 10, series: [], seatDeadlineChoices: [] };
  });

  it('uses only logical spacing utilities so `ar` mirrors', () => {
    const html = render({ cadence: 'WEEKLY', endsOn: '2026-11-30' });
    expect(html).not.toMatch(/\bclass="[^"]*\b(ml|mr|pl|pr)-/);
  });
});
