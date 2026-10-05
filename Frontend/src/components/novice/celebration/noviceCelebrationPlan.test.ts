import { describe, expect, it } from 'vitest';
import { buildNoviceCelebrationPlan, MAX_CELEBRATED_ACHIEVEMENTS } from './noviceCelebrationPlan';

const kinds = (steps: ReturnType<typeof buildNoviceCelebrationPlan>) => steps.map((s) => s.kind);

describe('buildNoviceCelebrationPlan', () => {
  it('single rank: first game → Debut, reveals the rank-1 features', () => {
    const steps = buildNoviceCelebrationPlan({ fromRank: 0, toRank: 1, countedGames: 1 });
    expect(kinds(steps)).toEqual(['congrats', 'rankUp', 'features']);
    expect(steps[0]).toMatchObject({ kind: 'congrats', isFirstGame: true, gameNumber: 1 });
    expect(steps[1]).toMatchObject({ kind: 'rankUp', fromRank: 0, toRank: 1 });
    expect(steps[2]).toEqual({
      kind: 'features',
      features: ['homeShell', 'findTab', 'calendar', 'pastGames'],
      isRegular: false,
    });
  });

  it('multi-rank jump: one combined sequence ending on the highest rank', () => {
    const steps = buildNoviceCelebrationPlan({ fromRank: 1, toRank: 3, countedGames: 3 });
    expect(kinds(steps)).toEqual(['congrats', 'rankUp', 'features']);
    expect(steps.filter((s) => s.kind === 'rankUp')).toHaveLength(1);
    expect(steps[0]).toMatchObject({ isFirstGame: false, gameNumber: 3 });
    expect(steps[1]).toMatchObject({ fromRank: 1, toRank: 3 });
    const features = steps[2].kind === 'features' ? steps[2].features : [];
    expect(features).toEqual([
      'chatsTab',
      'followPlayers',
      'playStreak',
      'createGame',
      'topTab',
      'levelHistory',
      'playerComparison',
    ]);
  });

  it('Regular finale: flags the full-app message and does not celebrate ads', () => {
    const steps = buildNoviceCelebrationPlan({ fromRank: 4, toRank: 5, countedGames: 5 });
    const last = steps[steps.length - 1];
    expect(last).toEqual({
      kind: 'features',
      features: ['aiAssistant', 'wallet', 'createLeague'],
      isRegular: true,
    });
  });

  it('first game straight to Regular (0 → 5) reveals everything except ads', () => {
    const steps = buildNoviceCelebrationPlan({ fromRank: 0, toRank: 5, countedGames: 7 });
    const last = steps[steps.length - 1];
    expect(last.kind === 'features' && last.isRegular).toBe(true);
    expect(last.kind === 'features' && last.features.includes('ads')).toBe(false);
    expect(steps[0]).toMatchObject({ gameNumber: 7, isFirstGame: false });
  });

  it('adds an achievement step (capped) between congrats and rank-up', () => {
    const achievements = Array.from({ length: 5 }, (_, i) => ({
      definitionId: `d${i}`,
      titleKey: `t${i}`,
      artKey: 'a',
      rarity: 'COMMON' as const,
    }));
    const steps = buildNoviceCelebrationPlan({ fromRank: 0, toRank: 1, countedGames: 1, achievements });
    expect(kinds(steps)).toEqual(['congrats', 'achievements', 'rankUp', 'features']);
    expect(steps[1].kind === 'achievements' && steps[1].items).toHaveLength(MAX_CELEBRATED_ACHIEVEMENTS);
  });

  it('nothing to play when the rank is already acknowledged', () => {
    expect(buildNoviceCelebrationPlan({ fromRank: 2, toRank: 2, countedGames: 2 })).toEqual([]);
    expect(buildNoviceCelebrationPlan({ fromRank: 3, toRank: 2, countedGames: 3 })).toEqual([]);
  });

  it('falls back to the rank for the game number when the count is missing', () => {
    const steps = buildNoviceCelebrationPlan({ fromRank: 1, toRank: 2, countedGames: null });
    expect(steps[0]).toMatchObject({ gameNumber: 2, isFirstGame: false });
  });
});
