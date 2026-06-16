import { describe, expect, it } from 'vitest';
import { Sports } from '@shared/sport';
import { showGameFormatTemplatePicker } from './showGameFormatTemplatePicker';

describe('showGameFormatTemplatePicker', () => {
  it('always shows padel templates', () => {
    expect(showGameFormatTemplatePicker('GAME', Sports.PADEL)).toBe(true);
  });

  it('shows badminton templates when sport is creatable', () => {
    expect(showGameFormatTemplatePicker('GAME', Sports.BADMINTON)).toBe(true);
  });
});
