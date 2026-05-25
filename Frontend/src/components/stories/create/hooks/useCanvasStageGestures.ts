import { useCallback, useRef, type RefObject } from 'react';
import { useGesture } from '@use-gesture/react';
import type { StoryEditorMode, StorySlide, Transform2D } from '../types/storyEditor.types';
import { hitTestLayerAtPoint, screenPointToCanvas } from '../utils/storyCanvasHitTest';
import { clampMediaTransform, snapRotation } from '../utils/storyTransform';

type UseCanvasStageGesturesOptions = {
  liveSlideRef: RefObject<StorySlide | null>;
  stageScale: number;
  coverScale: number;
  editorMode: StoryEditorMode;
  selectedLayerId: string | null;
  disabled: boolean;
  onCommit: (slide: StorySlide) => void;
  onSelectLayer: (layerId: string | null) => void;
  onLayerEditStart?: (layerId: string) => void;
  onGestureStart?: () => void;
  onGestureEnd?: () => void;
  onGestureActiveChange?: (active: boolean) => void;
  requestRedraw: () => void;
};

export function useCanvasStageGestures({
  liveSlideRef,
  stageScale,
  coverScale,
  editorMode,
  selectedLayerId,
  disabled,
  onCommit,
  onSelectLayer,
  onLayerEditStart,
  onGestureStart,
  onGestureEnd,
  onGestureActiveChange,
  requestRedraw,
}: UseCanvasStageGesturesOptions) {
  const coverScaleRef = useRef(coverScale);
  coverScaleRef.current = coverScale;
  const gestureActiveRef = useRef(false);
  const selectedLayerIdRef = useRef(selectedLayerId);
  selectedLayerIdRef.current = selectedLayerId;
  const editorModeRef = useRef(editorMode);
  editorModeRef.current = editorMode;
  const lastTapRef = useRef<{ id: string; at: number } | null>(null);

  const setActive = useCallback(
    (active: boolean) => {
      if (gestureActiveRef.current === active) return;
      gestureActiveRef.current = active;
      onGestureActiveChange?.(active);
      if (active) onGestureStart?.();
      else {
        const slide = liveSlideRef.current;
        if (slide) onCommit(slide);
        onGestureEnd?.();
      }
    },
    [liveSlideRef, onCommit, onGestureActiveChange, onGestureEnd, onGestureStart]
  );

  const applyMedia = useCallback(
    (next: Transform2D) => {
      const slide = liveSlideRef.current;
      if (!slide) return;
      liveSlideRef.current = {
        ...slide,
        mediaTransform: clampMediaTransform(next, coverScaleRef.current),
      };
      requestRedraw();
    },
    [liveSlideRef, requestRedraw]
  );

  const applyLayerTransform = useCallback(
    (layerId: string, next: Transform2D) => {
      const slide = liveSlideRef.current;
      if (!slide) return;
      liveSlideRef.current = {
        ...slide,
        layers: slide.layers.map((l) =>
          l.id === layerId ? { ...l, transform: next } : l
        ),
      };
      requestRedraw();
    },
    [liveSlideRef, requestRedraw]
  );

  const toCanvasDelta = useCallback(
    (dx: number, dy: number) => ({ x: dx / stageScale, y: dy / stageScale }),
    [stageScale]
  );

  const pinchStartRef = useRef<{ scale: number; rotation: number } | null>(null);
  const layerPinchStartRef = useRef<{ scale: number; rotation: number } | null>(null);

  const handleTapSelect = useCallback(
    (event: Event) => {
      if (editorModeRef.current !== 'IDLE') return;
      const target = event.currentTarget as HTMLElement | null;
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const pe = event as PointerEvent;
      const { x, y } = screenPointToCanvas(pe.clientX, pe.clientY, rect);
      const slide = liveSlideRef.current;
      if (!slide) return;
      const hit = hitTestLayerAtPoint(slide.layers, x, y);
      if (hit) {
        const now = Date.now();
        const last = lastTapRef.current;
        if (last?.id === hit.id && now - last.at < 320 && hit.type === 'text') {
          onLayerEditStart?.(hit.id);
          lastTapRef.current = null;
        } else {
          lastTapRef.current = { id: hit.id, at: now };
          onSelectLayer(hit.id);
        }
      } else {
        onSelectLayer(null);
      }
    },
    [liveSlideRef, onLayerEditStart, onSelectLayer]
  );

  return useGesture(
    {
      onDrag: ({ movement: [mx, my], pinching, cancel, first, last, memo }) => {
        if (disabled || pinching) {
          cancel();
          return memo;
        }
        const slide = liveSlideRef.current;
        if (!slide) return memo;

        const mode = editorModeRef.current;
        const layerId = selectedLayerIdRef.current;

        if (mode === 'LAYER_SELECTED' && layerId) {
          const layer = slide.layers.find((l) => l.id === layerId);
          if (!layer) return memo;
          if (first) {
            setActive(true);
            return { x: layer.transform.x, y: layer.transform.y };
          }
          const start = memo as { x: number; y: number };
          const delta = toCanvasDelta(mx, my);
          applyLayerTransform(layerId, {
            ...layer.transform,
            x: start.x + delta.x,
            y: start.y + delta.y,
          });
          if (last) setActive(false);
          return memo;
        }

        if (mode !== 'IDLE') {
          cancel();
          return memo;
        }

        if (first) {
          setActive(true);
          return { x: slide.mediaTransform.x, y: slide.mediaTransform.y };
        }
        const start = memo as { x: number; y: number };
        const delta = toCanvasDelta(mx, my);
        applyMedia({ ...slide.mediaTransform, x: start.x + delta.x, y: start.y + delta.y });
        if (last) setActive(false);
        return memo;
      },
      onPinch: ({ offset: [scaleMul, angleDelta], first, last, memo }) => {
        if (disabled) return memo;
        const slide = liveSlideRef.current;
        if (!slide) return memo;

        const mode = editorModeRef.current;
        const layerId = selectedLayerIdRef.current;

        if (mode === 'LAYER_SELECTED' && layerId) {
          const layer = slide.layers.find((l) => l.id === layerId);
          if (!layer) return memo;
          if (first || !layerPinchStartRef.current) {
            setActive(true);
            layerPinchStartRef.current = {
              scale: layer.transform.scale,
              rotation: layer.transform.rotation,
            };
          }
          const start = layerPinchStartRef.current!;
          const rotation = start.rotation + angleDelta;
          applyLayerTransform(layerId, {
            ...layer.transform,
            scale: start.scale * scaleMul,
            rotation: last ? snapRotation(rotation) : rotation,
          });
          if (last) {
            layerPinchStartRef.current = null;
            setActive(false);
          }
          return memo;
        }

        if (mode !== 'IDLE') return memo;

        if (first || !pinchStartRef.current) {
          setActive(true);
          pinchStartRef.current = {
            scale: slide.mediaTransform.scale,
            rotation: slide.mediaTransform.rotation,
          };
        }
        const start = pinchStartRef.current!;
        const rotation = start.rotation + angleDelta;
        applyMedia({
          ...slide.mediaTransform,
          scale: start.scale * scaleMul,
          rotation: last ? snapRotation(rotation) : rotation,
        });
        if (last) {
          pinchStartRef.current = null;
          setActive(false);
        }
        return memo;
      },
      onClick: ({ event }) => {
        if (disabled) return;
        handleTapSelect(event);
      },
    },
    { drag: { filterTaps: true }, pinch: { rubberband: true }, enabled: !disabled }
  );
}
