import { describe, expect, it } from 'vitest';
import type { Game } from '@/types';
import { mergeFindCardGame } from './mergeFindCardGame';

describe('mergeFindCardGame', () => {
  it('updates card fields and strips fat detail payload', () => {
    const existing = {
      id: 'g1',
      name: 'old',
      userNote: 'note',
      weatherSummary: { temp: 18 },
      participants: [
        {
          userId: 'u1',
          role: 'OWNER',
          status: 'PLAYING',
          user: { id: 'u1', firstName: 'A', level: 3 },
        },
      ],
    } as unknown as Game;

    const incoming = {
      id: 'g1',
      name: 'new',
      maxParticipants: 4,
      resultsArtifacts: { status: 'done' },
      linkedBookings: [{ id: 'b1' }],
      rounds: [{ id: 'r1' }],
      club: { id: 'c1', name: 'Club', integrationConfig: { token: 'x' }, integrationType: 'X' },
      city: { id: 'city', name: 'City', telegramGroupId: 'tg' },
      participants: [
        {
          userId: 'u1',
          role: 'OWNER',
          status: 'PLAYING',
          user: {
            id: 'u1',
            firstName: 'A',
            level: 3.5,
            bio: 'fat',
            weeklyAvailability: {},
            sportProfiles: [{ sport: 'PADEL', level: 3.5 }],
          },
        },
      ],
    } as unknown as Game;

    const merged = mergeFindCardGame(existing, incoming) as Game & {
      userNote?: string;
      weatherSummary?: { temp: number };
      resultsArtifacts?: unknown;
      linkedBookings?: unknown;
      rounds?: unknown;
    };

    expect(merged.name).toBe('new');
    expect(merged.maxParticipants).toBe(4);
    expect(merged.userNote).toBe('note');
    expect(merged.weatherSummary).toEqual({ temp: 18 });
    expect(merged.resultsArtifacts).toBeUndefined();
    expect(merged.linkedBookings).toBeUndefined();
    expect(merged.rounds).toBeUndefined();
    expect((merged.club as { integrationConfig?: unknown }).integrationConfig).toBeUndefined();
    expect((merged.city as { telegramGroupId?: unknown }).telegramGroupId).toBeUndefined();
    expect((merged.participants[0].user as { bio?: string; level?: number }).bio).toBeUndefined();
    expect((merged.participants[0].user as { level?: number }).level).toBe(3.5);
    expect(
      (merged.participants[0].user as { sportProfiles?: unknown }).sportProfiles,
    ).toBeUndefined();
  });
});
