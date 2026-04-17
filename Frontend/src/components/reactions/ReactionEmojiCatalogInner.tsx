import { useLayoutEffect, useMemo, useRef } from 'react';
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';
import { init } from 'emoji-mart';
import { normalizeReactionEmoji } from '@/utils/validateReactionEmoji';

void init({ data });

const EMOJI_MART_SHADOW_CATALOG_STYLE_ID = 'padelpulse-em-catalog';

function injectEmojiMartCatalogShadowStyles(host: HTMLElement) {
  const sr = host.shadowRoot;
  if (!sr) return;
  sr.getElementById(EMOJI_MART_SHADOW_CATALOG_STYLE_ID)?.remove();
  const style = document.createElement('style');
  style.id = EMOJI_MART_SHADOW_CATALOG_STYLE_ID;
  style.textContent = `
:host { height: 100% !important; max-height: 100% !important; min-height: 0 !important; }
#root { height: 100% !important; min-height: 0 !important; overflow: hidden !important; }
.scroll.flex-grow { min-height: 0 !important; }
#root[data-theme="light"] {
  --rgb-background: 255 255 255;
  --rgb-input: 249 250 251;
  --rgb-color: 17 24 39;
  --rgb-accent: 14 165 233;
  --color-border: rgba(229, 231, 235, 0.9);
  --color-border-over: rgba(209, 213, 219, 1);
}
#root[data-theme="dark"] {
  --rgb-background: 17 24 39;
  --rgb-input: 31 41 55;
  --rgb-color: 243 244 246;
  --rgb-accent: 56 189 248;
  --color-border: rgba(55, 65, 81, 0.85);
  --color-border-over: rgba(75, 85, 99, 1);
}
`;
  sr.appendChild(style);
}

const SUPPORTED_LOCALES = new Set(['en', 'es', 'cs', 'ru', 'sr']);

/** No `frequent` — recents come only from `EmojiQuickStrip` (usage store), not emoji-mart localStorage. */
const CATALOG_CATEGORIES = ['people', 'nature', 'foods', 'activity', 'places', 'objects', 'symbols', 'flags'] as const;

type Props = {
  onSelect: (emoji: string) => void;
  i18nLang: string;
  theme: 'light' | 'dark' | 'auto';
};

export default function ReactionEmojiCatalogInner({ onSelect, i18nLang, theme }: Props) {
  const pickerBoxRef = useRef<HTMLDivElement>(null);

  const locale = useMemo(() => {
    const base = (i18nLang || 'en').split('-')[0]?.toLowerCase() ?? 'en';
    return SUPPORTED_LOCALES.has(base) ? base : 'en';
  }, [i18nLang]);

  useLayoutEffect(() => {
    let cancelled = false;
    let raf = 0;
    let tries = 0;
    let hostForCleanup: HTMLElement | null = null;
    const run = () => {
      if (cancelled) return;
      const host = pickerBoxRef.current?.querySelector('em-emoji-picker');
      if (host instanceof HTMLElement && host.shadowRoot) {
        hostForCleanup = host;
        injectEmojiMartCatalogShadowStyles(host);
        return;
      }
      if (tries++ < 60) raf = requestAnimationFrame(run);
    };
    raf = requestAnimationFrame(run);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      hostForCleanup?.shadowRoot?.getElementById(EMOJI_MART_SHADOW_CATALOG_STYLE_ID)?.remove();
    };
  }, [locale, theme]);

  return (
    <div
      data-reaction-catalog-root
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
    >
      <div
        ref={pickerBoxRef}
        className="box-border flex h-[min(55vh,420px)] w-full min-w-0 shrink-0 flex-col [&>div]:flex [&>div]:h-full [&>div]:min-h-0 [&>div]:w-full [&>div]:min-w-0 [&>div]:flex-col [&_em-emoji-picker]:block [&_em-emoji-picker]:h-full [&_em-emoji-picker]:min-h-0 [&_em-emoji-picker]:w-full [&_em-emoji-picker]:min-w-0 [&_em-emoji-picker]:max-w-full [&_em-emoji-picker]:border-0 [&_em-emoji-picker]:shadow-none"
      >
        <Picker
          data={data}
          theme={theme}
          locale={locale}
          dynamicWidth
          categories={[...CATALOG_CATEGORIES]}
          maxFrequentRows={0}
          previewPosition="none"
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
      </div>
    </div>
  );
}
