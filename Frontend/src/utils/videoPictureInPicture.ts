/** WebKit presentation mode (iOS Safari / WKWebView). */
type WebkitPresentationMode = 'inline' | 'fullscreen' | 'picture-in-picture';

type VideoWithWebkitPiP = HTMLVideoElement & {
  webkitSupportsPresentationMode?: (mode: WebkitPresentationMode) => boolean;
  webkitSetPresentationMode?: (mode: WebkitPresentationMode) => void;
  webkitPresentationMode?: WebkitPresentationMode;
};

export function supportsStandardVideoPictureInPicture(): boolean {
  return typeof document !== 'undefined' && Boolean(document.pictureInPictureEnabled);
}

export function supportsWebkitVideoPictureInPicture(video: HTMLVideoElement): boolean {
  const v = video as VideoWithWebkitPiP;
  return (
    typeof v.webkitSetPresentationMode === 'function' &&
    typeof v.webkitSupportsPresentationMode === 'function' &&
    v.webkitSupportsPresentationMode('picture-in-picture')
  );
}

export function isVideoPictureInPictureSupported(video?: HTMLVideoElement | null): boolean {
  if (supportsStandardVideoPictureInPicture()) return true;
  if (video) return supportsWebkitVideoPictureInPicture(video);
  return false;
}

export function isVideoPictureInPictureActive(video: HTMLVideoElement): boolean {
  if (document.pictureInPictureElement === video) return true;
  const v = video as VideoWithWebkitPiP;
  return v.webkitPresentationMode === 'picture-in-picture';
}

export async function toggleVideoPictureInPicture(video: HTMLVideoElement): Promise<void> {
  if (supportsStandardVideoPictureInPicture()) {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    } else {
      await video.requestPictureInPicture();
    }
    return;
  }

  const v = video as VideoWithWebkitPiP;
  if (!supportsWebkitVideoPictureInPicture(video)) {
    throw new Error('picture_in_picture_not_supported');
  }

  const next: WebkitPresentationMode =
    v.webkitPresentationMode === 'picture-in-picture' ? 'inline' : 'picture-in-picture';
  v.webkitSetPresentationMode!(next);
}

export function subscribeVideoPictureInPicture(
  video: HTMLVideoElement,
  onChange: (active: boolean) => void
): () => void {
  const sync = () => onChange(isVideoPictureInPictureActive(video));

  const onEnter = () => onChange(true);
  const onLeave = () => onChange(false);
  const onWebkitMode = () => sync();

  video.addEventListener('enterpictureinpicture', onEnter);
  video.addEventListener('leavepictureinpicture', onLeave);
  video.addEventListener('webkitpresentationmodechanged', onWebkitMode);
  sync();

  return () => {
    video.removeEventListener('enterpictureinpicture', onEnter);
    video.removeEventListener('leavepictureinpicture', onLeave);
    video.removeEventListener('webkitpresentationmodechanged', onWebkitMode);
  };
}
