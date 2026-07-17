import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StickerDto } from '@/api/stickers';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { lightHaptic } from '@/utils/lightHaptic';
import {
  nextStickerUrlAfterImgError,
  resolveStickerDisplayUrl,
  resolveStickerMotionMode,
} from '@/utils/resolveStickerDisplayUrl';

type ChatStickerGridProps = {
  stickers: StickerDto[];
  favoriteIds: Set<string>;
  onSelect: (sticker: StickerDto) => void;
  onToggleFavorite?: (sticker: StickerDto) => void;
  emptyLabel: string;
  busy?: boolean;
};

const LONG_PRESS_MS = 450;

export function StickerCellImage({
  sticker,
  reduceMotion,
}: {
  sticker: StickerDto;
  reduceMotion: boolean;
}) {
  const preferred = resolveStickerDisplayUrl({
    staticUrl: sticker.staticUrl,
    animatedUrl: sticker.animatedUrl,
    reduceMotion,
  });
  const [url, setUrl] = useState(preferred);

  useEffect(() => {
    setUrl(preferred);
  }, [preferred]);

  if (!url) {
    return (
      <span className="text-3xl leading-none select-none" aria-hidden>
        {sticker.emoji}
      </span>
    );
  }

  return (
    <img
      src={url}
      alt=""
      className="max-h-full max-w-full object-contain bg-transparent select-none pointer-events-none"
      draggable={false}
      loading="lazy"
      decoding="async"
      onError={() => {
        const next = nextStickerUrlAfterImgError({
          failedUrl: url,
          staticUrl: sticker.staticUrl,
          animatedUrl: sticker.animatedUrl,
        });
        setUrl(next);
      }}
    />
  );
}

type ChatStickerCellProps = {
  sticker: StickerDto;
  favorite: boolean;
  reduceMotion: boolean;
  busy: boolean;
  onSelect: (sticker: StickerDto) => void;
  onToggleFavorite?: (sticker: StickerDto) => void;
};

export function ChatStickerCell({
  sticker,
  favorite,
  reduceMotion,
  busy,
  onSelect,
  onToggleFavorite,
}: ChatStickerCellProps) {
  const { t } = useTranslation();
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const clearLongPress = () => {
    if (!longPressTimer.current) return;
    clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  };
  const motionMode = resolveStickerMotionMode({
    staticUrl: sticker.staticUrl,
    animatedUrl: sticker.animatedUrl,
    reduceMotion,
  });

  return (
    <div
      className="relative flex aspect-square items-center justify-center"
      data-sticker-id={sticker.id}
      data-sticker-motion={motionMode}
      data-testid="chat-sticker-cell"
    >
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          if (longPressFired.current) {
            longPressFired.current = false;
            return;
          }
          onSelect(sticker);
        }}
        onContextMenu={(event) => {
          if (!onToggleFavorite) return;
          event.preventDefault();
          lightHaptic();
          onToggleFavorite(sticker);
        }}
        onPointerDown={() => {
          if (!onToggleFavorite) return;
          longPressFired.current = false;
          clearLongPress();
          longPressTimer.current = setTimeout(() => {
            longPressFired.current = true;
            lightHaptic();
            onToggleFavorite(sticker);
          }, LONG_PRESS_MS);
        }}
        onPointerUp={clearLongPress}
        onPointerCancel={clearLongPress}
        onPointerLeave={clearLongPress}
        className="flex h-full w-full items-center justify-center rounded-xl bg-transparent p-1 transition-transform hover:bg-black/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 active:scale-95 disabled:opacity-50 dark:hover:bg-white/[0.06]"
        title={sticker.title || sticker.emoji}
        aria-label={sticker.title || sticker.emoji}
      >
        <StickerCellImage sticker={sticker} reduceMotion={reduceMotion} />
      </button>
      {onToggleFavorite ? (
        <button
          type="button"
          disabled={busy}
          onClick={(event) => {
            event.stopPropagation();
            lightHaptic();
            onToggleFavorite(sticker);
          }}
          className={`absolute right-0.5 top-0.5 flex h-6 w-6 items-center justify-center rounded-full text-[11px] leading-none shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
            favorite
              ? 'bg-amber-400 text-amber-950'
              : 'bg-white/90 text-gray-400 dark:bg-gray-800/90 dark:text-gray-500'
          }`}
          aria-label={
            favorite
              ? t('chat.stickers.unfavorite', { defaultValue: 'Remove from favorites' })
              : t('chat.stickers.favorite', { defaultValue: 'Add to favorites' })
          }
          aria-pressed={favorite}
          data-testid="chat-sticker-favorite-toggle"
        >
          ★
        </button>
      ) : favorite ? (
        <span className="absolute right-1 top-1 text-[10px] leading-none" aria-hidden>
          ★
        </span>
      ) : null}
    </div>
  );
}

export function ChatStickerGrid({
  stickers,
  favoriteIds,
  onSelect,
  onToggleFavorite,
  emptyLabel,
  busy = false,
}: ChatStickerGridProps) {
  const reduceMotion = usePrefersReducedMotion();

  if (stickers.length === 0) {
    return (
      <div className="flex min-h-[8rem] items-center justify-center px-4 text-center text-sm text-gray-500 dark:text-gray-400">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div
      className="grid grid-cols-4 gap-2 p-3 sm:grid-cols-5"
      data-testid="chat-sticker-grid"
      aria-busy={busy}
    >
      {stickers.map((sticker) => (
        <ChatStickerCell
          key={sticker.id}
          sticker={sticker}
          favorite={favoriteIds.has(sticker.id)}
          reduceMotion={reduceMotion}
          busy={busy}
          onSelect={onSelect}
          onToggleFavorite={onToggleFavorite}
        />
      ))}
    </div>
  );
}
