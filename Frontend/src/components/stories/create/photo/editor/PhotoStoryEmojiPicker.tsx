import { useLayoutEffect, useMemo, useRef } from 'react';
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';
import { init } from 'emoji-mart';
import { PHOTO_STICKER_CATEGORIES } from '../constants';

void init({ data });

const SHADOW_STYLE_ID = 'photo-emoji-picker-style';
const SUPPORTED = new Set(['en', 'es', 'cs', 'ru', 'sr']);

type Props = {
  lang: string;
  onSelect: (emoji: string) => void;
};

function injectPickerShadowStyles(host: HTMLElement) {
  const sr = host.shadowRoot;
  if (!sr) return;
  sr.getElementById(SHADOW_STYLE_ID)?.remove();
  const style = document.createElement('style');
  style.id = SHADOW_STYLE_ID;
  style.textContent = `
:host { width: 100% !important; max-width: 100% !important; height: 100% !important; max-height: 100% !important; min-height: 0 !important; }
#root { width: 100% !important; height: 100% !important; min-height: 0 !important; overflow: hidden !important; }
.scroll.flex-grow { min-height: 0 !important; }
`;
  sr.appendChild(style);
}

export default function PhotoStoryEmojiPicker({ lang, onSelect }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const locale = useMemo(() => {
    const base = lang.toLowerCase();
    return SUPPORTED.has(base) ? base : 'en';
  }, [lang]);

  useLayoutEffect(() => {
    let cancelled = false;
    let raf = 0;
    let tries = 0;
    let hostForCleanup: HTMLElement | null = null;
    const run = () => {
      if (cancelled) return;
      const host = boxRef.current?.querySelector('em-emoji-picker');
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
  }, [locale]);

  return (
    <div
      ref={boxRef}
      className="box-border flex h-full min-h-0 w-full min-w-0 flex-1 flex-col [&>div]:flex [&>div]:h-full [&>div]:min-h-0 [&>div]:w-full [&>div]:min-w-0 [&_em-emoji-picker]:block [&_em-emoji-picker]:h-full [&_em-emoji-picker]:min-h-0 [&_em-emoji-picker]:w-full [&_em-emoji-picker]:min-w-0 [&_em-emoji-picker]:max-w-full [&_em-emoji-picker]:border-0 [&_em-emoji-picker]:shadow-none"
    >
      <Picker
        data={data}
        theme="dark"
        locale={locale}
        dynamicWidth
        categories={PHOTO_STICKER_CATEGORIES as unknown as string[]}
        maxFrequentRows={0}
        previewPosition="none"
        skinTonePosition="search"
        searchPosition="top"
        onEmojiSelect={(e: { native: string }) => onSelect(e.native)}
      />
    </div>
  );
}
