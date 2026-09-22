/**
 * PRD 360 — the organizer's "Novices welcome" row inside `GameSettings`.
 *
 * The row is the only place the promise can be made after creation, so what is
 * asserted here is: it exists on the entity types that have the capability, it
 * is absent on the ones that do not, it locks with the other settings once
 * results entry starts, and the hint that says the level range still applies is
 * on screen whenever the switch is on — hiding notes must not hide it.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Game } from '@/types';

let showNotes = true;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
    i18n: { language: 'en-GB' },
  }),
}));

vi.mock('@/components', () => ({
  ToggleSwitch: ({ checked, disabled }: { checked: boolean; disabled?: boolean }) => (
    <button type="button" data-toggle={checked ? 'on' : 'off'} disabled={disabled} />
  ),
}));

vi.mock('@/components/gameSettings', () => ({
  CollapsibleSettingsShell: ({ children }: { children: React.ReactNode }) => (
    <section>{children}</section>
  ),
}));

vi.mock('@/hooks/useShowSettingsNotes', () => ({
  useShowSettingsNotes: () => ({ showNotes, toggleShowNotes: () => {} }),
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
    suitableForNovices: false,
    joinQueues: [],
    ...overrides,
  } as unknown as Game;
}

function render(game: Game, canEdit = true) {
  return renderToStaticMarkup(
    <GameSettings game={game} canEdit={canEdit} onGameUpdate={() => {}} embedded />,
  );
}

const TITLE = 'createGame.suitableForNovices.title';
const HINT = 'createGame.suitableForNovices.hint';

describe('novices welcome settings row', () => {
  it('renders the toggle with its hint', () => {
    showNotes = true;
    const html = render(makeGame());
    expect(html).toContain(TITLE);
    expect(html).toContain(HINT);
  });

  it('sits right after the anyone-can-invite row', () => {
    showNotes = true;
    const html = render(makeGame());
    const anyoneCanInvite = html.indexOf('createGame.anyoneCanInvite.title');
    const novices = html.indexOf(TITLE);
    const resultsByAnyone = html.indexOf('createGame.resultsByAnyone.title');
    expect(anyoneCanInvite).toBeGreaterThan(-1);
    expect(novices).toBeGreaterThan(anyoneCanInvite);
    expect(resultsByAnyone).toBeGreaterThan(novices);
  });

  it('keeps the "level range still applies" hint visible while the promise is on', () => {
    showNotes = false;
    expect(render(makeGame({ suitableForNovices: false }))).not.toContain(HINT);
    expect(render(makeGame({ suitableForNovices: true }))).toContain(HINT);
  });

  it('reflects the stored value on the toggle', () => {
    showNotes = true;
    expect(render(makeGame({ suitableForNovices: true }))).toContain('data-toggle="on"');
  });

  it('is hidden for entity types without the capability', () => {
    showNotes = true;
    for (const entityType of ['LEAGUE', 'LEAGUE_SEASON', 'EVENT'] as const) {
      expect(render(makeGame({ entityType }))).not.toContain(TITLE);
    }
    for (const entityType of ['GAME', 'TOURNAMENT', 'TRAINING', 'BAR'] as const) {
      expect(render(makeGame({ entityType }))).toContain(TITLE);
    }
  });

  it('locks once results entry has started', () => {
    showNotes = true;
    const locked = render(makeGame({ resultsStatus: 'IN_PROGRESS', suitableForNovices: true }));
    expect(locked).toContain(TITLE);
    // Every toggle in the block is disabled together; the promise is one of them.
    expect(locked).not.toContain('data-toggle="on"><');
    expect(locked).toContain('disabled=""');
  });
});
