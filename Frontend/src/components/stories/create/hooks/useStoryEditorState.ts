import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import { createId } from '@paralleldrive/cuid2';
import type {
  StoryMediaAdjust,
  StoryMediaFile,
  StorySlide,
  TextStoryLayer,
  Transform2D,
  VideoTrimRange,
} from '../types/storyEditor.types';
import { DEFAULT_MEDIA_ADJUST, DEFAULT_TRANSFORM } from '../types/storyEditor.types';
import { defaultMediaTransform, defaultTextTransform } from '../utils/storyTransform';
import { invalidateSlideMediaAsset } from '../utils/storyCompositionAssetCache';
import { createStickerLayer } from './useStoryEditorStickers';
import { useEditorTransaction } from './useEditorTransaction';

function createTextLayer(text = ''): TextStoryLayer {
  return {
    id: createId(),
    type: 'text',
    text,
    transform: defaultTextTransform(),
    style: { id: 'classic', align: 'center' },
  };
}

const MAX_HISTORY = 20;

type EditorSnapshot = {
  slides: StorySlide[];
  activeSlideIndex: number;
};

function cloneSlides(slides: StorySlide[]): StorySlide[] {
  return structuredClone(slides);
}

function createSlide(entry: StoryMediaFile): StorySlide {
  const previewUrl = URL.createObjectURL(entry.file);
  return {
    id: nanoid(),
    media: {
      file: entry.file,
      type: entry.mediaType,
      previewUrl,
    },
    mediaTransform: { ...DEFAULT_TRANSFORM },
    mediaAdjust: { ...DEFAULT_MEDIA_ADJUST },
    layers: [],
    ...(entry.mediaType === 'VIDEO' ? { videoTrim: { startMs: 0, endMs: 0 } } : {}),
  };
}

type UseStoryEditorStateOptions = {
  files: StoryMediaFile[];
  stageWidth: number;
  stageHeight: number;
};

