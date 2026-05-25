import { describe, expect, it } from 'vitest';
import {
  bracketRoundLoadUiOnRoundChange,
  shouldClearBracketPayloadOnRoundChange,
} from './leagueBracketLoad.util';

describe('leagueBracketLoad.util (UX-D4)', () => {
  it('clears payload when round id changes', () => {
    expect(shouldClearBracketPayloadOnRoundChange('r1', 'r2')).toBe(true);
    expect(shouldClearBracketPayloadOnRoundChange('r1', 'r1')).toBe(false);
  });

  it('bracketRoundLoadUiOnRoundChange nulls payload and sets loading on round switch', () => {
    const next = bracketRoundLoadUiOnRoundChange(
      { bracketPayload: { round: { id: 'r1' } }, bracketLoading: false, bracketError: true },
      'r1',
      'r2'
    );
    expect(next).toEqual({
      bracketPayload: null,
      bracketLoading: true,
      bracketError: false,
    });
  });

  it('keeps payload when same round refetches', () => {
    const stale = { round: { id: 'r1' } };
    const next = bracketRoundLoadUiOnRoundChange(
      { bracketPayload: stale, bracketLoading: false, bracketError: false },
      'r1',
      'r1'
    );
    expect(next.bracketPayload).toBe(stale);
    expect(next.bracketLoading).toBe(true);
  });
});
