import { describe, expect, it } from 'vitest';
import { Sports } from '@shared/sport';
import { matchFormatDisplay, matchFormatSummaryPart } from './summarizeGameFormat';

const t = (key: string) => key;

describe('matchFormatDisplay', () => {
  it('shows singles for non-default padel 1v1', () => {
    expect(matchFormatDisplay(t, 2, Sports.PADEL)).toEqual({
      label: 'sport.matchSingles',
      hint: 'sport.match1v1',
    });
  });

  it('shows doubles for non-default tennis 2v2', () => {
    expect(matchFormatDisplay(t, 4, Sports.TENNIS)).toEqual({
      label: 'sport.matchDoubles',
      hint: 'sport.match2v2',
    });
  });

  it('hides when sport default is selected', () => {
    expect(matchFormatDisplay(t, 4, Sports.PADEL)).toBeNull();
    expect(matchFormatDisplay(t, 2, Sports.TENNIS)).toBeNull();
  });

  it('hides when sport allows only one match size', () => {
    expect(matchFormatDisplay(t, 2, Sports.SQUASH)).toBeNull();
  });

  it('summary part returns label only', () => {
    expect(matchFormatSummaryPart(t, 2, Sports.PADEL)).toBe('sport.matchSingles');
    expect(matchFormatSummaryPart(t, 4, Sports.PADEL)).toBeNull();
  });
});
