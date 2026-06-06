import { describe, expect, it } from 'vitest';
import { Sports } from '@shared/sport';
import { showGameFormatTemplatePicker } from './showGameFormatTemplatePicker';

describe('showGameFormatTemplatePicker', () => {
  it('always shows padel templates', () => {
    expect(showGameFormatTemplatePicker('GAME', Sports.PADEL, [Sports.PADEL])).toBe(true);
  });

  it('shows badminton templates when sport is creatable even with one enabled sport', () => {
    expect(showGameFormatTemplatePicker('GAME', Sports.BADMINTON, [Sports.BADMINTON])).toBe(true);
  });
});
