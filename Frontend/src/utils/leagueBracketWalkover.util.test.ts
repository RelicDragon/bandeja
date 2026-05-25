import { describe, expect, it } from 'vitest';
import {
  BRACKET_WALKOVER_WINNER_MIN_TOUCH_PX,
  walkoverRequiresConfirmStep,
} from './leagueBracketWalkover.util';

describe('leagueBracketWalkover.util (UX-D1)', () => {
  it('requires confirm step before awarding walkover', () => {
    expect(walkoverRequiresConfirmStep()).toBe(true);
  });

  it('defines 44px minimum winner touch target', () => {
    expect(BRACKET_WALKOVER_WINNER_MIN_TOUCH_PX).toBeGreaterThanOrEqual(44);
  });
});
