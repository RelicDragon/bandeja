import { describe, expect, it } from 'vitest';
import {
  formatTrainerDisplayName,
  resolveFindEmptyMessage,
  resolveQuickShortcutEmptyTitle,
} from './findTrainerEmptyMessage';

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
        eventsFilterVal: false,
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
        eventsFilterVal: false,
        favoriteTrainerName: null,
        t,
      }),
    ).toBe('No training found');
  });

  it('uses generic empty copy when more than one entity chip is on', () => {
    expect(
      resolveFindEmptyMessage({
        gameFilterVal: true,
        trainingFilterVal: true,
        tournamentFilterVal: false,
        leaguesFilterVal: false,
        eventsFilterVal: false,
        favoriteTrainerName: 'Anna Smith',
        t,
      }),
    ).toBe('No games found');
  });

  it('uses events empty copy when only the events chip is on', () => {
    expect(
      resolveFindEmptyMessage({
        gameFilterVal: false,
        trainingFilterVal: false,
        tournamentFilterVal: false,
        leaguesFilterVal: false,
        eventsFilterVal: true,
        t,
      }),
    ).toBe('No events found');
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

describe('PRD 358 — empty title under a quick shortcut', () => {
  const noChips = {
    gameFilterVal: false,
    trainingFilterVal: false,
    tournamentFilterVal: false,
    leaguesFilterVal: false,
    eventsFilterVal: false,
    t,
  };

  it('names the day instead of the generic title', () => {
    expect(resolveFindEmptyMessage({ ...noChips, quickShortcut: 'tomorrow' })).toBe('No games tomorrow');
    expect(resolveFindEmptyMessage({ ...noChips, quickShortcut: 'weekend' })).toBe(
      'No games this weekend',
    );
  });

  it('also replaces the generic title when the Games chip is the only chip on', () => {
    expect(
      resolveFindEmptyMessage({ ...noChips, gameFilterVal: true, quickShortcut: 'weekend' }),
    ).toBe('No games this weekend');
  });

  it('leaves entity-specific titles alone', () => {
    expect(
      resolveFindEmptyMessage({ ...noChips, trainingFilterVal: true, quickShortcut: 'tomorrow' }),
    ).toBe('No training found');
  });

  it('is unchanged with no shortcut', () => {
    expect(resolveFindEmptyMessage({ ...noChips, quickShortcut: null })).toBe('No games found');
    expect(resolveQuickShortcutEmptyTitle('weekend', t)).toBe('No games this weekend');
  });
});
