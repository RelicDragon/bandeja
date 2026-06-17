import { describe, expect, it } from 'vitest';
import { formatTrainerDisplayName, resolveFindEmptyMessage } from './findTrainerEmptyMessage';

const t = (key: string, options?: { defaultValue?: string; name?: string }) => {
  if (key === 'trainers.noTrainingsByTrainer' && options?.name) {
    return `No trainings by ${options.name}`;
  }
  return options?.defaultValue ?? key;
};

describe('resolveFindEmptyMessage', () => {
  it('returns trainer-specific message when favorite trainer is set', () => {
    expect(
      resolveFindEmptyMessage({
        gameFilterVal: false,
        trainingFilterVal: true,
        tournamentFilterVal: false,
        leaguesFilterVal: false,
        favoriteTrainerName: 'Anna Smith',
        t,
      }),
    ).toBe('No trainings by Anna Smith');
  });

  it('falls back to generic training message without trainer name', () => {
    expect(
      resolveFindEmptyMessage({
        gameFilterVal: false,
        trainingFilterVal: true,
        tournamentFilterVal: false,
        leaguesFilterVal: false,
        favoriteTrainerName: null,
        t,
      }),
    ).toBe('No training found');
  });
});

describe('formatTrainerDisplayName', () => {
  it('joins first and last name', () => {
    expect(formatTrainerDisplayName('Anna', 'Smith')).toBe('Anna Smith');
  });

  it('returns null for empty names', () => {
    expect(formatTrainerDisplayName('', '')).toBeNull();
  });
});
