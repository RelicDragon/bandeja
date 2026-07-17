import { describe, expect, it } from 'vitest';
import { shouldPreservePreviewDuringRefresh } from './linkPreviewRefreshPolicy';

describe('shouldPreservePreviewDuringRefresh', () => {
  it('keeps a live card mounted during its periodic refresh', () => {
    expect(
      shouldPreservePreviewDuringRefresh({
        attempt: 1,
        hasCurrentPreview: true,
        refreshingInitialPreview: false,
      })
    ).toBe(true);
  });

  it('shows loading state when retrying without an existing preview', () => {
    expect(
      shouldPreservePreviewDuringRefresh({
        attempt: 1,
        hasCurrentPreview: false,
        refreshingInitialPreview: false,
      })
    ).toBe(false);
  });
});
