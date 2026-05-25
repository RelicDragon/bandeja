import { lazy, Suspense, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { lightHaptic } from '@/utils/lightHaptic';
import { PADEL_QUICK_STICKERS } from './storySticker.constants';

const StoryStickerPickerInner = lazy(() => import('./StoryStickerPickerInner'));

type StoryStickerPickerProps = {
  onPick: (emoji: string) => void;
  theme?: 'light' | 'dark';
  embedded?: boolean;
};

export function StoryStickerPicker({ onPick, theme = 'dark', embedded = false }: StoryStickerPickerProps) {
  const { i18n, t } = useTranslation();

  const i18nLang = useMemo(() => i18n.language || 'en', [i18n.language]);

  const handleQuickPick = (emoji: string) => {
    lightHaptic();
    onPick(emoji);
  };

  return (
    <div
      className={`flex flex-col gap-2 px-3 pt-3 ${embedded ? 'pb-1' : 'rounded-t-2xl bg-gray-950/95 pb-[max(0.75rem,env(safe-area-inset-bottom))]'}`}
    >
      <p className="text-xs font-medium text-white/60 px-1">{t('stories.editor.stickerQuick')}</p>
      <div className="flex flex-wrap gap-2 px-1 pb-1">
        {PADEL_QUICK_STICKERS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => handleQuickPick(emoji)}
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-2xl active:scale-95 transition-transform"
            aria-label={emoji}
          >
            {emoji}
          </button>
        ))}
      </div>
      <Suspense
        fallback={
          <div className="flex h-[min(40vh,320px)] items-center justify-center">
            <Loader2 className="animate-spin text-white/50" size={24} />
          </div>
        }
      >
        <StoryStickerPickerInner
          theme={theme}
          i18nLang={i18nLang}
          onSelect={(emoji) => {
            lightHaptic();
            onPick(emoji);
          }}
        />
      </Suspense>
    </div>
  );
}
