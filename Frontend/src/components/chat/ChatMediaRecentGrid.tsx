import type { GiphySearchItem } from '@/api/giphy';
import type { ChatMediaRecent, StickerDto } from '@/api/stickers';
import { Clock3 } from 'lucide-react';
import { ChatStickerCell } from '@/components/chat/ChatStickerGrid';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

type ChatMediaRecentGridProps = {
  items: ChatMediaRecent[];
  stickers: StickerDto[];
  query: string;
  busy?: boolean;
  emptyLabel: string;
  onSelectSticker: (sticker: StickerDto) => void;
  onSelectGif: (gif: GiphySearchItem) => void;
  favoriteIds: Set<string>;
  onToggleFavorite: (sticker: StickerDto) => void;
};

type HydratedRecent =
  | Extract<ChatMediaRecent, { kind: 'GIF' }>
  | { kind: 'STICKER'; sticker: StickerDto };

export function ChatMediaRecentGrid({
  items,
  stickers,
  query,
  busy = false,
  emptyLabel,
  onSelectSticker,
  onSelectGif,
  favoriteIds,
  onToggleFavorite,
}: ChatMediaRecentGridProps) {
  const reduceMotion = usePrefersReducedMotion();
  const stickerById = new Map(stickers.map((sticker) => [sticker.id, sticker]));
  const needle = query.trim().toLocaleLowerCase();
  const visible: HydratedRecent[] = [];
  for (const item of items) {
    if (item.kind === 'GIF') {
      if (!needle || item.title.toLocaleLowerCase().includes(needle)) visible.push(item);
      continue;
    }
    const sticker = stickerById.get(item.stickerId);
    if (!sticker) continue;
    const matches =
      !needle ||
      sticker.emoji.includes(needle) ||
      sticker.title?.toLocaleLowerCase().includes(needle);
    if (matches) visible.push({ kind: 'STICKER', sticker });
  }

  if (visible.length === 0) {
    return (
      <div className="flex min-h-[16rem] flex-col items-center justify-center gap-3 px-6 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500">
          <Clock3 size={24} aria-hidden />
        </span>
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-1.5 p-2" data-testid="chat-media-recent-grid">
      {visible.map((item) => {
        if (item.kind === 'GIF') {
          return (
            <button
              key={`gif:${item.id}`}
              type="button"
              disabled={busy}
              onClick={() => onSelectGif(item)}
              className="group relative aspect-square overflow-hidden rounded-2xl bg-gray-100 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 active:scale-[0.98] disabled:opacity-50 dark:bg-gray-800"
              title={item.title}
            >
              <img
                src={item.previewUrl}
                alt={item.title}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105 group-active:scale-95"
                draggable={false}
              />
              <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white">
                GIF
              </span>
            </button>
          );
        }

        return (
          <ChatStickerCell
            key={`sticker:${item.sticker.id}`}
            sticker={item.sticker}
            favorite={favoriteIds.has(item.sticker.id)}
            reduceMotion={reduceMotion}
            busy={busy}
            onSelect={onSelectSticker}
            onToggleFavorite={onToggleFavorite}
          />
        );
      })}
    </div>
  );
}
