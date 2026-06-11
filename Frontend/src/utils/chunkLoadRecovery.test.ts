import { describe, expect, it } from 'vitest';
import { isChunkLoadError } from './chunkLoadRecovery';

describe('isChunkLoadError', () => {
  it('detects dynamic import failures', () => {
    expect(isChunkLoadError(new Error('Failed to fetch dynamically imported module: https://bandeja.me/assets/MainPage.js'))).toBe(true);
    expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true);
  });

  it('ignores unrelated errors', () => {
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
  });
});
