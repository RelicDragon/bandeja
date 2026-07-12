import { describe, expect, it } from 'vitest';
import { getRules } from './rulebook';
import { Sports } from '@shared/sport';
import {
  AUTOMATIC_RECORD_MODE_METADATA_KEY,
  canUseSuperTiebreakEntry,
  getAutomaticRelaxedKeypadOptions,
  mergeAutomaticMatchRecordMetadata,
  parseAutomaticMatchRecordMode,
  recommendAutomaticSetScore,
  resolveAutomaticSetEntryMode,
} from './automaticRelaxedScoring';

describe('automaticRelaxedScoring', () => {
  const rules = getRules({ sport: Sports.PADEL, scoringPreset: 'CLASSIC_AUTOMATIC' } as never);

  it('stores match record mode in metadata', () => {
    const merged = mergeAutomaticMatchRecordMetadata({}, 'AMERICANO_POINTS');
    expect(merged[AUTOMATIC_RECORD_MODE_METADATA_KEY]).toBe('AMERICANO_POINTS');
    expect(parseAutomaticMatchRecordMode(merged)).toBe('AMERICANO_POINTS');
  });

  it('offers super tiebreak only when prior sets are tied', () => {
    const sets = [
      { teamA: 6, teamB: 4, isTieBreak: false },
      { teamA: 4, teamB: 6, isTieBreak: false },
      { teamA: 0, teamB: 0, isTieBreak: false },
    ];
    expect(canUseSuperTiebreakEntry(2, sets, rules)).toBe(true);
    expect(canUseSuperTiebreakEntry(1, sets, rules)).toBe(false);
  });

  it('uses match metadata for later sets and super tiebreak override on decider', () => {
    const metadata = mergeAutomaticMatchRecordMetadata({}, 'AMERICANO_POINTS');
    const sets = [
      { teamA: 24, teamB: 18, isTieBreak: false },
      { teamA: 18, teamB: 24, isTieBreak: false },
      { teamA: 0, teamB: 0, isTieBreak: false },
    ];
    expect(resolveAutomaticSetEntryMode(1, sets, rules, metadata, false)).toBe('AMERICANO_POINTS');
    expect(resolveAutomaticSetEntryMode(2, sets, rules, metadata, true)).toBe('SUPER_TIEBREAK');
  });

  it('recommends classic games but allows americano save', () => {
    const hint = recommendAutomaticSetScore(4, 3, rules, 'GAMES');
    expect(hint.ok).toBe(false);
    const relaxed = recommendAutomaticSetScore(24, 18, rules, 'AMERICANO_POINTS');
    expect(relaxed.ok).toBe(true);
  });

  it('keypad caps follow entry mode including super tiebreak on decider', () => {
    const metadata = mergeAutomaticMatchRecordMetadata({}, 'GAMES');
    const sets = [
      { teamA: 6, teamB: 4, isTieBreak: false },
      { teamA: 4, teamB: 6, isTieBreak: false },
      { teamA: 0, teamB: 0, isTieBreak: false },
    ];
    expect(resolveAutomaticSetEntryMode(2, sets, rules, metadata, false)).toBe('GAMES');
    expect(getAutomaticRelaxedKeypadOptions(rules, 'GAMES').max).toBe(10);
    expect(resolveAutomaticSetEntryMode(2, sets, rules, metadata, true)).toBe('SUPER_TIEBREAK');
    expect(getAutomaticRelaxedKeypadOptions(rules, 'SUPER_TIEBREAK').max).toBe(15);
  });
});
