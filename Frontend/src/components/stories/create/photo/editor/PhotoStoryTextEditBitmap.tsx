import { useMemo } from 'react';
import { PHOTO_TEXT_FONT_PX } from '../constants';
import type { TextNode } from '../types';
import { renderTextNodeBitmap } from '../utils/renderTextNodeBitmap';

type PhotoStoryTextEditBitmapProps = {
  text: string;
  style: TextNode['style'];
  displayFontSizePx: number;
};

/** Canvas bitmap preview — same renderer as export while user types in transparent contentEditable. */
export function PhotoStoryTextEditBitmap({
  text,
  style,
  displayFontSizePx,
}: PhotoStoryTextEditBitmapProps) {
  const bitmap = useMemo(() => renderTextNodeBitmap(text, style), [text, style]);
  const scale = displayFontSizePx / PHOTO_TEXT_FONT_PX;

  return (
    <img
      src={bitmap.image.toDataURL()}
      alt=""
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-1/2 max-w-none -translate-x-1/2 -translate-y-1/2"
      style={{
        width: bitmap.width * scale,
        height: bitmap.height * scale,
      }}
    />
  );
}
