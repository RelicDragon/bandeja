import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createId } from '@paralleldrive/cuid2';
import type { StoryDocument, StoryMediaAdjust, StoryMediaFile, StorySession, TextNode, Transform2D } from '../types';
import {
  createDocumentFromFile,
  getMediaNode,
  patchDocumentMedia,
  revokeDocumentUrls,
} from '../utils/document';
import { downscaleStoryImageFile } from '../utils/downscaleStoryImageFile';
import { createStickerLayer } from '../utils/stickers';
import { defaultMediaTransform, defaultTextTransform } from '../utils/transform';

const MAX_HISTORY = 20;

type EditorSnapshot = { segments: StoryDocument[]; activeIndex: number };

function cloneSegments(segments: StoryDocument[]): StoryDocument[] {
  return structuredClone(segments);
}

function createTextNode(text = ''): TextNode {
  return {
    id: createId(),
    type: 'text',
    text,
    transform: defaultTextTransform(),
    style: { id: 'classic', align: 'center' },
  };
}

type UsePhotoStoryStateOptions = {
  files: StoryMediaFile[];
};

export function usePhotoStoryState({ files }: UsePhotoStoryStateOptions) {
  const [segments, setSegments] = useState<StoryDocument[]>(() => files.map(createDocumentFromFile));
  const [activeIndex, setActiveIndex] = useState(0);
  const [isDirty, setIsDirty] = useState(false);
  const [, setDefaultTransforms] = useState<Record<string, Transform2D>>({});
  const undoStack = useRef<EditorSnapshot[]>([]);
  const redoStack = useRef<EditorSnapshot[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const inTransactionRef = useRef(false);
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;

  useEffect(() => {
    return () => segmentsRef.current.forEach(revokeDocumentUrls);
  }, []);

  const pushHistory = useCallback((current: StoryDocument[], index: number) => {
    undoStack.current.push({ segments: cloneSegments(current), activeIndex: index });
    if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift();
    redoStack.current = [];
    setUndoCount(undoStack.current.length);
    setRedoCount(0);
  }, []);

  const applySnapshot = useCallback((snap: EditorSnapshot) => {
    setSegments(snap.segments);
    setActiveIndex(Math.min(snap.activeIndex, Math.max(0, snap.segments.length - 1)));
  }, []);

  const mutateSegments = useCallback(
    (mutate: (prev: StoryDocument[]) => StoryDocument[], recordHistory: boolean) => {
      setSegments((prev) => {
        if (recordHistory && !inTransactionRef.current) {
          pushHistory(prev, activeIndexRef.current);
        }
        setIsDirty(true);
        return mutate(prev);
      });
    },
    [pushHistory]
  );

  const withHistory = useCallback(
    (mutate: (prev: StoryDocument[]) => StoryDocument[]) => {
      mutateSegments(mutate, !inTransactionRef.current);
    },
    [mutateSegments]
  );

  const mutateLive = useCallback(
    (mutate: (prev: StoryDocument[]) => StoryDocument[]) => {
      mutateSegments(mutate, false);
    },
    [mutateSegments]
  );

  const beginTransaction = useCallback(() => {
    inTransactionRef.current = true;
  }, []);

  const commitTransaction = useCallback(() => {
    if (!inTransactionRef.current) return;
    inTransactionRef.current = false;
    pushHistory(segmentsRef.current, activeIndexRef.current);
    setIsDirty(true);
  }, [pushHistory]);

  const activeDoc = segments[activeIndex] ?? segments[0] ?? null;

  const patchActiveDoc = useCallback(
    (updater: (doc: StoryDocument) => StoryDocument) => {
      mutateLive((prev) => prev.map((d, i) => (i === activeIndex ? updater(d) : d)));
    },
    [activeIndex, mutateLive]
  );

  const setMediaTransform = useCallback(
    (transform: Transform2D | ((prev: Transform2D) => Transform2D)) => {
      patchActiveDoc((doc) => {
        const media = getMediaNode(doc);
        if (!media) return doc;
        const next = typeof transform === 'function' ? transform(media.transform) : transform;
        return {
          ...doc,
          nodes: doc.nodes.map((n) => (n.id === media.id ? { ...media, transform: next } : n)),
        };
      });
    },
    [patchActiveDoc]
  );

  const setMediaAdjust = useCallback(
    (adjust: StoryMediaAdjust) => {
      patchActiveDoc((doc) => {
        const media = getMediaNode(doc);
        if (!media) return doc;
        return {
          ...doc,
          nodes: doc.nodes.map((n) => (n.id === media.id ? { ...media, adjust } : n)),
        };
      });
    },
    [patchActiveDoc]
  );

  const setMediaAdjustWithHistory = useCallback(
    (adjust: StoryMediaAdjust) => {
      withHistory((prev) =>
        prev.map((doc, i) => {
          if (i !== activeIndex) return doc;
          const media = getMediaNode(doc);
          if (!media) return doc;
          return {
            ...doc,
            nodes: doc.nodes.map((n) => (n.id === media.id ? { ...media, adjust } : n)),
          };
        })
      );
    },
    [activeIndex, withHistory]
  );

  const replaceActiveMedia = useCallback(
    (file: File, previewUrl: string) => {
      withHistory((prev) =>
        prev.map((doc, i) => {
          if (i !== activeIndex) return doc;
          const media = getMediaNode(doc);
          if (media) URL.revokeObjectURL(media.source.previewUrl);
          return patchDocumentMedia(doc, file, previewUrl);
        })
      );
      setDefaultTransforms((prev) => {
        const id = activeDoc?.backgroundId;
        if (!id) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    },
    [activeDoc?.backgroundId, activeIndex, withHistory]
  );

  const appendSegment = useCallback(
    async (entry: StoryMediaFile) => {
      const file = await downscaleStoryImageFile(entry.file);
      const doc = createDocumentFromFile({ file, mediaType: entry.mediaType });
      setSegments((prev) => {
        pushHistory(prev, activeIndex);
        const next = [...prev, doc];
        setActiveIndex(next.length - 1);
        setIsDirty(true);
        return next;
      });
    },
    [activeIndex, pushHistory]
  );

  const goToSegment = useCallback(
    (index: number) => {
      setActiveIndex(Math.max(0, Math.min(index, segments.length - 1)));
      setSelectedNodeId(null);
    },
    [segments.length]
  );

  const registerMediaDimensions = useCallback(
    (naturalW: number, naturalH: number) => {
      if (!activeDoc) return;
      const media = getMediaNode(activeDoc);
      if (!media || media.source.naturalWidth != null) return;
      const fit = defaultMediaTransform(naturalW, naturalH);
      setDefaultTransforms((prev) => (prev[media.id] ? prev : { ...prev, [media.id]: fit }));
      patchActiveDoc((doc) => {
        const m = getMediaNode(doc);
        if (!m) return doc;
        return {
          ...doc,
          nodes: doc.nodes.map((n) =>
            n.id === m.id
              ? {
                  ...m,
                  source: { ...m.source, naturalWidth: naturalW, naturalHeight: naturalH },
                  transform: fit,
                }
              : n
          ),
        };
      });
    },
    [activeDoc, patchActiveDoc]
  );

  const undo = useCallback(() => {
    const snap = undoStack.current.pop();
    if (!snap) return;
    redoStack.current.push({ segments: cloneSegments(segments), activeIndex });
    setUndoCount(undoStack.current.length);
    setRedoCount(redoStack.current.length);
    applySnapshot(snap);
    setIsDirty(true);
  }, [activeIndex, applySnapshot, segments]);

  const redo = useCallback(() => {
    const snap = redoStack.current.pop();
    if (!snap) return;
    undoStack.current.push({ segments: cloneSegments(segments), activeIndex });
    setUndoCount(undoStack.current.length);
    setRedoCount(redoStack.current.length);
    applySnapshot(snap);
    setIsDirty(true);
  }, [activeIndex, applySnapshot, segments]);

  const updateNodeTransform = useCallback(
    (nodeId: string, patch: Partial<Transform2D>) => {
      patchActiveDoc((doc) => ({
        ...doc,
        nodes: doc.nodes.map((n) =>
          n.id === nodeId ? { ...n, transform: { ...n.transform, ...patch } } : n
        ),
      }));
    },
    [patchActiveDoc]
  );

  const addSticker = useCallback(
    (emoji: string) => {
      const layer = createStickerLayer(emoji);
      withHistory((prev) =>
        prev.map((doc, i) => (i === activeIndex ? { ...doc, nodes: [...doc.nodes, layer] } : doc))
      );
      setSelectedNodeId(layer.id);
    },
    [activeIndex, withHistory]
  );

  const addTextLayer = useCallback(() => {
    const layer = createTextNode('');
    withHistory((prev) =>
      prev.map((doc, i) => (i === activeIndex ? { ...doc, nodes: [...doc.nodes, layer] } : doc))
    );
    setSelectedNodeId(layer.id);
    return layer.id;
  }, [activeIndex, withHistory]);

  const setTextNode = useCallback(
    (nodeId: string, patch: Partial<Pick<TextNode, 'text' | 'transform' | 'style'>>) => {
      const styleOnly =
        patch.style != null && patch.text === undefined && patch.transform === undefined;
      const apply = styleOnly ? withHistory : mutateLive;
      apply((prev) =>
        prev.map((doc, i) => {
          if (i !== activeIndex) return doc;
          return {
            ...doc,
            nodes: doc.nodes.map((n) => {
              if (n.id !== nodeId || n.type !== 'text') return n;
              return {
                ...n,
                ...patch,
                style: patch.style ? { ...n.style, ...patch.style } : n.style,
                transform: patch.transform ? { ...n.transform, ...patch.transform } : n.transform,
              };
            }),
          };
        })
      );
    },
    [activeIndex, mutateLive, withHistory]
  );

  const updateTextStyle = useCallback(
    (nodeId: string, stylePatch: Partial<TextNode['style']>) => {
      withHistory((prev) =>
        prev.map((doc, i) => {
          if (i !== activeIndex) return doc;
          return {
            ...doc,
            nodes: doc.nodes.map((n) =>
              n.id === nodeId && n.type === 'text' ? { ...n, style: { ...n.style, ...stylePatch } } : n
            ),
          };
        })
      );
    },
    [activeIndex, withHistory]
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      withHistory((prev) =>
        prev.map((doc, i) =>
          i === activeIndex
            ? { ...doc, nodes: doc.nodes.filter((n) => n.id !== nodeId || n.type === 'media') }
            : doc
        )
      );
      setSelectedNodeId((id) => (id === nodeId ? null : id));
    },
    [activeIndex, withHistory]
  );

  const markClean = useCallback(() => setIsDirty(false), []);

  const session: StorySession = useMemo(() => ({ segments }), [segments]);

  return {
    session,
    activeDoc,
    activeIndex,
    segmentCount: segments.length,
    isDirty,
    selectedNodeId,
    setSelectedNodeId,
    beginTransaction,
    commitTransaction,
    setMediaTransform,
    setMediaAdjust,
    setMediaAdjustWithHistory,
    replaceActiveMedia,
    appendSegment,
    goToSegment,
    registerMediaDimensions,
    markClean,
    undo,
    redo,
    canUndo: undoCount > 0,
    canRedo: redoCount > 0,
    addSticker,
    updateNodeTransform,
    deleteNode,
    addTextLayer,
    setTextNode,
    updateTextStyle,
  };
}
