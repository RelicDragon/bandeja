import type { StickerPackListItem } from '@/api/stickers';

type ChatStickerPackRailProps = {
  packs: StickerPackListItem[];
  selectedPackId: string | null;
  onSelectPack: (packId: string) => void;
};

/** Pack covers stay static — small thumbs must not pull ~250KB anim WebPs. */
export function ChatStickerPackRail({
  packs,
  selectedPackId,
  onSelectPack,
}: ChatStickerPackRailProps) {
  if (packs.length === 0) return null;

  return (
    <div
      className="flex gap-1.5 overflow-x-auto border-t border-gray-100 px-2 py-2 dark:border-gray-800"
      data-testid="chat-sticker-pack-rail"
      role="tablist"
      aria-label="Sticker packs"
    >
      {packs.map((pack) => {
        const selected = pack.id === selectedPackId;
        const cover = pack.coverSticker?.staticUrl?.trim() || null;
        return (
          <button
            key={pack.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onSelectPack(pack.id)}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors ${
              selected
                ? 'border-blue-500 bg-transparent dark:border-blue-400'
                : 'border-transparent bg-transparent hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
            }`}
            title={pack.title}
            aria-label={pack.title}
            data-pack-id={pack.id}
            data-pack-slug={pack.slug}
            data-pack-sport={pack.sport ?? ''}
          >
            {cover ? (
              <img
                src={cover}
                alt=""
                className="h-7 w-7 object-contain pointer-events-none"
                draggable={false}
                decoding="async"
                loading="lazy"
              />
            ) : (
              <span className="text-lg leading-none" aria-hidden>
                📦
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
