import { describe, expect, it } from 'vitest';
import { resolveLevelSport } from './resolveLevelSport';

describe('resolveLevelSport', () => {
  it('prefers explicit param over URL, context, and viewer default', () => {
    expect(
      resolveLevelSport({
        explicit: 'TENNIS',
        fromUrl: 'PADEL',
        fromContext: 'SQUASH',
        viewerDefault: 'BADMINTON',
      }),
    ).toBe('TENNIS');
  });

  it('falls back to URL sport when explicit is absent', () => {
    expect(
      resolveLevelSport({
        fromUrl: 'PADEL',
        fromContext: 'SQUASH',
        viewerDefault: 'BADMINTON',
      }),
    ).toBe('PADEL');
  });

  it('falls back to context then viewer default', () => {
    expect(resolveLevelSport({ fromContext: 'SQUASH', viewerDefault: 'BADMINTON' })).toBe('SQUASH');
    expect(resolveLevelSport({ viewerDefault: 'BADMINTON' })).toBe('BADMINTON');
  });

  it('returns undefined when no source is available', () => {
    expect(resolveLevelSport({})).toBeUndefined();
  });
});
