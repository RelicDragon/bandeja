import { lazy, Suspense, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { PADEL_QUICK_STICKERS } from '../constants';
import { lightHaptic } from '@/utils/lightHaptic';

const EmojiPicker = lazy(() => import('./PhotoStoryEmojiPicker'));

type PhotoStoryStickerSheetProps = {
  onPick: (emoji: string) => void;
  embedded?: boolean;
};

export function PhotoStoryStickerSheet({ onPick, embedded }: PhotoStoryStickerSheetProps) {
  const { t, i18n } = useTranslation();
  const lang = useMemo(() => (i18n.language || 'en').split('-')[0] ?? 'en', [i18n.language]);

  return (
    <div
      className={
        embedded
          ? 'flex max-h-[48dvh] w-full min-w-0 flex-1 flex-col overflow-hidden'
          : 'mx-3 mb-2 max-h-[38dvh] flex flex-col rounded-2xl border border-white/10 bg-zinc-900/95 overflow-hidden'
      }
    >
      <div className="flex w-full min-w-0 gap-2 overflow-x-auto px-3 py-2 scrollbar-hide border-b border-white/10">
        {PADEL_QUICK_STICKERS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className="text-2xl shrink-0 p-1"
            onClick={() => {
              lightHaptic();
              onPick(emoji);
            }}
          >
            {emoji}
          </button>
        ))}
      </div>
      <Suspense
        fallback={<p className="p-4 text-center text-xs text-white/50">{t('common.loading')}</p>}
      >
        <div className="flex min-h-[200px] w-full min-w-0 flex-1 flex-col">
          <EmojiPicker lang={lang} onSelect={onPick} />
        </div>
      </Suspense>
    </div>
  );
}
