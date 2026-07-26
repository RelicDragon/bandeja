import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Crop, SlidersHorizontal, Smile, Type } from 'lucide-react';
import { lightHaptic } from '@/utils/lightHaptic';
import type { StoryPhotoTool } from '../types';

type PhotoStoryToolRailProps = {
  activeTool: StoryPhotoTool;
  onToolChange: (tool: StoryPhotoTool) => void;
  onText: () => void;
  disabled?: boolean;
};

function RailBtn({
  label,
  active,
  onClick,
  disabled,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-12 w-12 items-center justify-center rounded-full backdrop-blur-xl transition active:scale-95 ${
        active
          ? 'bg-white text-neutral-950 shadow-lg shadow-black/30'
          : 'bg-black/40 text-white ring-1 ring-white/20'
      } disabled:opacity-35`}
    >
      {children}
    </button>
  );
}

export function PhotoStoryToolRail({
  activeTool,
  onToolChange,
  onText,
  disabled,
}: PhotoStoryToolRailProps) {
  const { t } = useTranslation();

  const toggle = (tool: Exclude<StoryPhotoTool, null>) => {
    if (disabled) return;
    lightHaptic();
    onToolChange(activeTool === tool ? null : tool);
  };

  return (
    <div
      className="pointer-events-none absolute right-3 top-1/2 z-30 flex -translate-y-1/2 flex-col gap-3"
      style={{ paddingTop: 'max(3.5rem, env(safe-area-inset-top))' }}
    >
      <div className="pointer-events-auto flex flex-col gap-3">
        <RailBtn
          label={t('stories.editor.toolText')}
          active={activeTool === 'text'}
          disabled={disabled}
          onClick={() => {
            if (disabled) return;
            lightHaptic();
            onText();
          }}
        >
          <Type size={20} strokeWidth={2.2} />
        </RailBtn>
        <RailBtn
          label={t('stories.editor.toolSticker')}
          active={activeTool === 'sticker'}
          disabled={disabled}
          onClick={() => toggle('sticker')}
        >
          <Smile size={20} strokeWidth={2.2} />
        </RailBtn>
        <RailBtn
          label={t('stories.editor.toolAdjust')}
          active={activeTool === 'adjust'}
          disabled={disabled}
          onClick={() => toggle('adjust')}
        >
          <SlidersHorizontal size={20} strokeWidth={2.2} />
        </RailBtn>
        <RailBtn
          label={t('stories.editor.toolCrop')}
          active={activeTool === 'crop'}
          disabled={disabled}
          onClick={() => toggle('crop')}
        >
          <Crop size={20} strokeWidth={2.2} />
        </RailBtn>
      </div>
    </div>
  );
}
