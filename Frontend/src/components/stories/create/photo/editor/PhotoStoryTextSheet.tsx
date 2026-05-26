import { useTranslation } from 'react-i18next';
import type { TextNode, TextStylePresetId } from '../types';

const PRESETS: TextStylePresetId[] = ['classic', 'blackBox', 'gradient', 'outline', 'neon'];

type PhotoStoryTextSheetProps = {
  node: TextNode;
  onStyleChange: (patch: Partial<TextNode['style']>) => void;
};

export function PhotoStoryTextSheet({ node, onStyleChange }: PhotoStoryTextSheetProps) {
  const { t } = useTranslation();

  return (
    <div
      className="flex gap-2 overflow-x-auto px-4 py-3 scrollbar-hide"
      onMouseDown={(e) => e.preventDefault()}
    >
      {PRESETS.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onStyleChange({ id })}
          className={`shrink-0 rounded-xl px-3 py-2 text-xs font-semibold ${
            node.style.id === id ? 'bg-sky-500 text-white' : 'bg-white/10 text-white/75'
          }`}
        >
          {t(`stories.textStyles.${id}`)}
        </button>
      ))}
    </div>
  );
}
