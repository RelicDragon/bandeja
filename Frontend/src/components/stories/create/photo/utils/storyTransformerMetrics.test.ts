import { describe, expect, it } from 'vitest';
import { screenFixedTransformerMetrics } from './storyTransformerMetrics';

describe('screenFixedTransformerMetrics', () => {
  it('shrinks anchors when node scale grows so screen size stays constant', () => {
    const stageScale = 0.33;
    const at1 = screenFixedTransformerMetrics(stageScale, 1);
    const at3 = screenFixedTransformerMetrics(stageScale, 3);
    expect(at3.anchorSize).toBeCloseTo(at1.anchorSize / 3);
    expect(at3.anchorSize * 3 * stageScale).toBeCloseTo(at1.anchorSize * stageScale);
  });
});
