import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { FullScreenDialog } from '@/components/ui/FullScreenDialog';
import { lightHaptic } from '@/utils/lightHaptic';
import { viewportScaleFromFrameWidth } from '@/components/stories/create/utils/storyCompositionLayout';
import { PhotoStoryCaptionDrawer } from './editor/PhotoStoryCaptionDrawer';
import { PhotoStoryCropGuide } from './editor/PhotoStoryCropGuide';
import { PhotoStoryCropScreen } from './editor/PhotoStoryCropScreen';
import { PhotoStoryKonvaCanvas } from './editor/PhotoStoryKonvaCanvas';
import { PhotoStoryPublishBar } from './editor/PhotoStoryPublishBar';
import { PhotoStoryStage } from './editor/PhotoStoryStage';
import { PhotoStoryTextEditOverlay } from './editor/PhotoStoryTextEditOverlay';
import { PhotoStoryToolPanel } from './editor/PhotoStoryToolPanel';
import { PhotoStoryToolRail } from './editor/PhotoStoryToolRail';
import { PhotoStoryTopChrome } from './editor/PhotoStoryTopChrome';
import { usePhotoStoryGestures } from './hooks/usePhotoStoryGestures';
import { usePhotoStoryState } from './hooks/usePhotoStoryState';
import { useStoryPhotoPublish } from './hooks/useStoryPhotoPublish';
import type { StoryMediaFile, StoryPhotoTool, TextNode, Transform2D } from './types';
import { isStickerNode, isTextNode } from './types';
import { getMediaNode } from './utils/document';
import { mediaScaleBoundsForMedia } from './utils/transform';

type StoryPhotoEditorProps = {
  open: boolean;
  files: StoryMediaFile[];
  onClose: () => void;
  onPublished: (segmentKey: string) => void;
};

