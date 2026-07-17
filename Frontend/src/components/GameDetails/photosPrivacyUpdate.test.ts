import { describe, expect, it } from 'vitest';
import type { Game } from '@/types';
import { mergePhotosPrivacyIntoGame } from './photosPrivacyUpdate';

describe('mergePhotosPrivacyIntoGame', () => {
  it('preserves shell fields the update API omits', () => {
    const shell = {
      id: 'g1',
      forbidOthersPhotosView: false,
      city: { id: 'c1', name: 'Belgrade', country: 'RS', timezone: 'Europe/Belgrade' },
      participants: [{ userId: 'u1', role: 'OWNER', status: 'PLAYING' }],
      weatherSummary: { tempC: 22 },
    } as unknown as Game;

    const merged = mergePhotosPrivacyIntoGame(shell, true);

    expect(merged.forbidOthersPhotosView).toBe(true);
    expect(merged.city?.id).toBe('c1');
    expect(merged.participants).toHaveLength(1);
    expect(merged.weatherSummary).toBeTruthy();
  });
});
