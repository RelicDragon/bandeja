import { useState, type Dispatch, type SetStateAction } from 'react';

export type AvatarImageFallbackState = {
  tinyFailed: boolean;
  fullFailed: boolean;
};

export const INITIAL_AVATAR_IMAGE_FALLBACK_STATE: AvatarImageFallbackState = {
  tinyFailed: false,
  fullFailed: false,
};

export function useAvatarImageFallbackState(
  resetIdentity: string
): [AvatarImageFallbackState, Dispatch<SetStateAction<AvatarImageFallbackState>>] {
  const [identity, setIdentity] = useState(resetIdentity);
  const [state, setState] = useState(INITIAL_AVATAR_IMAGE_FALLBACK_STATE);
  if (identity !== resetIdentity) {
    setIdentity(resetIdentity);
    setState(INITIAL_AVATAR_IMAGE_FALLBACK_STATE);
  }
  return [state, setState];
}

/** URL to load, or `null` to render initials instead of `<img>`. */
export function avatarImageSrcToLoad(opts: {
  avatar: string | null | undefined;
  tinyUrl: string | null;
  state: AvatarImageFallbackState;
}): string | null {
  if (!opts.avatar || opts.state.fullFailed) return null;
  const src = opts.tinyUrl && !opts.state.tinyFailed ? opts.tinyUrl : opts.avatar;
  return src || null;
}

export function avatarImageOnError(
  state: AvatarImageFallbackState,
  tinyUrl: string | null,
  failedSrc: string
): AvatarImageFallbackState {
  if (tinyUrl && failedSrc === tinyUrl) {
    if (state.tinyFailed) return state;
    return { ...state, tinyFailed: true };
  }
  if (state.fullFailed) return state;
  return { ...state, fullFailed: true };
}

export function avatarImageElementIsPainted(
  img: Pick<HTMLImageElement, 'complete' | 'naturalWidth'>
): boolean {
  return img.complete && img.naturalWidth > 0;
}
