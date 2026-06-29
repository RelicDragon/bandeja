import { describe, expect, it } from 'vitest';
import { areWeatherPreviewCardPropsEqual } from './weatherPreviewCardMemo';

describe('areWeatherPreviewCardPropsEqual', () => {
  const props = {
    cityId: 'city-1',
    startTime: '2026-07-01T18:00:00.000Z',
    endTime: '2026-07-01T19:30:00.000Z',
    locale: 'en-US',
    hour12: true,
  };

  it('treats unchanged weather inputs as equal so parent churn does not repaint the card', () => {
    expect(areWeatherPreviewCardPropsEqual(props, { ...props })).toBe(true);
  });

  it('normalizes omitted enabled to the default enabled state', () => {
    expect(areWeatherPreviewCardPropsEqual(props, { ...props, enabled: true })).toBe(true);
  });

  it('detects schedule changes that should refresh the weather query', () => {
    expect(
      areWeatherPreviewCardPropsEqual(props, {
        ...props,
        startTime: '2026-07-01T19:00:00.000Z',
      }),
    ).toBe(false);
  });
});