export function useStoryEditorState({ files, stageWidth, stageHeight }: UseStoryEditorStateOptions) {
  const [slides, setSlides] = useState<StorySlide[]>(() => files.map(createSlide));
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [isDirty, setIsDirty] = useState(false);
  const [defaultTransforms, setDefaultTransforms] = useState<Record<string, Transform2D>>({});
  const undoStack = useRef<EditorSnapshot[]>([]);
  const redoStack = useRef<EditorSnapshot[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const slidesRef = useRef(slides);
  slidesRef.current = slides;

  useEffect(() => {
    return () => {
      slidesRef.current.forEach((s) => URL.revokeObjectURL(s.media.previewUrl));
    };
  }, []);

  const activeSlideIndexRef = useRef(activeSlideIndex);
  activeSlideIndexRef.current = activeSlideIndex;

  const pushHistory = useCallback((currentSlides: StorySlide[], currentIndex: number) => {
    undoStack.current.push({
      slides: cloneSlides(currentSlides),
      activeSlideIndex: currentIndex,
    });
    if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift();
    redoStack.current = [];
    setUndoCount(undoStack.current.length);
    setRedoCount(0);
  }, []);

  const { beginTransaction, commitTransaction, cancelTransaction, isInTransaction } = useEditorTransaction({
    pushHistory,
    getSlides: () => slidesRef.current,
    getActiveSlideIndex: () => activeSlideIndexRef.current,
    cloneSlides,
  });

  const applySnapshot = useCallback((snap: EditorSnapshot) => {
    cancelTransaction();
    setSlides(snap.slides);
    setActiveSlideIndex(Math.min(snap.activeSlideIndex, Math.max(0, snap.slides.length - 1)));
  }, [cancelTransaction]);

  const mutateSlides = useCallback(
    (mutate: (prev: StorySlide[]) => StorySlide[], recordHistory: boolean) => {
      setSlides((prev) => {
        if (recordHistory && !isInTransaction()) pushHistory(prev, activeSlideIndexRef.current);
        setIsDirty(true);
        return mutate(prev);
      });
    },
    [isInTransaction, pushHistory]
  );

  const withHistory = useCallback(
    (mutate: (prev: StorySlide[]) => StorySlide[]) => {
      mutateSlides(mutate, !isInTransaction());
    },
    [isInTransaction, mutateSlides]
  );

  const mutateLive = useCallback(
    (mutate: (prev: StorySlide[]) => StorySlide[]) => {
      mutateSlides(mutate, false);
    },
    [mutateSlides]
  );

  const activeSlide = slides[activeSlideIndex] ?? slides[0] ?? null;

  const setMediaTransform = useCallback(
    (transform: Transform2D | ((prev: Transform2D) => Transform2D)) => {
      mutateLive((prev) => {
        const idx = activeSlideIndex;
        const slide = prev[idx];
        if (!slide) return prev;
        const nextTransform =
          typeof transform === 'function' ? transform(slide.mediaTransform) : transform;
        return prev.map((s, i) => (i === idx ? { ...s, mediaTransform: nextTransform } : s));
      });
    },
    [activeSlideIndex, mutateLive]
  );

  const commitActiveSlide = useCallback(
    (slide: StorySlide) => {
      mutateLive((prev) => {
        const idx = activeSlideIndex;
        if (!prev[idx]) return prev;
        return prev.map((s, i) => (i === idx ? slide : s));
      });
      setIsDirty(true);
    },
    [activeSlideIndex, mutateLive]
  );

  const setMediaAdjust = useCallback(
    (adjust: StoryMediaAdjust) => {
      mutateLive((prev) =>
        prev.map((s, i) => (i === activeSlideIndex ? { ...s, mediaAdjust: adjust } : s))
      );
    },
    [activeSlideIndex, mutateLive]
  );

  const setMediaAdjustWithHistory = useCallback(
    (adjust: StoryMediaAdjust) => {
      withHistory((prev) =>
        prev.map((s, i) => (i === activeSlideIndex ? { ...s, mediaAdjust: adjust } : s))
      );
    },
    [activeSlideIndex, withHistory]
  );

  const setVideoTrimLive = useCallback(
    (trim: VideoTrimRange) => {
      mutateLive((prev) =>
        prev.map((s, i) => (i === activeSlideIndex ? { ...s, videoTrim: trim } : s))
      );
    },
    [activeSlideIndex, mutateLive]
  );

  const setVideoTrimWithHistory = useCallback(
    (trim: VideoTrimRange) => {
      withHistory((prev) =>
        prev.map((s, i) => (i === activeSlideIndex ? { ...s, videoTrim: trim } : s))
      );
    },
    [activeSlideIndex, withHistory]
  );

  const setVideoDurationMs = useCallback(
    (durationMs: number) => {
      setSlides((prev) =>
        prev.map((s, i) => {
          if (i !== activeSlideIndex || s.media.type !== 'VIDEO') return s;
          const endMs = s.videoTrim?.endMs && s.videoTrim.endMs > 0 ? s.videoTrim.endMs : durationMs;
          return {
            ...s,
            videoTrim: {
              startMs: s.videoTrim?.startMs ?? 0,
              endMs: Math.min(endMs, durationMs),
            },
          };
        })
      );
    },
    [activeSlideIndex]
  );

  const patchActiveSlide = useCallback(
    (patch: Partial<StorySlide>) => {
      withHistory((prev) => prev.map((s, i) => (i === activeSlideIndex ? { ...s, ...patch } : s)));
    },
    [activeSlideIndex, withHistory]
  );

  const updateActiveSlide = useCallback(
    (updater: (slide: StorySlide) => StorySlide) => {
      withHistory((prev) => prev.map((s, i) => (i === activeSlideIndex ? updater(s) : s)));
    },
    [activeSlideIndex, withHistory]
  );

  const replaceSlideMedia = useCallback(
    (slideId: string, file: File, previewUrl: string) => {
      withHistory((prev) =>
        prev.map((s) => {
          if (s.id !== slideId) return s;
          invalidateSlideMediaAsset(s.media.previewUrl);
          URL.revokeObjectURL(s.media.previewUrl);
          return {
            ...s,
            media: { ...s.media, file, previewUrl, naturalWidth: undefined, naturalHeight: undefined },
            mediaTransform: { ...DEFAULT_TRANSFORM },
          };
        })
      );
      setDefaultTransforms((prev) => {
        const next = { ...prev };
        delete next[slideId];
        return next;
      });
    },
    [withHistory]
  );

  const appendSlide = useCallback(
    (entry: StoryMediaFile) => {
      const slide = createSlide(entry);
      setSlides((prev) => {
        pushHistory(prev, activeSlideIndex);
        const next = [...prev, slide];
        setActiveSlideIndex(next.length - 1);
        setIsDirty(true);
        return next;
      });
      return slide.id;
    },
    [activeSlideIndex, pushHistory]
  );

  const goToSlide = useCallback(
    (index: number) => {
      setActiveSlideIndex(Math.max(0, Math.min(index, slides.length - 1)));
    },
    [slides.length]
  );

  const resetMediaTransform = useCallback(() => {
    if (!activeSlide) return;
    const fallback = defaultTransforms[activeSlide.id] ?? { ...DEFAULT_TRANSFORM };
    withHistory((prev) =>
      prev.map((s, i) =>
        i === activeSlideIndex ? { ...s, mediaTransform: { ...fallback } } : s
      )
    );
  }, [activeSlide, activeSlideIndex, defaultTransforms, withHistory]);

  const registerMediaDimensions = useCallback(
    (slideId: string, naturalW: number, naturalH: number) => {
      if (stageWidth <= 0 || stageHeight <= 0) return;
      const fit = defaultMediaTransform(naturalW, naturalH);
      setDefaultTransforms((prev) => (prev[slideId] ? prev : { ...prev, [slideId]: fit }));
      setSlides((prev) => {
        const idx = prev.findIndex((s) => s.id === slideId);
        if (idx < 0 || prev[idx]!.media.naturalWidth != null) return prev;
        return prev.map((s, i) =>
          i === idx
            ? {
                ...s,
                media: { ...s.media, naturalWidth: naturalW, naturalHeight: naturalH },
                mediaTransform: fit,
              }
            : s
        );
      });
    },
    [stageWidth, stageHeight]
  );

  const undo = useCallback(() => {
    const snap = undoStack.current.pop();
    if (!snap) return;
    redoStack.current.push({ slides: cloneSlides(slides), activeSlideIndex });
    setUndoCount(undoStack.current.length);
    setRedoCount(redoStack.current.length);
    applySnapshot(snap);
    setIsDirty(true);
  }, [activeSlideIndex, applySnapshot, slides]);

  const redo = useCallback(() => {
    const snap = redoStack.current.pop();
    if (!snap) return;
    undoStack.current.push({ slides: cloneSlides(slides), activeSlideIndex });
    setUndoCount(undoStack.current.length);
    setRedoCount(redoStack.current.length);
    applySnapshot(snap);
    setIsDirty(true);
  }, [activeSlideIndex, applySnapshot, slides]);

  const markClean = useCallback(() => setIsDirty(false), []);

  const addSticker = useCallback(
    (emoji: string) => {
      const layer = createStickerLayer(emoji);
      withHistory((prev) =>
        prev.map((s, i) => (i === activeSlideIndex ? { ...s, layers: [...s.layers, layer] } : s))
      );
      setSelectedLayerId(layer.id);
      return layer.id;
    },
    [activeSlideIndex, withHistory]
  );

  const updateLayerTransform = useCallback(
    (layerId: string, patch: Partial<Transform2D>) => {
      mutateLive((prev) =>
        prev.map((s, i) => {
          if (i !== activeSlideIndex) return s;
          return {
            ...s,
            layers: s.layers.map((l) =>
              l.id === layerId ? { ...l, transform: { ...l.transform, ...patch } } : l
            ),
          };
        })
      );
    },
    [activeSlideIndex, mutateLive]
  );

  const removeLayer = useCallback(
    (layerId: string) => {
      withHistory((prev) =>
        prev.map((s, i) =>
          i === activeSlideIndex ? { ...s, layers: s.layers.filter((l) => l.id !== layerId) } : s
        )
      );
      setSelectedLayerId((id) => (id === layerId ? null : id));
    },
    [activeSlideIndex, withHistory]
  );

  const addTextLayer = useCallback(() => {
    const layer = createTextLayer('');
    withHistory((prev) =>
      prev.map((s, i) => (i === activeSlideIndex ? { ...s, layers: [...s.layers, layer] } : s))
    );
    setSelectedLayerId(layer.id);
    return layer.id;
  }, [activeSlideIndex, withHistory]);

  const setTextLayer = useCallback(
    (layerId: string, patch: Partial<Pick<TextStoryLayer, 'text' | 'transform' | 'style'>>) => {
      const transformOnly =
        patch.transform != null && patch.text === undefined && patch.style === undefined;
      const apply = transformOnly ? mutateLive : withHistory;

      apply((prev) =>
        prev.map((s, i) => {
          if (i !== activeSlideIndex) return s;
          return {
            ...s,
            layers: s.layers.map((l) => {
              if (l.id !== layerId || l.type !== 'text') return l;
              return {
                ...l,
                ...patch,
                style: patch.style ? { ...l.style, ...patch.style } : l.style,
                transform: patch.transform ? { ...l.transform, ...patch.transform } : l.transform,
              };
            }),
          };
        })
      );
      if (!transformOnly) setIsDirty(true);
    },
    [activeSlideIndex, mutateLive, withHistory]
  );

  const updateTextLayerStyle = useCallback(
    (layerId: string, stylePatch: Partial<TextStoryLayer['style']>) => {
      withHistory((prev) =>
        prev.map((s, i) => {
          if (i !== activeSlideIndex) return s;
          return {
            ...s,
            layers: s.layers.map((l) =>
              l.id === layerId && l.type === 'text'
                ? { ...l, style: { ...l.style, ...stylePatch } }
                : l
            ),
          };
        })
      );
    },
    [activeSlideIndex, withHistory]
  );

  const slideCount = slides.length;
  const canUndo = undoCount > 0;
  const canRedo = redoCount > 0;

  return useMemo(
    () => ({
      slides,
      activeSlide,
      activeSlideIndex,
      setActiveSlideIndex: goToSlide,
      slideCount,
      isDirty,
      activeDefaultTransform: activeSlide
        ? (defaultTransforms[activeSlide.id] ?? { ...DEFAULT_TRANSFORM })
        : { ...DEFAULT_TRANSFORM },
      setMediaTransform,
      commitActiveSlide,
      setMediaAdjust,
      setMediaAdjustWithHistory,
      beginTransaction,
      commitTransaction,
      setVideoTrimLive,
      setVideoTrimWithHistory,
      setVideoDurationMs,
      patchActiveSlide,
      updateActiveSlide,
      replaceSlideMedia,
      appendSlide,
      goToSlide,
      resetMediaTransform,
      registerMediaDimensions,
      markClean,
      undo,
      redo,
      canUndo,
      canRedo,
      selectedLayerId,
      setSelectedLayerId,
      addSticker,
      updateLayerTransform,
      removeLayer,
      addTextLayer,
      setTextLayer,
      updateTextLayerStyle,
      selectLayer: setSelectedLayerId,
      deleteLayer: removeLayer,
    }),
    [
      slides,
      activeSlide,
      activeSlideIndex,
      slideCount,
      isDirty,
      defaultTransforms,
      setMediaTransform,
      commitActiveSlide,
      setMediaAdjust,
      setMediaAdjustWithHistory,
      beginTransaction,
      commitTransaction,
      setVideoTrimLive,
      setVideoTrimWithHistory,
      setVideoDurationMs,
      patchActiveSlide,
      updateActiveSlide,
      replaceSlideMedia,
      appendSlide,
      goToSlide,
      resetMediaTransform,
      registerMediaDimensions,
      markClean,
      undo,
      redo,
      canUndo,
      canRedo,
      selectedLayerId,
      addSticker,
      updateLayerTransform,
      removeLayer,
      addTextLayer,
      setTextLayer,
      updateTextLayerStyle,
    ]
  );
}
