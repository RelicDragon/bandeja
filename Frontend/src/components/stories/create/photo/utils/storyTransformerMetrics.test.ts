import { describe, expect, it } from 'vitest';
import { screenFixedTransformerMetrics } from './storyTransformerMetrics';

describe('screenFixedTransformerMetrics', () => {
  it('scales inversely with stage visual scale only (not layer scale)', () => {
    const smallStage = screenFixedTransformerMetrics(0.25);
    const largeStage = screenFixedTransformerMetrics(0.5);
    expect(largeStage.anchorSize).toBeCloseTo(smallStage.anchorSize / 2);
    expect(largeStage.anchorSize * 0.5).toBeCloseTo(smallStage.anchorSize * 0.25);
  });
});
