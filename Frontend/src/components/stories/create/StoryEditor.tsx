import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FullScreenDialog } from '@/components/ui/FullScreenDialog';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { lightHaptic } from '@/utils/lightHaptic';
import { Redo2, Undo2, X } from 'lucide-react';
import { StoryCropMode } from './StoryCropMode';
import { StoryEditorBottomSheet } from './StoryEditorBottomSheet';
import { StoryEditorialCanvas } from './StoryEditorialCanvas';
import { StoryMediaLayer } from './StoryMediaLayer';
import { StorySlideThumbnails } from './StorySlideThumbnails';
import { StoryStickerLayers } from './StoryStickerLayers';
import { StoryTextLayers } from './StoryTextLayers';
import { useStoryEditorState } from './hooks/useStoryEditorState';
import { useStoryExport } from './hooks/useStoryExport';
import { useStoryVideoDuration } from './hooks/useStoryVideoDuration';
import { useVisualViewportInset } from './hooks/useVisualViewportInset';
import type { StoryEditorTool, StoryMediaFile, TextStoryLayer } from './types/storyEditor.types';
import { isTextLayer } from './types/storyEditor.types';
import { resolveEditorMode } from './utils/resolveEditorMode';
import { StoryCaptionField } from './StoryCaptionField';

type StoryEditorProps = {
  open: boolean;
  files: StoryMediaFile[];
  onClose: () => void;
  onPublished: (segmentKey: string) => void;
};

const SWIPE_THRESHOLD_PX = 48;
const EDGE_SWIPE_INSET_PX = 56;

