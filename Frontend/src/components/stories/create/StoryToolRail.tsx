import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Crop, Loader2, SlidersHorizontal, Smile, Type } from 'lucide-react';
import { lightHaptic } from '@/utils/lightHaptic';
import type { StoryEditorTool } from './types/storyEditor.types';

type StoryToolRailProps = {
  activeTool: StoryEditorTool;
  onActiveToolChange: (tool: StoryEditorTool) => void;
  onTextTool?: () => void;
  onShare?: () => void;
  isPublishing?: boolean;
  controlsDisabled?: boolean;
  showCrop?: boolean;
};

function ToolIcon({
  active,
  label,
  onClick,
  disabled = false,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`flex flex-col items-center gap-0.5 disabled:opacity-40 disabled:pointer-events-none ${active ? 'text-white' : 'text-white/55'}`}
    >
      <span
        className={`flex h-11 w-11 items-center justify-center rounded-full ${
          active ? 'bg-white text-black' : 'bg-white/10'
        }`}
      >
        {children}
      </span>
    </button>
  );
}

export function StoryToolRail({
  activeTool,
  onActiveToolChange,
  onTextTool,
  onShare,
  isPublishing = false,
  controlsDisabled = false,
  showCrop = false,
}: StoryToolRailProps) {
  const { t } = useTranslation();
  const disabled = isPublishing || controlsDisabled;

  const toggle = useCallback(
    (tool: Exclude<StoryEditorTool, null>) => {
      if (disabled) return;
      lightHaptic();
      onActiveToolChange(activeTool === tool ? null : tool);
    },
    [activeTool, disabled, onActiveToolChange]
  );

  return (
    <div className="relative z-40 flex flex-col">
      <div className="flex items-center justify-between gap-2 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
          {onTextTool ? (
            <ToolIcon
              active={activeTool === 'text'}
              label={t('stories.editor.toolText')}
              disabled={disabled}
              onClick={() => {
                if (disabled) return;
                lightHaptic();
                onTextTool();
              }}
            >
              <Type size={22} strokeWidth={2} />
            </ToolIcon>
          ) : null}
          <ToolIcon active={activeTool === 'sticker'} label={t('stories.editor.toolSticker')} disabled={disabled} onClick={() => toggle('sticker')}>
            <Smile size={22} strokeWidth={2} />
          </ToolIcon>
          <ToolIcon active={activeTool === 'adjust'} label={t('stories.editor.toolAdjust')} disabled={disabled} onClick={() => toggle('adjust')}>
            <SlidersHorizontal size={22} strokeWidth={2} />
          </ToolIcon>
          {showCrop ? (
            <ToolIcon active={activeTool === 'crop'} label={t('stories.editor.toolCrop')} disabled={disabled} onClick={() => toggle('crop')}>
              <Crop size={22} strokeWidth={2} />
            </ToolIcon>
          ) : null}
        </div>
        {onShare ? (
          <button
            type="button"
            onClick={() => {
              lightHaptic();
              onShare();
            }}
            disabled={disabled}
            className="shrink-0 rounded-full bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {isPublishing ? <Loader2 className="animate-spin" size={18} /> : t('stories.publish')}
          </button>
        ) : null}
      </div>
    </div>
  );
}
