/**
 * Static-markup checks for the presentational pieces (same approach as the
 * other game-details cards): which rows, pills and actions exist for which
 * state, and that read-only stays informative without any button.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params
        ? `${key}:${Object.entries(params)
            .map(([name, value]) => `${name}=${String(value)}`)
            .join(',')}`
        : key,
    i18n: { language: 'en', resolvedLanguage: 'en' },
  }),
}));

vi.mock('@/hooks/usePrefersReducedMotion', () => ({ usePrefersReducedMotion: () => true }));

vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector: (state: { user: null }) => unknown) => selector({ user: null }),
}));

vi.mock('@/utils/displayPreferences', () => ({
  resolveDisplaySettings: () => ({ locale: 'en-GB', hour12: false, weekStart: 1 }),
}));

const { CourtsCard } = await import('./CourtsCard');
const { ReservationPill } = await import('./ReservationPill');
const { UnfinishedChangesBanner } = await import('./UnfinishedChangesBanner');
const { ReservationDriftBanner } = await import('./ReservationDriftBanner');
const { ReservationRunChecklist } = await import('./ReservationRunChecklist');
const { createRunJournal } = await import('./reservationRunner');
const { createClubTimeFormatter } = await import('./clubTime');
const fx = await import('./courtReservationsFixtures');

function card(scenario: Parameters<typeof fx.fixtureReservations>[0], canEdit = true) {
  return renderToStaticMarkup(
    <CourtsCard
      reservations={fx.fixtureReservations(scenario)}
      window={fx.FIXTURE_WINDOW}
      courtsById={fx.FIXTURE_COURTS_BY_ID}
      timeZone={fx.FIXTURE_TIME_ZONE}
      playerCount={16}
      clubName="X-Padel"
      canEdit={canEdit}
      followUps={fx.FIXTURE_FOLLOW_UPS}
      onSlotPress={() => undefined}
      onPrimaryAction={() => undefined}
      onFollowUpDone={() => undefined}
      courtCount={{ value: 4, min: 3, max: 16, onChange: () => undefined }}
    />,
  );
}

describe('ReservationPill', () => {
  it('carries its tone, label and the provider tick only when linked', () => {
    const planned = renderToStaticMarkup(<ReservationPill tone="planned" label="Planned" />);
    expect(planned).toContain('data-reservation-tone="planned"');
    expect(planned).toContain('border-dashed');
    expect(planned).not.toContain('data-provider-tick');
    const linked = renderToStaticMarkup(<ReservationPill tone="reserved" label="Reserved · Booktime" linked size="compact" />);
    expect(linked).toContain('data-provider-tick');
    expect(linked).toContain('h-6');
  });

  it('draws the partial ring', () => {
    expect(renderToStaticMarkup(<ReservationPill tone="partial" label="1 of 2" progress={0.5} />)).toContain('<circle');
  });
});

describe('CourtsCard', () => {
  it('mixed: header pill, context line, one row per slot, one primary action', () => {
    const html = card('mixed');
    expect(html).toContain('card.title');
    expect(html).toContain('summary.partial:reserved=3,total=4');
    expect(html).toContain('card.players:count=16 · card.courts:count=4 · X-Padel');
    expect(html.match(/data-slot-key=/g)).toHaveLength(4);
    expect(html).toContain('slot.linked:provider=Booktime');
    expect(html).toContain('slot.gap:from=19:00,to=19:30');
    expect(html).toContain('slot.reported');
    expect(html).toContain('card.anyCourt');
    expect(html.match(/data-primary-action=/g)).toHaveLength(1);
    expect(html).toContain('action.reserveLast');
    expect(html).toContain('followUp.cancelOldAt:time=18:00');
    expect(html).toContain('data-testid="court-count-stepper"');
  });

  it('gap: the one action fills the gap, in words with a duration', () => {
    expect(card('gap')).toContain('action.fillGap:duration=duration.m:m=30');
  });

  it('all reserved: no primary action at all', () => {
    const html = card('reserved');
    expect(html).toContain('summary.reserved');
    expect(html).not.toContain('data-primary-action');
  });

  it('read-only: still informative, no buttons, no follow-ups, no stepper', () => {
    const html = card('mixed', false);
    expect(html).toContain('summary.partial');
    expect(html).toContain('slot.gap');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('followUp.');
    expect(html).not.toContain('court-count-stepper');
  });
});

describe('UnfinishedChangesBanner', () => {
  const steps = [
    {
      kind: 'book' as const,
      idempotencyKey: 'b',
      slotKey: 'gc:gc1',
      courtId: 'c1',
      provider: 'BOOKTIME',
      start: fx.at('19:00'),
      end: fx.at('20:30'),
      purpose: 'move' as const,
      extraMinutes: 0,
      requiresVerifyBeforeRetry: true,
    },
    { kind: 'save_game' as const, idempotencyKey: 's', start: fx.at('19:00'), end: fx.at('20:30') },
  ];

  it('offers Finish and Undo before the save; only Finish after it', () => {
    const journal = createRunJournal('g1', steps);
    const before = renderToStaticMarkup(
      <UnfinishedChangesBanner journal={journal} timeZone={fx.FIXTURE_TIME_ZONE} onFinish={() => undefined} onUndo={() => undefined} />,
    );
    expect(before).toContain('banner.unfinishedTitle');
    expect(before).toContain('banner.detail:count=2,time=\u206619:00–20:30\u2069');
    expect(before).toContain('banner.undo');
    journal.steps[1] = { ...journal.steps[1], status: 'done' };
    const after = renderToStaticMarkup(
      <UnfinishedChangesBanner journal={journal} timeZone={fx.FIXTURE_TIME_ZONE} onFinish={() => undefined} onUndo={() => undefined} />,
    );
    expect(after).toContain('banner.pausedTitle');
    expect(after).not.toContain('banner.undo');
  });

  it('the checklist shows every step with its state', () => {
    const journal = createRunJournal('g1', steps);
    journal.steps[0] = { ...journal.steps[0], status: 'done' };
    journal.steps[1] = { ...journal.steps[1], status: 'failed' };
    const clock = createClubTimeFormatter({ timeZone: fx.FIXTURE_TIME_ZONE });
    const text = {
      t: ((k: string) => k) as never,
      clock,
      copy: () => '',
      duration: () => '',
      compactDuration: () => '',
      list: (items: readonly string[]) => items.join(', '),
    };
    const html = renderToStaticMarkup(<ReservationRunChecklist journal={journal} courtsById={fx.FIXTURE_COURTS_BY_ID} text={text} />);
    expect(html).toContain('data-step-status="done"');
    expect(html).toContain('data-step-status="failed"');
    expect(html).toContain('run.step.bookRange');
    // Every step is on screen, including the ones still waiting.
    expect(html.match(/data-step-status=/g)).toHaveLength(2);
  });
});

describe('ReservationDriftBanner', () => {
  it('moved → keep / move game; missing → unlink / reserve again; nothing when there is no drift', () => {
    const html = renderToStaticMarkup(
      <ReservationDriftBanner
        drifts={[
          ...fx.FIXTURE_DRIFTS,
          { ...fx.FIXTURE_DRIFTS[0], linkId: 'l9', state: 'MISSING', upstreamStart: null, upstreamEnd: null },
        ]}
        courtsById={fx.FIXTURE_COURTS_BY_ID}
        timeZone={fx.FIXTURE_TIME_ZONE}
        onAction={() => undefined}
      />,
    );
    expect(html).toContain('drift.moved:court=Court 2,time=19:00,provider=Booktime');
    expect(html).toContain('drift.moveGame');
    expect(html).toContain('drift.missing:court=Court 2,provider=Booktime');
    expect(html).toContain('drift.reserveAgain');
    expect(
      renderToStaticMarkup(
        <ReservationDriftBanner drifts={[]} courtsById={{}} timeZone="UTC" onAction={() => undefined} />,
      ),
    ).toBe('');
  });
});