export function StoryEditor({ open, files, onClose, onPublished }: StoryEditorProps) {
  const { t } = useTranslation();
  const reducedMotion = usePrefersReducedMotion();
  const addInputRef = useRef<HTMLInputElement>(null);
  const [stageSize, setStageSize] = useState({ w: 360, h: 640 });
  const [activeTool, setActiveTool] = useState<StoryEditorTool>(null);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [mediaGestureActive, setMediaGestureActive] = useState(false);
  const [caption, setCaption] = useState('');
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const editor = useStoryEditorState({
    files,
    stageWidth: stageSize.w,
    stageHeight: stageSize.h,
  });

  const {
    activeSlide,
    activeSlideIndex,
    slideCount,
    isDirty,
    selectedLayerId,
    setSelectedLayerId,
    beginTransaction,
    commitTransaction,
    setMediaTransform,
    setMediaAdjust,
    setMediaAdjustWithHistory,
    setVideoTrimLive,
    setVideoTrimWithHistory,
    setVideoDurationMs,
    registerMediaDimensions,
    resetMediaTransform,
    replaceSlideMedia,
    appendSlide,
    goToSlide,
    addTextLayer,
    setTextLayer,
    updateTextLayerStyle,
    selectLayer,
    deleteLayer,
    addSticker,
    updateLayerTransform,
    markClean,
    undo,
    redo,
    canUndo,
    canRedo,
    activeDefaultTransform,
    slides,
  } = editor;

  const { publishSlides, isPublishing, progress } = useStoryExport();
  const keyboardInset = useVisualViewportInset(editingLayerId != null);

  const videoDurationMs = useStoryVideoDuration(activeSlide, setVideoDurationMs);

  const editorMode = resolveEditorMode(activeTool, selectedLayerId, editingLayerId);

  const canvasGesturesDisabled = editorMode !== 'IDLE';
  const mediaGesturesEnabled = editorMode === 'IDLE';
  const showDeselectOverlay =
    editorMode === 'LAYER_SELECTED' || (editorMode === 'TOOL_ACTIVE' && activeTool === 'text');

  useEffect(() => {
    if (!open) setCaption('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    void import('./StoryStickerPickerInner');
  }, [open]);

  useEffect(() => {
    setEditingLayerId(null);
  }, [activeSlideIndex]);

  const onTransformBegin = useCallback(() => beginTransaction(), [beginTransaction]);
  const onTransformEnd = useCallback(() => commitTransaction(), [commitTransaction]);

  const handleDeselect = useCallback(() => {
    if (selectedLayerId) {
      lightHaptic();
      const layer = activeSlide?.layers.find((l) => l.id === selectedLayerId);
      if (layer && isTextLayer(layer) && !layer.text.trim()) {
        deleteLayer(selectedLayerId);
      } else {
        setSelectedLayerId(null);
      }
    } else {
      setSelectedLayerId(null);
    }
    setEditingLayerId(null);
    if (activeTool === 'text') setActiveTool(null);
  }, [activeSlide?.layers, activeTool, deleteLayer, selectedLayerId, setSelectedLayerId]);

  const handleTextTool = useCallback(() => {
    if (activeTool === 'text') {
      handleDeselect();
      return;
    }
    if (selectedLayerId) {
      const layer = activeSlide?.layers.find((l) => l.id === selectedLayerId);
      if (layer && isTextLayer(layer)) {
        setActiveTool('text');
        return;
      }
    }
    const layerId = addTextLayer();
    setActiveTool('text');
    setEditingLayerId(layerId);
  }, [activeSlide?.layers, activeTool, addTextLayer, handleDeselect, selectedLayerId]);

  const handleClose = useCallback(() => {
    if (isPublishing) return;
    if (isDirty && !window.confirm(t('stories.editor.discardConfirm'))) return;
    setActiveTool(null);
    setEditingLayerId(null);
    onClose();
  }, [isDirty, isPublishing, onClose, t]);

  const handleShare = useCallback(async () => {
    const key = await publishSlides(slides, caption);
    if (key) {
      markClean();
      onPublished(key);
      onClose();
    }
  }, [markClean, onClose, onPublished, publishSlides, slides, caption]);

  const handleCropConfirm = useCallback(
    (file: File) => {
      if (!activeSlide) return;
      replaceSlideMedia(activeSlide.id, file, URL.createObjectURL(file));
      setActiveTool(null);
    },
    [activeSlide, replaceSlideMedia]
  );

  const handleAddFiles = useCallback(
    (list: FileList | null) => {
      if (!list?.length) return;
      for (const file of Array.from(list)) {
        const mediaType = file.type.startsWith('video/') ? 'VIDEO' : 'IMAGE';
        appendSlide({ file, mediaType });
      }
    },
    [appendSlide]
  );

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (editorMode !== 'IDLE' || mediaGestureActive || slideCount < 2) {
        touchStartRef.current = null;
        return;
      }
      const start = touchStartRef.current;
      touchStartRef.current = null;
      if (!start) return;

      const endTouch = e.changedTouches[0];
      if (!endTouch) return;

      const dx = endTouch.clientX - start.x;
      const dy = endTouch.clientY - start.y;
      if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;

      const horizontalIntent = Math.abs(dx) > Math.abs(dy);
      const nearEdge =
        start.x < EDGE_SWIPE_INSET_PX || start.x > window.innerWidth - EDGE_SWIPE_INSET_PX;
      if (!horizontalIntent && !nearEdge) return;

      if (dx < 0) goToSlide(activeSlideIndex + 1);
      else goToSlide(activeSlideIndex - 1);
    },
    [activeSlideIndex, editorMode, goToSlide, mediaGestureActive, slideCount]
  );

  const selectedTextLayer = useMemo(
    () =>
      activeSlide?.layers.find(
        (l): l is TextStoryLayer => l.id === selectedLayerId && isTextLayer(l)
      ) ?? null,
    [activeSlide?.layers, selectedLayerId]
  );

  if (!activeSlide) return null;

  const trimRange = activeSlide.videoTrim ?? { startMs: 0, endMs: videoDurationMs };

  return (
    <FullScreenDialog open={open} onClose={handleClose} title={t('stories.createStory')} closeOnInteractOutside={false}>
      <div className="flex flex-col h-full min-h-[100dvh] bg-black text-white">
        <header className="flex items-center justify-between px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <button type="button" onClick={handleClose} disabled={isPublishing} className="p-2 rounded-full bg-white/10 disabled:opacity-40" aria-label={t('common.cancel')}>
            <X size={22} />
          </button>
          <span className="text-sm font-medium">{t('stories.yourStory')}</span>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={isPublishing || !canUndo}
              onClick={undo}
              className="p-2 rounded-full bg-white/10 disabled:opacity-30"
              aria-label={t('stories.editor.undo')}
            >
              <Undo2 size={20} />
            </button>
            <button
              type="button"
              disabled={isPublishing || !canRedo}
              onClick={redo}
              className="p-2 rounded-full bg-white/10 disabled:opacity-30"
              aria-label={t('stories.editor.redo')}
            >
              <Redo2 size={20} />
            </button>
          </div>
        </header>

        <div className="flex-1 min-h-0 flex flex-col relative" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <StoryEditorialCanvas
            gesturesDisabled={canvasGesturesDisabled}
            keyboardBottomInset={keyboardInset.bottom}
            onStageMeasure={setStageSize}
          >
            {({ stageScale }) => (
              <>
                <StoryMediaLayer
                  slide={activeSlide}
                  stageScale={stageScale}
                  defaultTransform={activeDefaultTransform}
                  gesturesEnabled={mediaGesturesEnabled}
                  onLoadDimensions={(w, h) => registerMediaDimensions(activeSlide.id, w, h)}
                  onTransformChange={setMediaTransform}
                  onResetTransform={resetMediaTransform}
                  onGestureStart={onTransformBegin}
                  onGestureEnd={onTransformEnd}
                  onMediaGestureActiveChange={setMediaGestureActive}
                />
                {showDeselectOverlay ? (
                  <div
                    className="absolute inset-0 z-[5]"
                    aria-hidden
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      handleDeselect();
                    }}
                  />
                ) : null}
                <StoryTextLayers
                  layers={activeSlide.layers}
                  stageScale={stageScale}
                  selectedLayerId={selectedLayerId}
                  editingLayerId={editingLayerId}
                  onSelectLayer={selectLayer}
                  onUpdateLayer={setTextLayer}
                  onEditStart={(id) => {
                    selectLayer(id);
                    setEditingLayerId(id);
                    setActiveTool('text');
                  }}
                  onEditEnd={() => setEditingLayerId(null)}
                  onDeleteLayer={deleteLayer}
                  onTransformBegin={onTransformBegin}
                  onTransformEnd={onTransformEnd}
                />
                <StoryStickerLayers
                  layers={activeSlide.layers}
                  stageScale={stageScale}
                  selectedLayerId={selectedLayerId}
                  reducedMotion={reducedMotion}
                  onSelectLayer={setSelectedLayerId}
                  onStickerTransformChange={updateLayerTransform}
                  onDeleteLayer={deleteLayer}
                  onTransformBegin={onTransformBegin}
                  onTransformEnd={onTransformEnd}
                />
                {activeTool === 'crop' && activeSlide.media.type === 'IMAGE' ? (
                  <StoryCropMode
                    key={activeSlide.media.previewUrl}
                    imageUrl={activeSlide.media.previewUrl}
                    onConfirm={handleCropConfirm}
                    onCancel={() => setActiveTool(null)}
                  />
                ) : null}
              </>
            )}
          </StoryEditorialCanvas>

          {(isPublishing || progress != null) ? (
            <div className="absolute inset-0 z-50 bg-black/60 flex flex-col items-center justify-center pointer-events-auto">
              <p className="text-sm">{progress != null ? `${Math.round(progress * 100)}%` : t('stories.publish')}</p>
            </div>
          ) : null}
        </div>

        <StorySlideThumbnails
          slides={slides}
          activeIndex={activeSlideIndex}
          onSelect={goToSlide}
          disabled={isPublishing}
        />

        <StoryCaptionField value={caption} onChange={setCaption} disabled={isPublishing} />

        <StoryEditorBottomSheet
          activeTool={activeTool}
          onActiveToolChange={setActiveTool}
          onStickerPick={addSticker}
          onTextTool={handleTextTool}
          onShare={() => void handleShare()}
          onAddSlide={() => addInputRef.current?.click()}
          isPublishing={isPublishing}
          showCrop={activeSlide.media.type === 'IMAGE'}
          showTrim={activeSlide.media.type === 'VIDEO'}
          adjust={activeSlide.mediaAdjust}
          onAdjustLiveChange={setMediaAdjust}
          onAdjustCommit={setMediaAdjustWithHistory}
          selectedTextLayer={selectedTextLayer}
          onTextStyleChange={(patch) => {
            if (selectedTextLayer) updateTextLayerStyle(selectedTextLayer.id, patch);
          }}
          trimPreviewUrl={activeSlide.media.previewUrl}
          videoDurationMs={videoDurationMs}
          trim={trimRange}
          onTrimLiveChange={setVideoTrimLive}
          onTrimCommit={setVideoTrimWithHistory}
        />

        <input
          ref={addInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => {
            handleAddFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
    </FullScreenDialog>
  );
}
