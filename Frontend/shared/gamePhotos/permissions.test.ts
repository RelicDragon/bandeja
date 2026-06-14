import { describe, expect, it } from 'vitest';
import {
  canConfigureGamePhotosPrivacy,
  canManageGamePhotos,
  canViewGamePhotos,
} from './permissions';

const baseGame = {
  resultsStatus: 'FINAL' as const,
  forbidOthersPhotosView: false,
  participants: [{ userId: 'owner', role: 'OWNER' }, { userId: 'player', role: 'PARTICIPANT' }],
  parent: null,
};

describe('gamePhotos permissions', () => {
  it('canViewGamePhotos allows anyone when FINAL and open', () => {
    expect(canViewGamePhotos(baseGame)).toBe(true);
    expect(canViewGamePhotos(baseGame, null)).toBe(true);
  });

  it('canViewGamePhotos denies when not FINAL', () => {
    expect(canViewGamePhotos({ ...baseGame, resultsStatus: 'IN_PROGRESS' })).toBe(false);
    expect(
      canViewGamePhotos({ ...baseGame, resultsStatus: 'IN_PROGRESS' }, { id: 'owner', isAdmin: false }),
    ).toBe(false);
  });

  it('canViewGamePhotos restricted mode', () => {
    const restricted = { ...baseGame, forbidOthersPhotosView: true };
    expect(canViewGamePhotos(restricted)).toBe(false);
    expect(canViewGamePhotos(restricted, { id: 'stranger' })).toBe(false);
    expect(canViewGamePhotos(restricted, { id: 'player' })).toBe(true);
    expect(canViewGamePhotos(restricted, { id: 'owner' })).toBe(true);
    expect(canViewGamePhotos(restricted, { id: 'admin', isAdmin: true })).toBe(true);
  });

  it('canManageGamePhotos', () => {
    expect(canManageGamePhotos(baseGame, { id: 'player' })).toBe(true);
    expect(canManageGamePhotos(baseGame, { id: 'stranger' })).toBe(false);
    expect(canManageGamePhotos(baseGame, null)).toBe(false);
  });

  it('canConfigureGamePhotosPrivacy', () => {
    expect(canConfigureGamePhotosPrivacy(baseGame, { id: 'owner' })).toBe(true);
    expect(canConfigureGamePhotosPrivacy(baseGame, { id: 'player' })).toBe(false);
    expect(canConfigureGamePhotosPrivacy(baseGame, { id: 'admin', isAdmin: true })).toBe(true);
  });
});
