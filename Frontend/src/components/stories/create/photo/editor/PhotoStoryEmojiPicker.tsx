import { useLayoutEffect, useMemo, useRef } from 'react';
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';
import { init } from 'emoji-mart';
import { PHOTO_STICKER_CATEGORIES } from '../constants';

void init({ data });

const SUPPORTED = new Set(['en', 'es', 'cs', 'ru', 'sr']);

type Props = {
  lang: string;
  onSelect: (emoji: string) => void;
};

export default function PhotoStoryEmojiPicker({ lang, onSelect }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const locale = useMemo(() => {
    const base = lang.toLowerCase();
    return SUPPORTED.has(base) ? base : 'en';
  }, [lang]);

  useLayoutEffect(() => {
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const host = boxRef.current?.querySelector('em-emoji-picker') as HTMLElement | null;
      const sr = host?.shadowRoot;
      if (!sr) {
        requestAnimationFrame(tick);
        return;
      }
      sr.getElementById('photo-emoji-picker-style')?.remove();
      const style = document.createElement('style');
      style.id = 'photo-emoji-picker-style';
      style.textContent = `
:host { height: 100% !important; max-height: 100% !important; }
#root { height: 100% !important; min-height: 0 !important; }
`;
      sr.appendChild(style);
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div ref={boxRef} className="h-full min-h-[200px]">
      <Picker
        data={data}
        theme="dark"
        locale={locale}
        categories={PHOTO_STICKER_CATEGORIES as unknown as string[]}
        onEmojiSelect={(e: { native: string }) => onSelect(e.native)}
      />
    </div>
  );
}
