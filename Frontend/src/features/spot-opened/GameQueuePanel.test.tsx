/**
 * PRD 347 — the queue panel.
 *
 * Rendered to static markup: the assertions are about which copy appears for
 * which viewer, and that the dashed "Open spot" affordance only exists while a
 * seat is genuinely free on an unlocked roster.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Game } from '@/types';

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

vi.mock('@/components', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div data-card>{children}</div>,
}));

const { GameQueuePanel } = await import('./GameQueuePanel');

const FRESH = new Date(Date.now() - 60_000).toISOString();

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'g1',
    status: 'ANNOUNCED',
    resultsStatus: 'NONE',
    maxParticipants: 4,
    autoFillFromQueue: false,
    participants: [
      { userId: 'p1', status: 'PLAYING' },
      { userId: 'p2', status: 'PLAYING' },
    ],
    joinQueues: [
      { userId: 'a', createdAt: '2026-01-01T10:00:00.000Z' },
      { userId: 'b', createdAt: '2026-01-01T11:00:00.000Z' },
      { userId: 'c', createdAt: '2026-01-01T12:00:00.000Z' },
    ],
    ...overrides,
  } as unknown as Game;
}

function render(game: Game, viewerUserId: string | undefined) {
  return renderToStaticMarkup(<GameQueuePanel game={game} viewerUserId={viewerUserId} />);
}

describe('GameQueuePanel', () => {
  it('tells a queued player their position and that the organizer accepts manually', () => {
    const html = render(makeGame(), 'b');
    expect(html).toContain('spots.queue.position:{&quot;position&quot;:2,&quot;count&quot;:3}');
    expect(html).toContain('spots.queue.autoFillOff');
    expect(html).not.toContain('spots.queue.autoFillOn');
  });

  it('switches the line when auto-fill is on', () => {
    const html = render(makeGame({ autoFillFromQueue: true }), 'a');
    expect(html).toContain('spots.queue.position:{&quot;position&quot;:1,&quot;count&quot;:3}');
    expect(html).toContain('spots.queue.autoFillOn');
  });

  it('renders nothing for someone who is neither queued nor looking at a fresh seat', () => {
    expect(render(makeGame(), 'p1')).toBe('');
    expect(render(makeGame(), undefined)).toBe('');
  });

  it('PRD 364: suppresses the open-spot slot when the Next steps block carries it', () => {
    const html = renderToStaticMarkup(
      <GameQueuePanel game={makeGame({ spotOpenedAt: FRESH })} viewerUserId="p1" hideOpenSpotRow />,
    );
    expect(html).toBe('');
  });

  it('PRD 364: a queued participant keeps both the position line and the open spot', () => {
    const html = renderToStaticMarkup(
      <GameQueuePanel game={makeGame({ spotOpenedAt: FRESH })} viewerUserId="a" hideOpenSpotRow={false} />,
    );
    expect(html).toContain('spots.roster.openSpot');
    expect(html).toContain('queue-position-line');
  });

  it('shows the dashed open-spot slot while a seat is newly free', () => {
    const html = render(makeGame({ spotOpenedAt: FRESH }), 'p1');
    expect(html).toContain('spots.roster.openSpot');
    expect(html).toContain('border-dashed');
  });

  it('hides the open-spot slot when the game is full', () => {
    const full = makeGame({
      spotOpenedAt: FRESH,
      maxParticipants: 2,
    });
    expect(render(full, 'p1')).toBe('');
  });

  it('hides everything once results are locked', () => {
    const locked = makeGame({ spotOpenedAt: FRESH, resultsStatus: 'IN_PROGRESS' });
    expect(render(locked, 'b')).toBe('');
  });

  it('keeps a 44 px tap-height target on the open-spot slot', () => {
    const html = render(makeGame({ spotOpenedAt: FRESH }), 'p1');
    expect(html).toContain('min-h-[44px]');
  });
});
