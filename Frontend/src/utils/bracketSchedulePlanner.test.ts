import { describe, expect, it } from 'vitest';
import type { BracketPlayoffPreviewResponse } from '@/api/leagues';
import { buildBracketPipelineSchedule } from './bracketSchedulePlanner';

const slots = [
  ...Array.from({ length: 4 }, (_, matchIndex) => ({
    slotKey: `MAIN-R0-M${matchIndex}`,
    slotKind: 'MAIN' as const,
    phaseIndex: 1,
    roundIndex: 0,
    matchIndex,
    roundLabel: 'Quarterfinals',
    feederSlotAKey: null,
    feederSlotBKey: null,
  })),
  ...Array.from({ length: 2 }, (_, matchIndex) => ({
    slotKey: `MAIN-R1-M${matchIndex}`,
    slotKind: 'MAIN' as const,
    phaseIndex: 1,
    roundIndex: 1,
    matchIndex,
    roundLabel: 'Semifinals',
    feederSlotAKey: `MAIN-R0-M${matchIndex * 2}`,
    feederSlotBKey: `MAIN-R0-M${matchIndex * 2 + 1}`,
  })),
  {
    slotKey: 'MAIN-R2-M0',
    slotKind: 'MAIN' as const,
    phaseIndex: 1,
    roundIndex: 2,
    matchIndex: 0,
    roundLabel: 'Final',
    feederSlotAKey: 'MAIN-R1-M0',
    feederSlotBKey: 'MAIN-R1-M1',
  },
  {
    slotKey: 'THIRD-M0',
    slotKind: 'THIRD_PLACE' as const,
    phaseIndex: 2,
    roundIndex: 0,
    matchIndex: 0,
    roundLabel: 'Third place',
    feederSlotAKey: 'MAIN-R1-M0',
    feederSlotBKey: 'MAIN-R1-M1',
  },
];

const preview: BracketPlayoffPreviewResponse = {
  groups: ['c', 'b', 'a'].map((leagueGroupId) => ({
    leagueGroupId,
    entrantCount: 8,
    bracketSize: 8,
    slots,
  })),
};

describe('bracket playoff pipeline scheduler', () => {
  it('pipelines three 8-team trees through four courts without collisions', () => {
    const result = buildBracketPipelineSchedule({
      preview,
      groupOrder: ['c', 'b', 'a'],
      groupNames: { c: 'C', b: 'B', a: 'A' },
      clubId: 'ksc',
      courts: [3, 4, 5, 6].map((n) => ({ id: `court-${n}`, name: `Court ${n}` })),
      date: '2026-08-02',
      startTime: '10:00',
      durationMinutes: 45,
    });
    expect(result).toHaveLength(24);
    expect(result.find((row) => row.leagueGroupId === 'c' && row.slotKey === 'MAIN-R0-M0')).toMatchObject({
      courtId: 'court-3',
    });
    expect(result.find((row) => row.leagueGroupId === 'c' && row.slotKey === 'MAIN-R1-M0')?.startTime)
      .toContain('T08:45:00.000Z');
    expect(result.find((row) => row.leagueGroupId === 'b' && row.slotKey === 'MAIN-R0-M0')?.startTime)
      .toContain('T08:45:00.000Z');
    for (const courtId of ['court-3', 'court-4', 'court-5', 'court-6']) {
      const rows = result.filter((row) => row.courtId === courtId).sort((a, b) => a.startTime.localeCompare(b.startTime));
      for (let i = 1; i < rows.length; i += 1) {
        expect(new Date(rows[i]!.startTime).getTime()).toBeGreaterThanOrEqual(new Date(rows[i - 1]!.endTime).getTime());
      }
    }
  });
});
