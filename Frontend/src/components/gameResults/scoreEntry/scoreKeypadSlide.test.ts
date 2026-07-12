import { describe, expect, it } from 'vitest';
import { resolveKeypadSlideDirection, resolveKeypadTeamAfterPick } from './scoreKeypadSlide';

describe('scoreKeypadSlide', () => {
  it('slides forward when switching team A to team B', () => {
    expect(resolveKeypadSlideDirection('teamA', 'teamB')).toBe(1);
  });

  it('slides backward when switching team B to team A', () => {
    expect(resolveKeypadSlideDirection('teamB', 'teamA')).toBe(-1);
  });

  it('does not slide when team is unchanged', () => {
    expect(resolveKeypadSlideDirection('teamA', 'teamA')).toBe(0);
  });
});

describe('resolveKeypadTeamAfterPick', () => {
  it('advances from team B to team A on first pick', () => {
    expect(
      resolveKeypadTeamAfterPick({ pickedTeam: 'teamB', firstPickDone: false, isPaired: false }),
    ).toBe('teamA');
  });

  it('advances from team A to team B on first pick', () => {
    expect(
      resolveKeypadTeamAfterPick({ pickedTeam: 'teamA', firstPickDone: false, isPaired: false }),
    ).toBe('teamB');
  });

  it('closes after second pick', () => {
    expect(
      resolveKeypadTeamAfterPick({ pickedTeam: 'teamA', firstPickDone: true, isPaired: false }),
    ).toBeNull();
  });

  it('closes immediately in paired mode', () => {
    expect(
      resolveKeypadTeamAfterPick({ pickedTeam: 'teamB', firstPickDone: false, isPaired: true }),
    ).toBeNull();
  });
});
