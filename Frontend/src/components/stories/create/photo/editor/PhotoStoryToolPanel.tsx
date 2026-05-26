import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import type { StoryMediaAdjust, StoryPhotoTool, TextNode } from '../types';
import { PhotoStoryAdjustSheet } from './PhotoStoryAdjustSheet';
import { PhotoStoryStickerSheet } from './PhotoStoryStickerSheet';
import { PhotoStoryTextSheet } from './PhotoStoryTextSheet';

type PhotoStoryToolPanelProps = {
  tool: StoryPhotoTool;
  onClose: () => void;
  adjust: StoryMediaAdjust;
  onAdjustCommit: (a: StoryMediaAdjust) => void;
  selectedText: TextNode | null;
  onTextStyleChange: (patch: Partial<TextNode['style']>) => void;
  onStickerPick: (emoji: string) => void;
  disabled?: boolean;
};

export function PhotoStoryToolPanel({
  tool,
  onClose,
  adjust,
  onAdjustCommit,
  selectedText,
  onTextStyleChange,
  onStickerPick,
  disabled,
}: PhotoStoryToolPanelProps) {
  const { t } = useTranslation();

  if (!tool || tool === 'crop') return null;

  const title =
    tool === 'sticker'
      ? t('stories.editor.toolSticker')
      : t('stories.editor.toolAdjust');

  if (tool === 'text') {
    if (!selectedText) return null;
    return (
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 bg-gradient-to-t from-black/90 via-black/55 to-transparent pt-14 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="pointer-events-auto">
          <PhotoStoryTextSheet node={selectedText} onStyleChange={onTextStyleChange} />
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-x-0 bottom-0 z-40 max-h-[52dvh] rounded-t-3xl bg-zinc-900/98 shadow-[0_-12px_40px_rgba(0,0,0,0.5)] backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <span className="text-sm font-semibold">{title}</span>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10"
          aria-label={t('common.close')}
        >
          <X size={18} />
        </button>
      </div>
      <div className="overflow-y-auto pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {tool === 'sticker' ? <PhotoStoryStickerSheet embedded onPick={onStickerPick} /> : null}
        {tool === 'adjust' ? (
          <PhotoStoryAdjustSheet adjust={adjust} onCommit={onAdjustCommit} disabled={disabled} embedded />
        ) : null}
      </div>
    </div>
  );
}