export function StoryPhotoEditor({ open, files, onClose, onPublished }: StoryPhotoEditorProps) {
  const { t } = useTranslation();
  const textEditSnapshotRef = useRef('');
  const [stageSize, setStageSize] = useState({ w: 360, h: 640 });
  const [stageRect, setStageRect] = useState<DOMRect | null>(null);
  const stageScale = useMemo(() => viewportScaleFromFrameWidth(stageSize.w), [stageSize.w]);
  const [activeTool, setActiveTool] = useState<StoryPhotoTool>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [textEditInitial, setTextEditInitial] = useState('');
  const [textDraft, setTextDraft] = useState('');
  const [caption, setCaption] = useState('');
  const [captionOpen, setCaptionOpen] = useState(false);
  const [handlesActive, setHandlesActive] = useState(false);

  const editor = usePhotoStoryState({ files });
  const {
    session,
    activeDoc,
    activeIndex,
    segmentCount,
    isDirty,
    selectedNodeId,
    setSelectedNodeId,
    beginTransaction,
    commitTransaction,
    setMediaTransform,
    resetMediaTransform,
    setMediaAdjust,
    replaceActiveMedia,
    goToSegment,
    addSticker,
    updateNodeTransform,
    deleteNode,
    addTextLayer,
    setTextNode,
    updateTextStyle,
    markClean,
    undo,
    redo,
    canUndo,
    canRedo,
    registerMediaDimensions,
  } = editor;

  const { publishSession, isPublishing, abandonPartialPublish, hasPartialPublish } =
    useStoryPhotoPublish();

  const media = activeDoc ? getMediaNode(activeDoc) : null;
  const selectedText: TextNode | null =
    activeDoc?.nodes.find((n): n is TextNode => n.id === selectedNodeId && isTextNode(n)) ?? null;
  const editingText: TextNode | null =
    activeDoc?.nodes.find((n): n is TextNode => n.id === editingTextId && isTextNode(n)) ?? null;

  const handleMeasure = useCallback((size: { w: number; h: number }, rect: DOMRect) => {
    setStageSize(size);
    setStageRect(rect);
  }, []);

  useEffect(() => {
    if (!open) {
      setCaption('');
      setCaptionOpen(false);
    }
  }, [open]);

  useEffect(() => {
    setActiveTool(null);
  }, [activeIndex]);

  const closeTool = useCallback(() => setActiveTool(null), []);

  const beginTextEdit = useCallback(
    (id: string, initial: string) => {
      beginTransaction();
      textEditSnapshotRef.current = initial;
      setTextEditInitial(initial);
      setTextDraft(initial);
      setEditingTextId(id);
    },
    [beginTransaction]
  );

  const exitTextEdit = useCallback(() => {
    commitTransaction();
    setEditingTextId(null);
    setTextEditInitial('');
    setTextDraft('');
  }, [commitTransaction]);

  const flushOpenTextEdit = useCallback(() => {
    if (!editingTextId) return;
    const node = activeDoc?.nodes.find((n) => n.id === editingTextId && isTextNode(n));
    const draft = textDraft.trim();
    const fallback = node && isTextNode(node) ? node.text.trim() : '';
    const text = draft || fallback;
    if (!text) {
      deleteNode(editingTextId);
      setSelectedNodeId(null);
      if (activeTool === 'text') setActiveTool(null);
    } else if (draft) {
      setTextNode(editingTextId, { text: draft });
    }
    exitTextEdit();
  }, [
    activeDoc?.nodes,
    activeTool,
    deleteNode,
    editingTextId,
    exitTextEdit,
    setSelectedNodeId,
    setTextNode,
    textDraft,
  ]);

  const handleSelectSegment = useCallback(
    (index: number) => {
      flushOpenTextEdit();
      goToSegment(index);
    },
    [flushOpenTextEdit, goToSegment]
  );

  const handleDeselect = useCallback(() => {
    if (selectedNodeId) {
      const node = activeDoc?.nodes.find((n) => n.id === selectedNodeId);
      if (node && isTextNode(node) && !node.text.trim()) deleteNode(selectedNodeId);
      else setSelectedNodeId(null);
    }
    exitTextEdit();
    if (activeTool === 'text') setActiveTool(null);
  }, [activeDoc?.nodes, activeTool, deleteNode, exitTextEdit, selectedNodeId, setSelectedNodeId]);

  const handleSelectNode = useCallback(
    (id: string | null, kind: 'media' | 'layer') => {
      if (id === null || kind === 'media') {
        handleDeselect();
        return;
      }
      lightHaptic();
      const node = activeDoc?.nodes.find((n) => n.id === id);
      const wasSelected = selectedNodeId === id;
      setSelectedNodeId(id);
      if (node && isTextNode(node)) {
        setActiveTool('text');
        if (wasSelected) beginTextEdit(id, node.text);
        else exitTextEdit();
      } else {
        exitTextEdit();
        if (activeTool === 'text') setActiveTool(null);
      }
    },
    [
      activeDoc?.nodes,
      activeTool,
      beginTextEdit,
      exitTextEdit,
      handleDeselect,
      selectedNodeId,
      setSelectedNodeId,
    ]
  );

  const handleTextTool = useCallback(() => {
    if (selectedText) {
      setActiveTool('text');
      beginTextEdit(selectedText.id, selectedText.text);
      return;
    }
    const id = addTextLayer();
    setActiveTool('text');
    beginTextEdit(id, '');
  }, [addTextLayer, beginTextEdit, selectedText]);

  const handleTextEditCommit = useCallback(() => {
    if (!editingTextId) return;
    const trimmed = textDraft.trim();
    if (!trimmed) {
      deleteNode(editingTextId);
      setSelectedNodeId(null);
      setActiveTool(null);
    } else {
      setTextNode(editingTextId, { text: trimmed });
    }
    exitTextEdit();
  }, [
    deleteNode,
    editingTextId,
    exitTextEdit,
    setSelectedNodeId,
    setTextNode,
    textDraft,
  ]);

  const handleTextEditCancel = useCallback(() => {
    if (!editingTextId) return;
    const snapshot = textEditSnapshotRef.current;
    if (!snapshot.trim()) {
      deleteNode(editingTextId);
      setSelectedNodeId(null);
      setActiveTool(null);
    } else {
      setTextNode(editingTextId, { text: snapshot });
    }
    exitTextEdit();
  }, [deleteNode, editingTextId, exitTextEdit, setSelectedNodeId, setTextNode]);

  const handleClose = useCallback(() => {
    if (isPublishing) return;
    const partial = hasPartialPublish();
    if ((isDirty || partial) && !window.confirm(t('stories.editor.discardConfirm'))) return;
    void (async () => {
      if (partial) await abandonPartialPublish();
      onClose();
    })();
  }, [abandonPartialPublish, hasPartialPublish, isDirty, isPublishing, onClose, t]);

  const canvasGesturesBlocked =
    activeTool === 'crop' ||
    activeTool === 'adjust' ||
    activeTool === 'sticker' ||
    editingTextId != null ||
    captionOpen;
  const gesturesEnabled = !canvasGesturesBlocked;

  const selectedLayer =
    activeDoc && selectedNodeId
      ? activeDoc.nodes.find(
          (n) => n.id === selectedNodeId && (isTextNode(n) || isStickerNode(n))
        )
      : undefined;

  const gestureTarget = useMemo(() => {
    if (!gesturesEnabled || !media) return { kind: 'off' as const };
    if (selectedLayer) {
      return { kind: 'layer' as const, transform: selectedLayer.transform };
    }
    const w = media.source.naturalWidth;
    const h = media.source.naturalHeight;
    // Wait for real dims — fake 1080×1920 bounds caused wrong zooms + wipe on load.
    if (w == null || h == null || w <= 0 || h <= 0) return { kind: 'off' as const };
    const bounds = mediaScaleBoundsForMedia(w, h);
    return {
      kind: 'media' as const,
      transform: media.transform,
      coverScale: bounds.coverScale,
      minScale: bounds.min,
      maxScale: bounds.max,
      mediaWidth: w,
      mediaHeight: h,
    };
  }, [gesturesEnabled, media, selectedLayer]);

  const handleMediaReset = useCallback(() => {
    resetMediaTransform();
  }, [resetMediaTransform]);

  const handleLayerGestureTransform = useCallback(
    (next: Transform2D) => {
      if (selectedNodeId) updateNodeTransform(selectedNodeId, next);
    },
    [selectedNodeId, updateNodeTransform]
  );

  const { bind: stageGestureBind, isGestureActive, endGesture } = usePhotoStoryGestures({
    target: gestureTarget,
    stageScale,
    frameRect: stageRect,
    onMediaTransformChange: setMediaTransform,
    onLayerTransformChange: handleLayerGestureTransform,
    onMediaReset: handleMediaReset,
    onGestureStart: beginTransaction,
    onGestureEnd: commitTransaction,
    handlesActive,
  });

  const settleEditorInteraction = useCallback(() => {
    endGesture();
    commitTransaction();
    setHandlesActive(false);
  }, [commitTransaction, endGesture]);

  const prevSegmentRef = useRef(activeIndex);
  useEffect(() => {
    if (prevSegmentRef.current === activeIndex) return;
    prevSegmentRef.current = activeIndex;
    settleEditorInteraction();
  }, [activeIndex, settleEditorInteraction]);

  // Tools/caption steal the canvas — end stage gesture + open history tx.
  // Text edit keeps its own begin/commit transaction (do not settle here).
  const hardBlockGestures =
    activeTool === 'crop' ||
    activeTool === 'adjust' ||
    activeTool === 'sticker' ||
    captionOpen;

  useEffect(() => {
    if (hardBlockGestures) settleEditorInteraction();
  }, [hardBlockGestures, settleEditorInteraction]);

  const showCropGuide =
    gesturesEnabled && isGestureActive && gestureTarget.kind === 'media' && !handlesActive;

  const handleShare = useCallback(async () => {
    lightHaptic();
    const key = await publishSession({ ...session, caption });
    if (key) {
      markClean();
      onPublished(key);
      onClose();
    }
  }, [caption, markClean, onClose, onPublished, publishSession, session]);

  if (!activeDoc || !media) return null;

  const panelOpen =
    activeTool != null && activeTool !== 'crop' && editingTextId == null;
  const showPublish =
    !panelOpen && !captionOpen && activeTool !== 'crop' && editingTextId == null;

  return (
    <FullScreenDialog
      open={open}
      onClose={handleClose}
      title=""
      closeOnInteractOutside={false}
      bodyClassName="!overflow-hidden overscroll-none touch-none"
    >
      <div className="relative h-full min-h-[100dvh] w-full overflow-hidden overscroll-none bg-black text-white touch-none">
        <PhotoStoryStage
          className="pointer-events-auto"
          gesturesDisabled={!gesturesEnabled}
          stageGestureBind={gesturesEnabled ? stageGestureBind : undefined}
          onMeasure={handleMeasure}
          overlay={
            activeTool === 'crop' ? (
              <PhotoStoryCropScreen
                key={media.source.previewUrl}
                imageUrl={media.source.previewUrl}
                onConfirm={(file) => {
                  replaceActiveMedia(file, URL.createObjectURL(file));
                  setActiveTool(null);
                }}
                onCancel={() => setActiveTool(null)}
              />
            ) : null
          }
        >
          {() => (
            <>
              <PhotoStoryKonvaCanvas
                doc={activeDoc}
                stageWidth={stageSize.w}
                stageHeight={stageSize.h}
                selectedNodeId={selectedNodeId}
                gesturesEnabled={gesturesEnabled}
                previewInteractive={isGestureActive || handlesActive}
                editingTextId={editingTextId}
                onSelectNode={handleSelectNode}
                onLayerTransformChange={(id, patch) => updateNodeTransform(id, patch)}
                onGestureStart={beginTransaction}
                onGestureEnd={commitTransaction}
                onLoadDimensions={registerMediaDimensions}
                onHandlesActiveChange={setHandlesActive}
              />
              <PhotoStoryCropGuide visible={showCropGuide} />
            </>
          )}
        </PhotoStoryStage>

        <div className="pointer-events-none absolute inset-0 z-[30]">
          <PhotoStoryTopChrome
            segmentCount={segmentCount}
            activeIndex={activeIndex}
            onSelectSegment={handleSelectSegment}
            onClose={handleClose}
            onUndo={undo}
            onRedo={redo}
            canUndo={canUndo}
            canRedo={canRedo}
            captionOpen={captionOpen}
            onToggleCaption={() => setCaptionOpen((o) => !o)}
            disabled={isPublishing}
          />

          {activeTool !== 'crop' && editingTextId == null ? (
            <PhotoStoryToolRail
              activeTool={activeTool}
              onToolChange={setActiveTool}
              onText={handleTextTool}
              disabled={isPublishing}
            />
          ) : null}

          {editingTextId && editingText && stageRect ? (
            <PhotoStoryTextEditOverlay
              key={editingTextId}
              node={editingText}
              stageRect={stageRect}
              stageScale={stageScale}
              initialDraft={textEditInitial}
              draft={textDraft}
              onDraftChange={(text) => {
                setTextDraft(text);
                setTextNode(editingTextId, { text });
              }}
              onStyleChange={(p) => updateTextStyle(editingTextId, p)}
              onCommit={handleTextEditCommit}
              onCancel={handleTextEditCancel}
            />
          ) : null}

          {showPublish ? (
            <PhotoStoryPublishBar
              label={t('stories.publish')}
              isPublishing={isPublishing}
              onPublish={() => void handleShare()}
            />
          ) : null}

          <PhotoStoryToolPanel
            tool={activeTool}
            onClose={closeTool}
            adjust={media.adjust}
            onAdjustPreview={(a) => {
              beginTransaction();
              setMediaAdjust(a);
            }}
            onAdjustCommit={(a) => {
              setMediaAdjust(a);
              commitTransaction();
            }}
            selectedText={selectedText}
            onTextStyleChange={(p) => selectedText && updateTextStyle(selectedText.id, p)}
            onStickerPick={(emoji) => {
              addSticker(emoji);
              closeTool();
            }}
            disabled={isPublishing}
          />

          <PhotoStoryCaptionDrawer
            open={captionOpen}
            value={caption}
            onChange={setCaption}
            onClose={() => setCaptionOpen(false)}
            disabled={isPublishing}
          />

          {isPublishing ? (
            <div className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center bg-black/75">
              <Loader2 className="animate-spin text-white" size={36} />
            </div>
          ) : null}
        </div>
      </div>
    </FullScreenDialog>
  );
}
