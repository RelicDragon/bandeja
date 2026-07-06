import { describe, expect, it } from 'vitest';
import type { Game } from '@/types';
import { mergeGamePhotoRefresh } from '@/utils/gameResultsArtifacts.util';

function baseShellGame(): Game {
  return {
    id: 'game-1',
    name: 'Evening padel',
    sport: 'PADEL',
    entityType: 'GAME',
    status: 'FINISHED',
    resultsStatus: 'FINAL',
    photosCount: 1,
    mainPhotoId: 'photo-1',
    mainPhoto: { id: 'photo-1', thumbnailUrl: '/t1.jpg', originalUrl: '/o1.jpg' },
    participants: [{ userId: 'u1', role: 'OWNER', status: 'PLAYING' }],
    rounds: [{ id: 'round-1', matches: [] }],
  } as Game;
}

describe('mergeGamePhotoRefresh', () => {
  it('preserves shell fields when API patch only updates photo metadata', () => {
    const prev = baseShellGame();
    const next = {
      photosCount: 2,
      mainPhotoId: 'photo-2',
      mainPhoto: { id: 'photo-2', thumbnailUrl: '/t2.jpg', originalUrl: '/o2.jpg' },
    } as Game;

    const merged = mergeGamePhotoRefresh(prev, next);
    expect(merged.participants).toEqual(prev.participants);
    expect(merged.rounds).toEqual(prev.rounds);
    expect(merged.photosCount).toBe(2);
    expect(merged.mainPhotoId).toBe('photo-2');
  });

  it('does not resurrect main photo after delete when API returns mainPhoto: null', () => {
    const prev = baseShellGame();
    const next = {
      photosCount: 0,
      mainPhoto: null,
      mainPhotoId: null,
    } as Game;

    const merged = mergeGamePhotoRefresh(prev, next);
    expect(merged.photosCount).toBe(0);
    expect(merged.mainPhotoId).toBeNull();
    expect(merged.mainPhoto).toBeNull();
    expect(merged.participants).toEqual(prev.participants);
  });

  it('resolves mainPhotoId from mainPhoto when API omits mainPhotoId', () => {
    const prev = baseShellGame();
    const next = {
      photosCount: 2,
      mainPhoto: { id: 'photo-2', thumbnailUrl: '/t2.jpg', originalUrl: '/o2.jpg' },
    } as Game;

    const merged = mergeGamePhotoRefresh(prev, next);
    expect(merged.mainPhotoId).toBe('photo-2');
  });

  it('simulates stale spread race without dropping participants', () => {
    const prev = baseShellGame();
    const staleSpread = {
      ...prev,
      participants: undefined,
      rounds: undefined,
      photosCount: 3,
      mainPhotoId: 'photo-3',
      mainPhoto: { id: 'photo-3', thumbnailUrl: '/t3.jpg', originalUrl: '/o3.jpg' },
    } as Game;

    const merged = mergeGamePhotoRefresh(prev, staleSpread);
    expect(merged.participants).toEqual(prev.participants);
    expect(merged.rounds).toEqual(prev.rounds);
    expect(merged.photosCount).toBe(3);
  });
});
