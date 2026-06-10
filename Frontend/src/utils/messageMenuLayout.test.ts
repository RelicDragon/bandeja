import { describe, expect, it } from 'vitest';
import { computeMessageMenuTop } from './messageMenuUtils';

describe('computeMessageMenuTop', () => {
  it('centers the menu vertically when there is room', () => {
    expect(computeMessageMenuTop(800, 200)).toBe(300);
  });

  it('clamps to top padding when the menu is taller than the viewport', () => {
    expect(computeMessageMenuTop(400, 500)).toBe(20);
  });

  it('keeps centered position when the menu fits with margin', () => {
    expect(computeMessageMenuTop(500, 200)).toBe(150);
  });
});
