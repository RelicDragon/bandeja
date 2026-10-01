import { describe, expect, it } from 'vitest';
import type { Game } from '@/types';
import { canManageTrainingRatings } from './trainingRatingPermission';

const game = {
  id: 'g1',
  entityType: 'TRAINING',
  trainerId: 'coach',
  participants: [
    { userId: 'owner', role: 'OWNER', status: 'PLAYING' },
    { userId: 'coach', role: 'ADMIN', status: 'NON_PLAYING' },
    { userId: 'ana', role: 'PARTICIPANT', status: 'PLAYING' },
  ],
  parent: { participants: [{ userId: 'parentOwner', role: 'OWNER', status: 'PLAYING' }] },
} as unknown as Game;

describe('canManageTrainingRatings', () => {
  it('allows the game trainer, a trainer-flagged owner or parent owner, and platform admins', () => {
    expect(canManageTrainingRatings(game, { id: 'coach', isTrainer: true })).toBe(true);
    expect(canManageTrainingRatings(game, { id: 'owner', isTrainer: true })).toBe(true);
    expect(canManageTrainingRatings(game, { id: 'parentOwner', isTrainer: true })).toBe(true);
    expect(canManageTrainingRatings(game, { id: 'stranger', isAdmin: true })).toBe(true);
  });

  it('refuses a non-trainer owner, a participant, an outside trainer and a signed-out viewer', () => {
    expect(canManageTrainingRatings(game, { id: 'owner' })).toBe(false);
    expect(canManageTrainingRatings(game, { id: 'coach' })).toBe(false);
    expect(canManageTrainingRatings(game, { id: 'ana', isTrainer: true })).toBe(false);
    expect(canManageTrainingRatings(game, { id: 'outsider', isTrainer: true })).toBe(false);
    expect(canManageTrainingRatings(game, null)).toBe(false);
  });
});
