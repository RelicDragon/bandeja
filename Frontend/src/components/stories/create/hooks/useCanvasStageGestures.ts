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
  const dragTargetRef = useRef<'media' | string | null>(null);
  const pinchTargetRef = useRef<'media' | string | null>(null);

  const handleTapSelect = useCallback(
    (event: Event) => {
      const mode = editorModeRef.current;
      if (mode !== 'IDLE' && mode !== 'LAYER_SELECTED') return;
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
      onDrag: ({ movement: [mx, my], pinching, cancel, first, last, memo, event }) => {
        if (disabled || pinching) {
          cancel();
          return memo;
        }
        const slide = liveSlideRef.current;
        if (!slide) return memo;

        const mode = editorModeRef.current;
        const selectedId = selectedLayerIdRef.current;

        if (first) {
          let target: 'media' | string = 'media';
          if (mode === 'LAYER_SELECTED' && selectedId) {
            target = selectedId;
          } else if (mode === 'IDLE' && event) {
            const el = event.currentTarget as HTMLElement | null;
            if (el) {
              const rect = el.getBoundingClientRect();
              const pe = event as PointerEvent;
              const { x, y } = screenPointToCanvas(pe.clientX, pe.clientY, rect);
              const hit = hitTestLayerAtPoint(slide.layers, x, y);
              if (hit) {
                target = hit.id;
                onSelectLayer(hit.id);
              }
            }
          }
          dragTargetRef.current = target;
          setActive(true);
          if (target === 'media') {
            return { x: slide.mediaTransform.x, y: slide.mediaTransform.y };
          }
          const layer = slide.layers.find((l) => l.id === target);
          if (!layer) {
            dragTargetRef.current = 'media';
            return { x: slide.mediaTransform.x, y: slide.mediaTransform.y };
          }
          return { x: layer.transform.x, y: layer.transform.y };
        }

        if (mode !== 'IDLE' && mode !== 'LAYER_SELECTED') {
          cancel();
          return memo;
        }

        const target = dragTargetRef.current;
        if (last) {
          dragTargetRef.current = null;
          setActive(false);
        }

        const start = memo as { x: number; y: number };
        const delta = toCanvasDelta(mx, my);

        if (target && target !== 'media') {
          const layer = slide.layers.find((l) => l.id === target);
          if (!layer) return memo;
          applyLayerTransform(target, {
            ...layer.transform,
            x: start.x + delta.x,
            y: start.y + delta.y,
          });
          return memo;
        }

        applyMedia({ ...slide.mediaTransform, x: start.x + delta.x, y: start.y + delta.y });
        return memo;
      },
      onPinch: ({ offset: [scaleMul, angleDelta], first, last, memo, origin }) => {
        if (disabled) return memo;
        const slide = liveSlideRef.current;
        if (!slide) return memo;

        const mode = editorModeRef.current;
        const selectedId = selectedLayerIdRef.current;

        if (first) {
          let target: 'media' | string = 'media';
          if (mode === 'LAYER_SELECTED' && selectedId) {
            target = selectedId;
          } else if (mode === 'IDLE') {
            const el = document.querySelector('[data-story-stage]');
            if (el) {
              const rect = el.getBoundingClientRect();
              const { x, y } = screenPointToCanvas(origin[0], origin[1], rect);
              const hit = hitTestLayerAtPoint(slide.layers, x, y);
              if (hit) {
                target = hit.id;
                onSelectLayer(hit.id);
              }
            }
          }
          pinchTargetRef.current = target;
          setActive(true);
          if (target !== 'media') {
            const layer = slide.layers.find((l) => l.id === target);
            layerPinchStartRef.current = layer
              ? { scale: layer.transform.scale, rotation: layer.transform.rotation }
              : null;
            pinchStartRef.current = null;
          } else {
            layerPinchStartRef.current = null;
            pinchStartRef.current = {
              scale: slide.mediaTransform.scale,
              rotation: slide.mediaTransform.rotation,
            };
          }
        }

        if (mode !== 'IDLE' && mode !== 'LAYER_SELECTED') return memo;

        const target = pinchTargetRef.current;
        if (target && target !== 'media') {
          const layer = slide.layers.find((l) => l.id === target);
          if (!layer || !layerPinchStartRef.current) return memo;
          const start = layerPinchStartRef.current;
          const rotation = start.rotation + angleDelta;
          applyLayerTransform(target, {
            ...layer.transform,
            scale: start.scale * scaleMul,
            rotation: last ? snapRotation(rotation) : rotation,
          });
          if (last) {
            layerPinchStartRef.current = null;
            pinchTargetRef.current = null;
            setActive(false);
          }
          return memo;
        }

        if (!pinchStartRef.current) {
          pinchStartRef.current = {
            scale: slide.mediaTransform.scale,
            rotation: slide.mediaTransform.rotation,
          };
        }
        const start = pinchStartRef.current;
        const rotation = start.rotation + angleDelta;
        applyMedia({
          ...slide.mediaTransform,
          scale: start.scale * scaleMul,
          rotation: last ? snapRotation(rotation) : rotation,
        });
        if (last) {
          pinchStartRef.current = null;
          pinchTargetRef.current = null;
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
