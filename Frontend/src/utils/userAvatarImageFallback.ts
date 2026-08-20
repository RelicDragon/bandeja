export type AvatarImageFallbackState = {
  tinyFailed: boolean;
  fullFailed: boolean;
};

export const INITIAL_AVATAR_IMAGE_FALLBACK_STATE: AvatarImageFallbackState = {
  tinyFailed: false,
  fullFailed: false,
};

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
  tinyUrl: string | null
): AvatarImageFallbackState {
  if (tinyUrl && !state.tinyFailed) {
    return { ...state, tinyFailed: true };
  }
  return { ...state, fullFailed: true };
}
