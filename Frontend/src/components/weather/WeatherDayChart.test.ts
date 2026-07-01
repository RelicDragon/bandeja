import { describe, expect, it } from 'vitest';
import { getWeatherDayChartRainBarGeometry } from './weatherDayChartGeometry';

describe('getWeatherDayChartRainBarGeometry', () => {
  it('keeps the first precipitation bar centered on the first chart point', () => {
    const bar = getWeatherDayChartRainBarGeometry(0, 8);

    expect(bar.x + bar.width / 2).toBe(0);
    expect(bar.x).toBeLessThan(0);
  });

  it('uses the same centered geometry for interior precipitation bars', () => {
    const bar = getWeatherDayChartRainBarGeometry(50, 8);

    expect(bar.x + bar.width / 2).toBe(50);
  });
});
