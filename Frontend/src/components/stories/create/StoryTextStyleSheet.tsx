import { useTranslation } from 'react-i18next';
import { AlignCenter, AlignLeft, AlignRight } from 'lucide-react';
import type { TextAlignment, TextStylePresetId, TextStoryLayer } from './types/storyEditor.types';
import { TEXT_STYLE_PRESET_IDS, getTextStyleRender } from './utils/storyTextStyles';

type StoryTextStyleSheetProps = {
  layer: TextStoryLayer;
  onStyleChange: (patch: Partial<TextStoryLayer['style']>) => void;
};

const PREVIEW_SAMPLES: Record<TextStylePresetId, string> = {
  classic: 'Aa',
  blackBox: 'Aa',
  gradient: 'Aa',
  outline: 'Aa',
  neon: 'Aa',
};

export function StoryTextStyleSheet({ layer, onStyleChange }: StoryTextStyleSheetProps) {
  const { t } = useTranslation();
  const alignments: TextAlignment[] = ['left', 'center', 'right'];

  return (
    <div className="border-t border-white/10 bg-black/80 backdrop-blur-md px-3 py-3">
      <div className="flex gap-2 overflow-x-auto scrollbar-hide mb-3">
        {TEXT_STYLE_PRESET_IDS.map((presetId) => {
          const preview = getTextStyleRender(presetId, 'center');
          const active = layer.style.id === presetId;
          return (
            <button
              key={presetId}
              type="button"
              onClick={() => onStyleChange({ id: presetId })}
              className={`shrink-0 min-w-[72px] rounded-xl px-3 py-2 transition ${
                active ? 'ring-2 ring-primary-400 bg-white/10' : 'bg-white/5 hover:bg-white/10'
              }`}
            >
              <span
                className={`block text-lg leading-none ${preview.className}`}
                style={preview.style}
              >
                {PREVIEW_SAMPLES[presetId]}
              </span>
              <span className="mt-1 block text-[10px] text-white/70">
                {t(`stories.textStyles.${presetId}`)}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-center gap-2">
        <span className="text-xs text-white/60 mr-1">{t('stories.alignment')}</span>
        {alignments.map((align) => {
          const Icon = align === 'left' ? AlignLeft : align === 'right' ? AlignRight : AlignCenter;
          const active = layer.style.align === align;
          return (
            <button
              key={align}
              type="button"
              aria-label={t(`stories.align.${align}`)}
              onClick={() => onStyleChange({ align })}
              className={`h-9 w-9 rounded-full flex items-center justify-center ${
                active ? 'bg-primary-500 text-white' : 'bg-white/10 text-white/80'
              }`}
            >
              <Icon size={16} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
