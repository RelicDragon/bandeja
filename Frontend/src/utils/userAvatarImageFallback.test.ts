import { describe, expect, it } from 'vitest';
import {
  INITIAL_AVATAR_IMAGE_FALLBACK_STATE,
  avatarImageOnError,
  avatarImageSrcToLoad,
} from './userAvatarImageFallback';

const FULL = 'https://cdn.example.com/u_avatar.jpg';
const TINY = 'https://cdn.example.com/u_avatar.tiny.jpg';

describe('avatarImageSrcToLoad', () => {
  it('shows initials when there is no avatar URL', () => {
    expect(
      avatarImageSrcToLoad({
        avatar: null,
        tinyUrl: null,
        state: INITIAL_AVATAR_IMAGE_FALLBACK_STATE,
      })
    ).toBeNull();
    expect(
      avatarImageSrcToLoad({
        avatar: '',
        tinyUrl: TINY,
        state: INITIAL_AVATAR_IMAGE_FALLBACK_STATE,
      })
    ).toBeNull();
  });

  it('loads the full URL when tiny is not used', () => {
    expect(
      avatarImageSrcToLoad({
        avatar: FULL,
        tinyUrl: null,
        state: INITIAL_AVATAR_IMAGE_FALLBACK_STATE,
      })
    ).toBe(FULL);
  });

  it('prefers the tiny URL until it fails', () => {
    expect(
      avatarImageSrcToLoad({
        avatar: FULL,
        tinyUrl: TINY,
        state: INITIAL_AVATAR_IMAGE_FALLBACK_STATE,
      })
    ).toBe(TINY);
  });

  it('retries the full URL after the tiny object fails', () => {
    expect(
      avatarImageSrcToLoad({
        avatar: FULL,
        tinyUrl: TINY,
        state: { tinyFailed: true, fullFailed: false },
      })
    ).toBe(FULL);
  });

  it('returns null after the full URL fails so initials render', () => {
    expect(
      avatarImageSrcToLoad({
        avatar: FULL,
        tinyUrl: TINY,
        state: { tinyFailed: true, fullFailed: true },
      })
    ).toBeNull();
    expect(
      avatarImageSrcToLoad({
        avatar: FULL,
        tinyUrl: null,
        state: { tinyFailed: false, fullFailed: true },
      })
    ).toBeNull();
  });
});

describe('avatarImageOnError', () => {
  it('falls back tiny → full → initials', () => {
    const afterTiny = avatarImageOnError(INITIAL_AVATAR_IMAGE_FALLBACK_STATE, TINY);
    expect(afterTiny).toEqual({ tinyFailed: true, fullFailed: false });
    expect(avatarImageSrcToLoad({ avatar: FULL, tinyUrl: TINY, state: afterTiny })).toBe(FULL);

    const afterFull = avatarImageOnError(afterTiny, TINY);
    expect(afterFull).toEqual({ tinyFailed: true, fullFailed: true });
    expect(avatarImageSrcToLoad({ avatar: FULL, tinyUrl: TINY, state: afterFull })).toBeNull();
  });

  it('goes straight to initials when there is no tiny URL', () => {
    const afterFull = avatarImageOnError(INITIAL_AVATAR_IMAGE_FALLBACK_STATE, null);
    expect(afterFull).toEqual({ tinyFailed: false, fullFailed: true });
    expect(avatarImageSrcToLoad({ avatar: FULL, tinyUrl: null, state: afterFull })).toBeNull();
  });
});
