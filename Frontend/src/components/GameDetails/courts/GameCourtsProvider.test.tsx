// @vitest-environment jsdom
/**
 * The game's courts as Game info reads them (`useGameCourts().card`): who
 * sees them, and the read-only variant for players (no buttons, same
 * information). The organizer-next-steps anchor sits on Game info's row.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Club, Game } from '@/types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${Object.values(params).map(String).join(',')}` : key,
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
vi.mock('@/i18n/config', () => ({ default: { t: (key: string) => key } }));
vi.mock('@/hooks/useBackButtonModal', () => ({ useBackButtonModal: () => undefined }));
vi.mock('@/api/games', () => ({ gamesApi: {} }));
vi.mock('@/api/axios', () => ({ default: {} }));

const { GameCourtsProvider } = await import('./GameCourtsProvider');
const { useGameCourts } = await import('./gameCourtsContext');
const { CourtsCard } = await import('@/features/court-reservations/CourtsCard');
const { gameShowsCourtsSection, GAME_COURTS_SECTION_ID } = await import('./gameCourtsModel');

/** What Game info renders in its "where" row. */
function Probe() {
  const { card, planner } = useGameCourts();
  if (!card) return null;
  return (
    <div id={GAME_COURTS_SECTION_ID} data-planner={planner ? 'yes' : 'no'}>
      <CourtsCard {...card} embedded />
    </div>
  );
}
const { ORGANIZER_SECTION_SELECTORS } = await import('@/features/organizer-next-actions/scrollToSection');

const club: Club = {
  id: 'club',
  name: 'X-Padel',
  address: '',
  cityId: 'city',
  courts: [
    { id: 'c1', name: 'Court 1', clubId: 'club', isIndoor: false },
    { id: 'c2', name: 'Court 2', clubId: 'club', isIndoor: false },
  ],
};

function game(patch: Partial<Game> = {}): Game {
  return {
    id: 'g1',
    entityType: 'GAME',
    clubId: 'club',
    club,
    city: { id: 'city', timezone: 'UTC' },
    startTime: '2026-10-10T18:00:00.000Z',
    endTime: '2026-10-10T19:30:00.000Z',
    timeIsSet: true,
    maxParticipants: 8,
    playersPerMatch: 4,
    reportedAnyCourtCount: 0,
    courtSlotCount: 2,
    gameCourts: [
      { id: 'gc1', gameId: 'g1', courtId: 'c1', order: 1, reservation: 'REPORTED', court: club.courts![0] },
    ],
    participants: [],
    status: 'ANNOUNCED',
    resultsStatus: 'NONE',
    ...patch,
  } as unknown as Game;
}

function render(g: Game, courts = club.courts!, clubs = [club]) {
  return renderToStaticMarkup(
    <GameCourtsProvider game={g} courts={courts} clubs={clubs} canEdit={false} onGameUpdate={() => undefined}>
      <Probe />
    </GameCourtsProvider>,
  );
}

describe('GameCourtsProvider', () => {
  it('shows every slot read-only for players under the organizer anchor', () => {
    const html = render(game());
    expect(ORGANIZER_SECTION_SELECTORS.courts).toBe('#game-courts');
    expect(html).toContain('id="game-courts"');
    expect(html).toContain('data-testid="courts-card"');
    expect(html).toContain('data-planner="no"');
    expect(html).toContain('Court 1');
    // Two courts chosen, one assigned: the second is still "Any court".
    expect(html).toContain('card.anyCourt');
    expect(html).not.toContain('<button');
  });

  it('gives Game info no courts for bars, events and finished games; without a club only organizers see it', () => {
    expect(gameShowsCourtsSection(game({ entityType: 'BAR' }))).toBe(false);
    expect(gameShowsCourtsSection(game({ entityType: 'EVENT' } as Partial<Game>))).toBe(false);
    // No club yet: the organizer's card asks for one; players see nothing.
    expect(gameShowsCourtsSection(game({ clubId: undefined, club: undefined }))).toBe(true);
    expect(render(game({ clubId: undefined, club: undefined }), [], [])).toBe('');
    expect(gameShowsCourtsSection(game({ status: 'FINISHED' }))).toBe(false);
    expect(gameShowsCourtsSection(game({ resultsStatus: 'FINAL' }))).toBe(false);
    expect(render(game({ entityType: 'BAR' }))).toBe('');
  });

  it('covers league fixtures and trainings at a club', () => {
    expect(gameShowsCourtsSection(game({ entityType: 'LEAGUE' }))).toBe(true);
    expect(gameShowsCourtsSection(game({ entityType: 'TRAINING' }))).toBe(true);
  });
});
