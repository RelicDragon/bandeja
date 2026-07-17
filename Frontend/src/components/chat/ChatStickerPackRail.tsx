import type { StickerPackListItem } from '@/api/stickers';
import { useTranslation } from 'react-i18next';

type ChatStickerPackRailProps = {
  packs: StickerPackListItem[];
  selectedPackId: string | null;
  onSelectPack: (packId: string) => void;
  panelId: string;
};

/** Pack covers stay static — small thumbs must not pull ~250KB anim WebPs. */
export function ChatStickerPackRail({
  packs,
  selectedPackId,
  onSelectPack,
  panelId,
}: ChatStickerPackRailProps) {
  const { t } = useTranslation();
  if (packs.length === 0) return null;

  return (
    <div
      className="flex gap-1.5 overflow-x-auto border-t border-gray-100 px-2 py-2 dark:border-gray-800"
      data-testid="chat-sticker-pack-rail"
      role="tablist"
      aria-label={t('chat.stickers.packTabs', { defaultValue: 'Sticker packs' })}
    >
      {packs.map((pack, index) => {
        const selected = pack.id === selectedPackId;
        const cover = pack.coverSticker?.staticUrl?.trim() || null;
        return (
          <button
            key={pack.id}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelectPack(pack.id)}
            onKeyDown={(event) => {
              let nextIndex: number | null = null;
              if (event.key === 'ArrowRight') nextIndex = (index + 1) % packs.length;
              if (event.key === 'ArrowLeft') nextIndex = (index - 1 + packs.length) % packs.length;
              if (event.key === 'Home') nextIndex = 0;
              if (event.key === 'End') nextIndex = packs.length - 1;
              if (nextIndex == null) return;
              event.preventDefault();
              const next = packs[nextIndex];
              if (!next) return;
              onSelectPack(next.id);
              const rail = event.currentTarget.parentElement;
              window.requestAnimationFrame(() => {
                rail
                  ?.querySelector<HTMLElement>(`[data-pack-id="${CSS.escape(next.id)}"]`)
                  ?.focus();
              });
            }}
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
