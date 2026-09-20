/**
 * PRD 347 — the organizer's "Auto-fill from queue" row inside `GameSettings`.
 *
 * Asserts the row exists, sits immediately after "allow direct join", carries
 * the gender/level helper, and shows the read-only queue count — including the
 * "No one waiting yet" empty state.
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

vi.mock('@/components', () => ({
  ToggleSwitch: ({ checked }: { checked: boolean }) => (
    <button type="button" data-toggle={checked ? 'on' : 'off'} />
  ),
}));

vi.mock('@/components/gameSettings', () => ({
  CollapsibleSettingsShell: ({ children }: { children: React.ReactNode }) => (
    <section>{children}</section>
  ),
}));

vi.mock('@/hooks/useShowSettingsNotes', () => ({
  useShowSettingsNotes: () => ({ showNotes: true, toggleShowNotes: () => {} }),
}));

vi.mock('@/api', () => ({
  gamesApi: { update: vi.fn(), getById: vi.fn() },
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/features/game-series/SeriesMakeWeeklyRow', () => ({
  SeriesMakeWeeklyRow: () => null,
}));

const { GameSettings } = await import('@/components/GameDetails/GameSettings');

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'g1',
    entityType: 'GAME',
    status: 'ANNOUNCED',
    resultsStatus: 'NONE',
    isPublic: true,
    affectsRating: true,
    anyoneCanInvite: false,
    resultsByAnyone: false,
    allowDirectJoin: true,
    afterGameGoToBar: false,
    autoFillFromQueue: false,
    joinQueues: [],
    ...overrides,
  } as unknown as Game;
}

function render(game: Game) {
  return renderToStaticMarkup(
    <GameSettings game={game} canEdit onGameUpdate={() => {}} embedded />,
  );
}

describe('auto-fill from queue settings row', () => {
  it('renders the toggle with the gender/level helper', () => {
    const html = render(makeGame());
    expect(html).toContain('spots.settings.autoFillTitle');
    expect(html).toContain('spots.settings.autoFillHelper');
  });

  it('sits immediately after the allow-direct-join row', () => {
    const html = render(makeGame());
    const directJoin = html.indexOf('createGame.allowDirectJoin.title');
    const autoFill = html.indexOf('spots.settings.autoFillTitle');
    const afterBar = html.indexOf('createGame.afterGameGoToBar.title');
    expect(directJoin).toBeGreaterThan(-1);
    expect(autoFill).toBeGreaterThan(directJoin);
    expect(afterBar).toBeGreaterThan(autoFill);
  });

  it('shows the read-only queue count', () => {
    const html = render(
      makeGame({
        joinQueues: [
          { userId: 'a', createdAt: '2026-01-01T10:00:00.000Z' },
          { userId: 'b', createdAt: '2026-01-01T11:00:00.000Z' },
          { userId: 'c', createdAt: '2026-01-01T12:00:00.000Z' },
        ],
      } as Partial<Game>),
    );
    expect(html).toContain('spots.settings.queueCount:{&quot;count&quot;:3}');
    expect(html).not.toContain('spots.settings.queueEmpty');
  });

  it('falls back to the empty state when nobody is waiting', () => {
    const html = render(makeGame());
    expect(html).toContain('spots.settings.queueEmpty');
    expect(html).not.toContain('spots.settings.queueCount');
  });

  it('reflects the stored value on the toggle', () => {
    expect(render(makeGame({ autoFillFromQueue: true }))).toContain('data-toggle="on"');
  });
});
