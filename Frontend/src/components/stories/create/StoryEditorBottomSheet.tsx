import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Loader2 } from 'lucide-react';
import { lightHaptic } from '@/utils/lightHaptic';
import { StoryAdjustPanel } from './StoryAdjustPanel';
import { StoryStickerPicker } from './StoryStickerPicker';
import { StoryTextStyleSheet } from './StoryTextStyleSheet';
import { StoryToolRail } from './StoryToolRail';
import { StoryVideoTrimPanel } from './StoryVideoTrimPanel';
import type { StoryEditorTool, StoryMediaAdjust, TextStoryLayer, VideoTrimRange } from './types/storyEditor.types';

type StoryEditorBottomSheetProps = {
  activeTool: StoryEditorTool;
  onActiveToolChange: (tool: StoryEditorTool) => void;
  onStickerPick: (emoji: string) => void;
  onTextTool: () => void;
  onShare: () => void;
  onAddSlide: () => void;
  isPublishing: boolean;
  showCrop: boolean;
  showTrim: boolean;
  adjust: StoryMediaAdjust;
  onAdjustLiveChange: (adjust: StoryMediaAdjust) => void;
  onAdjustCommit: (adjust: StoryMediaAdjust) => void;
  selectedTextLayer: TextStoryLayer | null;
  onTextStyleChange: (patch: Partial<TextStoryLayer['style']>) => void;
  trimPreviewUrl: string;
  videoDurationMs: number;
  trim: VideoTrimRange;
  onTrimLiveChange: (trim: VideoTrimRange) => void;
  onTrimCommit: (trim: VideoTrimRange) => void;
};

function TrimLoadingSkeleton() {
  const { t } = useTranslation();
  return (
    <div className="px-4 py-6 space-y-3">
      <div className="flex items-center justify-center gap-2 text-xs text-white/60">
        <Loader2 className="animate-spin" size={16} />
        <span>{t('stories.editor.trimLoading')}</span>
      </div>
      <div className="h-2 rounded-full bg-white/10 animate-pulse" />
      <div className="flex justify-between">
        <span className="h-3 w-8 rounded bg-white/10 animate-pulse" />
        <span className="h-3 w-8 rounded bg-white/10 animate-pulse" />
      </div>
    </div>
  );
}

function PanelCloseBar({
  onClose,
  onShare,
  isPublishing,
  disabled = false,
}: {
  onClose: () => void;
  onShare: () => void;
  isPublishing: boolean;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
      <button
        type="button"
        onClick={() => {
          if (disabled) return;
          lightHaptic();
          onClose();
        }}
        disabled={disabled}
        className="flex items-center gap-1 rounded-full px-2 py-1.5 text-sm text-white/80 active:bg-white/10 disabled:opacity-40"
        aria-label={t('common.close')}
      >
        <ChevronDown size={20} />
      </button>
      <button
        type="button"
        onClick={() => {
          if (disabled) return;
          lightHaptic();
          onShare();
        }}
        disabled={disabled}
        className="shrink-0 rounded-full bg-sky-500 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {isPublishing ? <Loader2 className="animate-spin" size={18} /> : t('stories.publish')}
      </button>
    </div>
  );
}

export function StoryEditorBottomSheet({
  activeTool,
  onActiveToolChange,
  onStickerPick,
  onTextTool,
  onShare,
  onAddSlide,
  isPublishing,
  showCrop,
  showTrim,
  adjust,
  onAdjustLiveChange,
  onAdjustCommit,
  selectedTextLayer,
  onTextStyleChange,
  trimPreviewUrl,
  videoDurationMs,
  trim,
  onTrimLiveChange,
  onTrimCommit,
}: StoryEditorBottomSheetProps) {
  const closeTool = useCallback(() => onActiveToolChange(null), [onActiveToolChange]);
  const controlsDisabled = isPublishing;

  const showTextStyles = activeTool === 'text' && selectedTextLayer != null;
  const showAdjust = activeTool === 'adjust';
  const showTrimPanel = activeTool === 'trim' && showTrim;
  const showSticker = activeTool === 'sticker';
  const showPanel = showTextStyles || showAdjust || showTrimPanel || showSticker;

  if (!showPanel) {
    return (
      <StoryToolRail
        activeTool={activeTool}
        onActiveToolChange={onActiveToolChange}
        onTextTool={onTextTool}
        onShare={onShare}
        onAddSlide={onAddSlide}
        isPublishing={isPublishing}
        controlsDisabled={controlsDisabled}
        showCrop={showCrop}
        showTrim={showTrim}
      />
    );
  }

  return (
    <div className="relative z-40 flex flex-col bg-gray-950/95 rounded-t-2xl pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <PanelCloseBar onClose={closeTool} onShare={onShare} isPublishing={isPublishing} disabled={controlsDisabled} />

      {showAdjust ? (
        <StoryAdjustPanel
          adjust={adjust}
          onLiveChange={onAdjustLiveChange}
          onCommit={onAdjustCommit}
          disabled={controlsDisabled}
        />
      ) : null}

      {showTextStyles && selectedTextLayer ? (
        <StoryTextStyleSheet layer={selectedTextLayer} onStyleChange={onTextStyleChange} />
      ) : null}

      {showTrimPanel ? (
        videoDurationMs > 0 ? (
          <StoryVideoTrimPanel
            previewUrl={trimPreviewUrl}
            durationMs={videoDurationMs}
            trim={trim}
            onLiveChange={onTrimLiveChange}
            onCommit={onTrimCommit}
            onEscape={closeTool}
            disabled={controlsDisabled}
          />
        ) : (
          <TrimLoadingSkeleton />
        )
      ) : null}

      {showSticker ? (
        <StoryStickerPicker
          embedded
          onPick={(emoji) => {
            onStickerPick(emoji);
            onActiveToolChange(null);
          }}
        />
      ) : null}
    </div>
  );
}
