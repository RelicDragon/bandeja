import { useLayoutEffect, useMemo, useRef } from 'react';
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';
import { init } from 'emoji-mart';
import { STORY_STICKER_CATEGORIES } from './storySticker.constants';

void init({ data });

const SHADOW_STYLE_ID = 'padelpulse-story-sticker-picker';

function injectPickerShadowStyles(host: HTMLElement) {
  const sr = host.shadowRoot;
  if (!sr) return;
  sr.getElementById(SHADOW_STYLE_ID)?.remove();
  const style = document.createElement('style');
  style.id = SHADOW_STYLE_ID;
  style.textContent = `
:host { height: 100% !important; max-height: 100% !important; min-height: 0 !important; }
#root { height: 100% !important; min-height: 0 !important; overflow: hidden !important; }
.scroll.flex-grow { min-height: 0 !important; }
#root[data-theme="dark"] {
  --rgb-background: 3 7 18;
  --rgb-input: 17 24 39;
  --rgb-color: 243 244 246;
  --rgb-accent: 56 189 248;
  --color-border: rgba(55, 65, 81, 0.85);
  --color-border-over: rgba(75, 85, 99, 1);
}
`;
  sr.appendChild(style);
}

const SUPPORTED_LOCALES = new Set(['en', 'es', 'cs', 'ru', 'sr']);

type Props = {
  onSelect: (emoji: string) => void;
  i18nLang: string;
  theme: 'light' | 'dark';
};

export default function StoryStickerPickerInner({ onSelect, i18nLang, theme }: Props) {
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
        injectPickerShadowStyles(host);
        return;
      }
      if (tries++ < 60) raf = requestAnimationFrame(run);
    };
    raf = requestAnimationFrame(run);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      hostForCleanup?.shadowRoot?.getElementById(SHADOW_STYLE_ID)?.remove();
    };
  }, [locale, theme]);

  return (
    <div
      ref={pickerBoxRef}
      className="box-border flex h-[min(40vh,320px)] w-full min-w-0 shrink-0 flex-col [&>div]:flex [&>div]:h-full [&>div]:min-h-0 [&>div]:w-full [&_em-emoji-picker]:block [&_em-emoji-picker]:h-full [&_em-emoji-picker]:min-h-0 [&_em-emoji-picker]:w-full [&_em-emoji-picker]:border-0 [&_em-emoji-picker]:shadow-none"
    >
      <Picker
        data={data}
        theme={theme}
        locale={locale}
        dynamicWidth
        categories={[...STORY_STICKER_CATEGORIES]}
        maxFrequentRows={0}
        previewPosition="none"
        skinTonePosition="search"
        searchPosition="top"
        onEmojiSelect={(d: { native?: string } | unknown) => {
          const raw =
            d && typeof d === 'object' && 'native' in d && typeof (d as { native: unknown }).native === 'string'
              ? (d as { native: string }).native
              : null;
          if (raw) onSelect(raw);
        }}
      />
    </div>
  );
}
