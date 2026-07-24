import { useEffect, useState } from 'react';
import type { ChatMessage } from '@/api/chat';
import { useChatMediaAsset } from '@/hooks/useChatMediaAsset';
import { useStickerAsset } from '@/hooks/useStickerAsset';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { useVisibleRef } from '@/hooks/useVisibleRef';
import {
  nextStickerUrlAfterImgError,
  resolveStickerDisplayUrl,
  resolveStickerMotionMode,
} from '@/utils/resolveStickerDisplayUrl';

type Props = {
  message: Pick<ChatMessage, 'stickerId' | 'stickerEmoji'>;
  /** Optional catalog URLs when caller already resolved them (tray / optimistic). */
  staticUrl?: string | null;
  animatedUrl?: string | null;
  /** Tap (click) opens the fullscreen viewer with Copy/Download. No-op when unset. */
  onStickerClick?: (url: string) => void;
};

function StickerEmojiFallback({ emoji }: { emoji: string }) {
  return (
    <div
      className="flex h-40 w-40 items-center justify-center text-5xl leading-none select-none"
      data-sticker-message="true"
      data-sticker-fallback="emoji"
      aria-label={emoji}
    >
      {emoji}
    </div>
  );
}

/** Transparent STICKER bubble — not MessageMediaGrid / photo gallery. */
export function StickerMessageBubble({
  message,
  staticUrl: staticUrlProp,
  animatedUrl: animatedUrlProp,
  onStickerClick,
}: Props) {
  const emoji = message.stickerEmoji?.trim() || '🔖';
  const reduceMotion = usePrefersReducedMotion();
  const { setNode, visible } = useVisibleRef({ rootMargin: '600px 0px' });
  // Always hydrate by id so incomplete props still resolve.
  const hydrated = useStickerAsset(message.stickerId);

  const staticUrl = staticUrlProp?.trim() || hydrated.staticUrl;
  const animatedUrl = animatedUrlProp?.trim() || hydrated.animatedUrl;
  // Off-screen: static frame only — avoids decoding ~250KB anim WebPs in long threads.
  const preferMotion = !reduceMotion && visible;
  const preferredUrl = resolveStickerDisplayUrl({
    staticUrl,
    animatedUrl,
    reduceMotion: !preferMotion,
  });
  const motionMode = resolveStickerMotionMode({
    staticUrl,
    animatedUrl,
    reduceMotion: !preferMotion,
  });

  const [url, setUrl] = useState<string | null>(preferredUrl);

  useEffect(() => {
    setUrl(preferredUrl);
  }, [preferredUrl]);
  const { asset, recordDimensions } = useChatMediaAsset(url ?? '');

  if (hydrated.loading && !url) {
    return (
      <div
        ref={setNode}
        className="flex h-40 w-40 items-center justify-center"
        data-sticker-message="true"
        data-sticker-loading="true"
        aria-busy="true"
        aria-label={emoji}
      />
    );
  }

  if (!url) {
    return (
      <div ref={setNode}>
        <StickerEmojiFallback emoji={emoji} />
      </div>
    );
  }

  const clickable = !!onStickerClick && !!url;
  const handleClick = () => {
    if (!clickable) return;
    // Prefer the richest available asset for fullscreen (animated > static > current).
    const fullscreenSrc =
      (!reduceMotion && animatedUrl?.trim()) || staticUrl?.trim() || url;
    onStickerClick?.(fullscreenSrc);
  };
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!clickable) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const fullscreenSrc =
        (!reduceMotion && animatedUrl?.trim()) || staticUrl?.trim() || url;
      onStickerClick?.(fullscreenSrc);
    }
  };

  return (
    <button
      type="button"
      ref={setNode}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={emoji}
      className={`flex h-40 w-40 items-center justify-center bg-transparent ${
        clickable ? 'cursor-pointer' : 'cursor-default'
      }`}
      style={{ padding: 0, border: 0, textAlign: 'left' }}
      data-sticker-message="true"
      data-sticker-id={message.stickerId ?? undefined}
      data-sticker-motion={motionMode}
    >
      <img
        src={asset?.displayUrl ?? url}
        width={asset?.dimensions?.width ?? hydrated.sticker?.width}
        height={asset?.dimensions?.height ?? hydrated.sticker?.height}
        alt={emoji}
        className="max-h-40 max-w-[10rem] w-auto h-auto object-contain select-none pointer-events-none"
        draggable={false}
        loading="lazy"
        decoding="async"
        onLoad={(event) => {
          const image = event.currentTarget;
          recordDimensions(image.naturalWidth, image.naturalHeight);
        }}
        onError={() => {
          const next = nextStickerUrlAfterImgError({
            failedUrl: url,
            staticUrl,
            animatedUrl,
          });
          setUrl(next);
        }}
      />
    </button>
  );
}
