import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Send } from 'lucide-react';
import { FullScreenDialog } from '@/components/ui/FullScreenDialog';
import { lightHaptic } from '@/utils/lightHaptic';
import { PhotoStoryCaptionDrawer } from './editor/PhotoStoryCaptionDrawer';
import { PhotoStoryCropScreen } from './editor/PhotoStoryCropScreen';
import { PHOTO_MEDIA_NODE_KEY, PhotoStoryKonvaCanvas } from './editor/PhotoStoryKonvaCanvas';
import { PhotoStoryStage } from './editor/PhotoStoryStage';
import { PhotoStoryTextEditOverlay } from './editor/PhotoStoryTextEditOverlay';
import { PhotoStoryToolPanel } from './editor/PhotoStoryToolPanel';
import { PhotoStoryToolRail } from './editor/PhotoStoryToolRail';
import { PhotoStoryTopChrome } from './editor/PhotoStoryTopChrome';
import { usePhotoStoryState } from './hooks/usePhotoStoryState';
import { useStoryPhotoPublish } from './hooks/useStoryPhotoPublish';
import type { StoryMediaFile, StoryPhotoTool, TextNode } from './types';
import { isTextNode } from './types';
import { getMediaNode } from './utils/document';
import { stageScaleFromWidth } from './utils/transform';

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
  const [stageScale, setStageScale] = useState(0.33);
  const [activeTool, setActiveTool] = useState<StoryPhotoTool>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [textEditInitial, setTextEditInitial] = useState('');
  const [textDraft, setTextDraft] = useState('');
  const [caption, setCaption] = useState('');
  const [captionOpen, setCaptionOpen] = useState(false);
  const [mediaSelected, setMediaSelected] = useState(false);

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
    setMediaAdjustWithHistory,
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

  const { publishSession, isPublishing } = useStoryPhotoPublish();

  const media = activeDoc ? getMediaNode(activeDoc) : null;
  const selectedText: TextNode | null =
    activeDoc?.nodes.find((n): n is TextNode => n.id === selectedNodeId && isTextNode(n)) ?? null;
  const editingText: TextNode | null =
    activeDoc?.nodes.find((n): n is TextNode => n.id === editingTextId && isTextNode(n)) ?? null;

  const handleMeasure = useCallback((size: { w: number; h: number }, rect: DOMRect) => {
    setStageSize(size);
    setStageRect(rect);
    setStageScale(stageScaleFromWidth(rect.width));
  }, []);

  useEffect(() => {
    if (!open) {
      setCaption('');
      setCaptionOpen(false);
    }
  }, [open]);

  useEffect(() => {
    setEditingTextId(null);
    setMediaSelected(false);
    setActiveTool(null);
  }, [activeIndex]);

  const closeTool = useCallback(() => setActiveTool(null), []);

  const beginTextEdit = useCallback((id: string, initial: string) => {
    textEditSnapshotRef.current = initial;
    setTextEditInitial(initial);
    setTextDraft(initial);
    setEditingTextId(id);
  }, []);

  const exitTextEdit = useCallback(() => {
    setEditingTextId(null);
    setTextEditInitial('');
    setTextDraft('');
  }, []);

  const handleDeselect = useCallback(() => {
    if (selectedNodeId) {
      const node = activeDoc?.nodes.find((n) => n.id === selectedNodeId);
      if (node && isTextNode(node) && !node.text.trim()) deleteNode(selectedNodeId);
      else setSelectedNodeId(null);
    }
    setMediaSelected(false);
    exitTextEdit();
    if (activeTool === 'text') setActiveTool(null);
  }, [activeDoc?.nodes, activeTool, deleteNode, exitTextEdit, selectedNodeId, setSelectedNodeId]);

  const handleSelectNode = useCallback(
    (id: string | null, kind: 'media' | 'layer') => {
      if (id === null) {
        handleDeselect();
        return;
      }
      lightHaptic();
      if (kind === 'media' || id === PHOTO_MEDIA_NODE_KEY) {
        setMediaSelected(true);
        setSelectedNodeId(null);
        exitTextEdit();
        setActiveTool(null);
      } else {
        setMediaSelected(false);
        setSelectedNodeId(id);
        const node = activeDoc?.nodes.find((n) => n.id === id);
        if (node && isTextNode(node)) {
          setActiveTool('text');
          beginTextEdit(id, node.text);
        }
      }
    },
    [activeDoc?.nodes, beginTextEdit, exitTextEdit, handleDeselect, setSelectedNodeId]
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
      commitTransaction();
    }
    exitTextEdit();
  }, [
    commitTransaction,
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
    if (isDirty && !window.confirm(t('stories.editor.discardConfirm'))) return;
    onClose();
  }, [isDirty, isPublishing, onClose, t]);

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

  const gesturesEnabled = activeTool !== 'crop' && editingTextId == null;
  const panelOpen =
    activeTool != null && activeTool !== 'crop' && editingTextId == null;
  const showPublish =
    !panelOpen && !captionOpen && activeTool !== 'crop' && editingTextId == null;

  return (
    <FullScreenDialog open={open} onClose={handleClose} title="" closeOnInteractOutside={false}>
      <div className="relative h-full min-h-[100dvh] w-full overflow-hidden bg-black text-white">
        <PhotoStoryStage
          gesturesDisabled={activeTool === 'crop'}
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
            <PhotoStoryKonvaCanvas
              doc={activeDoc}
              stageWidth={stageSize.w}
              stageHeight={stageSize.h}
              selectedNodeId={selectedNodeId}
              mediaSelected={mediaSelected}
              gesturesEnabled={gesturesEnabled}
              editingTextId={editingTextId}
              onSelectNode={handleSelectNode}
              onMediaTransformChange={(patch) => {
                const m = getMediaNode(activeDoc);
                if (m) setMediaTransform({ ...m.transform, ...patch });
              }}
              onLayerTransformChange={(id, patch) => updateNodeTransform(id, patch)}
              onGestureStart={beginTransaction}
              onGestureEnd={commitTransaction}
              onLoadDimensions={registerMediaDimensions}
            />
          )}
        </PhotoStoryStage>

        <PhotoStoryTopChrome
          segmentCount={segmentCount}
          activeIndex={activeIndex}
          onSelectSegment={goToSegment}
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
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center bg-gradient-to-t from-black/90 via-black/50 to-transparent pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-10">
            <button
              type="button"
              disabled={isPublishing}
              onClick={() => void handleShare()}
              className="pointer-events-auto flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-500 to-indigo-500 px-8 py-3.5 text-base font-bold shadow-lg shadow-sky-500/30 disabled:opacity-50"
            >
              {isPublishing ? (
                <Loader2 className="animate-spin" size={22} />
              ) : (
                <>
                  <Send size={20} />
                  {t('stories.publish')}
                </>
              )}
            </button>
          </div>
        ) : null}

        <PhotoStoryToolPanel
          tool={activeTool}
          onClose={closeTool}
          adjust={media.adjust}
          onAdjustCommit={setMediaAdjustWithHistory}
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
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/75">
            <Loader2 className="animate-spin text-white" size={36} />
          </div>
        ) : null}
      </div>
    </FullScreenDialog>
  );
}
