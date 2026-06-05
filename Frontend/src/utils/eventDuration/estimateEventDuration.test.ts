import { describe, expect, it } from 'vitest';
import { Sports } from '@shared/sport';
import { CREATE_TEMPLATES } from '@/sport/createFlow';
import { estimateEventDuration, estimateFromCreateTemplate } from './estimateEventDuration';
import { levelDurationCoefficient } from './levelDurationScale';

describe('levelDurationCoefficient', () => {
  it('padel: 1.0 → 1, 6.5 → 3', () => {
    expect(levelDurationCoefficient(Sports.PADEL, 1.0)).toBeCloseTo(1, 5);
    expect(levelDurationCoefficient(Sports.PADEL, 6.5)).toBeCloseTo(3, 5);
  });
});

describe('estimateEventDuration', () => {
  it('4p doubles AUTOMATIC points: 3 × match time', () => {
    const r = estimateEventDuration({
      sport: Sports.PADEL,
      maxParticipants: 4,
      playersPerMatch: 4,
      courtCount: 1,
      scoringPreset: 'POINTS_24',
      matchGenerationType: 'RANDOM',
      matchTimerEnabled: false,
      matchTimedCapMinutes: 0,
      creatorLevel: 3,
      playerLevelRange: [2, 4],
      invitedLevels: [],
      baselineRounds: 6,
      suggestedMaxParticipants: 16,
      suggestedCourts: 4,
    });
    expect(r.playMinutes).toBe(61);
    expect(r.label).toBe('~1h');
  });

  it('4p doubles AUTOMATIC classic: single match', () => {
    const r = estimateEventDuration({
      sport: Sports.PADEL,
      maxParticipants: 4,
      playersPerMatch: 4,
      courtCount: 1,
      scoringPreset: 'CLASSIC_BEST_OF_3',
      matchGenerationType: 'AUTOMATIC',
      matchTimerEnabled: false,
      matchTimedCapMinutes: 0,
      creatorLevel: 3,
      playerLevelRange: [2, 4],
      invitedLevels: [],
      baselineRounds: 1,
      suggestedMaxParticipants: 16,
      suggestedCourts: 4,
    });
    expect(r.playMinutes).toBe(112);
    expect(r.label).toBe('~1h 50m');
  });

  it('16p rotation scales down for fewer players', () => {
    const full = estimateFromCreateTemplate(CREATE_TEMPLATES.PADEL_AMERICANO, {
      sport: Sports.PADEL,
      maxParticipants: 16,
      playersPerMatch: 4,
      courtCount: 4,
      creatorLevel: 3,
      playerLevelRange: [2, 5],
      invitedLevels: [],
    });
    const smaller = estimateFromCreateTemplate(CREATE_TEMPLATES.PADEL_AMERICANO, {
      sport: Sports.PADEL,
      maxParticipants: 8,
      playersPerMatch: 4,
      courtCount: 4,
      creatorLevel: 3,
      playerLevelRange: [2, 5],
      invitedLevels: [],
    });
    expect(smaller.playMinutes).toBeLessThan(full.playMinutes);
  });

  it('5p americano estimate is not less than 4p', () => {
    const four = estimateFromCreateTemplate(CREATE_TEMPLATES.PADEL_AMERICANO, {
      sport: Sports.PADEL,
      maxParticipants: 4,
      playersPerMatch: 4,
      courtCount: 1,
      creatorLevel: 3,
      playerLevelRange: [2, 5],
      invitedLevels: [],
    });
    const five = estimateFromCreateTemplate(CREATE_TEMPLATES.PADEL_AMERICANO, {
      sport: Sports.PADEL,
      maxParticipants: 5,
      playersPerMatch: 4,
      courtCount: 1,
      creatorLevel: 3,
      playerLevelRange: [2, 5],
      invitedLevels: [],
    });
    expect(five.playMinutes).toBeGreaterThanOrEqual(four.playMinutes);
  });

  it('americano duration grows from 8p to 16p', () => {
    const eight = estimateFromCreateTemplate(CREATE_TEMPLATES.PADEL_AMERICANO, {
      sport: Sports.PADEL,
      maxParticipants: 8,
      playersPerMatch: 4,
      courtCount: 2,
      creatorLevel: 3,
      playerLevelRange: [2, 5],
      invitedLevels: [],
    });
    const sixteen = estimateFromCreateTemplate(CREATE_TEMPLATES.PADEL_AMERICANO, {
      sport: Sports.PADEL,
      maxParticipants: 16,
      playersPerMatch: 4,
      courtCount: 4,
      creatorLevel: 3,
      playerLevelRange: [2, 5],
      invitedLevels: [],
    });
    expect(sixteen.playMinutes).toBeGreaterThan(eight.playMinutes);
  });

  it('best-of-3 badge uses one-match wall clock at 4p and 16p', () => {
    const small = estimateFromCreateTemplate(CREATE_TEMPLATES.PADEL_BEST_OF_3, {
      sport: Sports.PADEL,
      maxParticipants: 4,
      playersPerMatch: 4,
      courtCount: 1,
      creatorLevel: 3,
      playerLevelRange: [2, 5],
      invitedLevels: [],
    });
    const large = estimateFromCreateTemplate(CREATE_TEMPLATES.PADEL_BEST_OF_3, {
      sport: Sports.PADEL,
      maxParticipants: 16,
      playersPerMatch: 4,
      courtCount: 4,
      creatorLevel: 3,
      playerLevelRange: [2, 5],
      invitedLevels: [],
    });
    expect(large.playMinutes).toBe(small.playMinutes);
  });

  it('duration rises when participants exceed 4-court capacity', () => {
    const atCap = estimateFromCreateTemplate(CREATE_TEMPLATES.PADEL_AMERICANO, {
      sport: Sports.PADEL,
      maxParticipants: 16,
      playersPerMatch: 4,
      courtCount: 4,
      creatorLevel: 3,
      playerLevelRange: [2, 5],
      invitedLevels: [],
    });
    const overCap = estimateFromCreateTemplate(CREATE_TEMPLATES.PADEL_AMERICANO, {
      sport: Sports.PADEL,
      maxParticipants: 24,
      playersPerMatch: 4,
      courtCount: 4,
      creatorLevel: 3,
      playerLevelRange: [2, 5],
      invitedLevels: [],
    });
    expect(overCap.playMinutes).toBeGreaterThan(atCap.playMinutes);
  });

  it('timer cap drives match minutes', () => {
    const r = estimateFromCreateTemplate(CREATE_TEMPLATES.PADEL_TIMED, {
      sport: Sports.PADEL,
      maxParticipants: 4,
      playersPerMatch: 4,
      courtCount: 1,
      creatorLevel: 3,
      playerLevelRange: [2, 5],
      invitedLevels: [],
      matchTimedCapMinutes: 10,
      matchTimerEnabled: true,
    });
    expect(r.playMinutes).toBe(15);
  });
});
