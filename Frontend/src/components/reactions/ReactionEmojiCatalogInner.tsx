import { useEffect, useMemo, useState } from 'react';
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';
import { getEmojiDataFromNative, init } from 'emoji-mart';
import { normalizeReactionEmoji } from '@/utils/validateReactionEmoji';

const emojiMartDataReady = init({ data });

const SUPPORTED_LOCALES = new Set(['en', 'es', 'cs', 'ru', 'sr']);

/** No `frequent` — recents come only from `EmojiQuickStrip` (usage store), not emoji-mart localStorage. */
const CATALOG_CATEGORIES = ['people', 'nature', 'foods', 'activity', 'places', 'objects', 'symbols', 'flags'] as const;

type Props = {
  onSelect: (emoji: string) => void;
  i18nLang: string;
  theme: 'light' | 'dark' | 'auto';
  previewNative?: string | null;
};

export default function ReactionEmojiCatalogInner({ onSelect, i18nLang, theme, previewNative }: Props) {
  const trimmedPreview = previewNative?.trim() ?? '';
  const needsPreviewLookup = Boolean(trimmedPreview);
  const [previewEmojiId, setPreviewEmojiId] = useState<string | undefined>();
  const [previewLookupDone, setPreviewLookupDone] = useState(!needsPreviewLookup);

  useEffect(() => {
    if (!trimmedPreview) {
      setPreviewEmojiId(undefined);
      setPreviewLookupDone(true);
      return;
    }
    let cancelled = false;
    setPreviewLookupDone(false);
    void (async () => {
      await emojiMartDataReady;
      if (cancelled) return;
      const row = await getEmojiDataFromNative(trimmedPreview);
      if (cancelled) return;
      setPreviewEmojiId(typeof row?.id === 'string' ? row.id : undefined);
      setPreviewLookupDone(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [trimmedPreview]);

  const locale = useMemo(() => {
    const base = (i18nLang || 'en').split('-')[0]?.toLowerCase() ?? 'en';
    return SUPPORTED_LOCALES.has(base) ? base : 'en';
  }, [i18nLang]);

  return (
    <div
      data-reaction-catalog-root
      className="min-h-0 flex-1 overflow-hidden [&_.em-emoji-picker]:!h-[min(55vh,420px)] [&_.em-emoji-picker]:!max-h-[min(55vh,420px)] [&_.em-emoji-picker]:!w-full [&_.em-emoji-picker]:!max-w-full [&_.em-emoji-picker]:!border-0 [&_.em-emoji-picker]:!shadow-none"
    >
      {!previewLookupDone ? (
        <div className="flex h-[min(55vh,420px)] items-center justify-center text-sm text-gray-500 dark:text-gray-400">
          …
        </div>
      ) : (
        <Picker
          data={data}
          theme={theme}
          locale={locale}
          categories={[...CATALOG_CATEGORIES]}
          maxFrequentRows={0}
          previewPosition="bottom"
          {...(previewEmojiId ? { previewEmoji: previewEmojiId } : {})}
          skinTonePosition="search"
          searchPosition="top"
          onEmojiSelect={(d: { native?: string } | unknown) => {
            const raw =
              d && typeof d === 'object' && 'native' in d && typeof (d as { native: unknown }).native === 'string'
                ? (d as { native: string }).native
                : null;
            if (raw == null) return;
            onSelect(normalizeReactionEmoji(raw));
          }}
        />
      )}
    </div>
  );
}
