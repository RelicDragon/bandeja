import { useCallback, useEffect, useRef, useState } from 'react';
import type { StoryDocument } from '../types';
import { getMediaNode, patchMediaDimensions } from '../utils/document';
import { renderDocument } from '../utils/renderDocument';
import { defaultMediaTransform, STORY_CANVAS_HEIGHT, STORY_CANVAS_WIDTH } from '../utils/transform';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}

function ensureCanvasSize(canvas: HTMLCanvasElement, w: number, h: number): boolean {
  if (canvas.width === w && canvas.height === h) return false;
  canvas.width = w;
  canvas.height = h;
  return true;
}

/** Renders `renderDocument` (export path) into a display canvas sized to the stage. */
export function useCompositorPreview(
  doc: StoryDocument | null,
  stageWidth: number,
  stageHeight: number,
  options?: { hideNodeIds?: readonly string[]; interactive?: boolean }
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);
  const mediaUrl = doc ? getMediaNode(doc)?.source.previewUrl ?? '' : '';
  const hideNodeIds = options?.hideNodeIds;
  const hideKey = hideNodeIds?.join('\0') ?? '';
  const interactive = options?.interactive === true;

  useEffect(() => {
    if (!mediaUrl) {
      setSourceImage(null);
      return;
    }
    setSourceImage(null);
    let cancelled = false;
    void loadImage(mediaUrl)
      .then((img) => {
        if (!cancelled) setSourceImage(img);
      })
      .catch(() => {
        if (!cancelled) setSourceImage(null);
      });
    return () => {
      cancelled = true;
    };
  }, [mediaUrl]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      offscreenRef.current = null;
    };
  }, []);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const docSnapshot = doc;
    const img = sourceImage;
    if (!canvas || !docSnapshot || !img) return;

    const media = getMediaNode(docSnapshot);
    if (!media) return;

    const mediaW = media.source.naturalWidth ?? img.naturalWidth;
    const mediaH = media.source.naturalHeight ?? img.naturalHeight;
    if (mediaW <= 0 || mediaH <= 0) return;

    let paintDoc = docSnapshot;
    if (media.source.naturalWidth == null && img.naturalWidth > 0 && img.naturalHeight > 0) {
      paintDoc = patchMediaDimensions(
        docSnapshot,
        img.naturalWidth,
        img.naturalHeight,
        defaultMediaTransform(img.naturalWidth, img.naturalHeight)
      );
    }

    if (!offscreenRef.current) {
      offscreenRef.current = document.createElement('canvas');
    }
    const off = offscreenRef.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const displayW = Math.max(1, Math.round(stageWidth * dpr));
    const displayH = Math.max(1, Math.round(stageHeight * dpr));

    // During gestures: paint at display resolution (fast). Idle: full 1080×1920 then blit.
    const renderW = interactive ? displayW : STORY_CANVAS_WIDTH;
    const renderH = interactive ? displayH : STORY_CANVAS_HEIGHT;
    ensureCanvasSize(off, renderW, renderH);
    const ctx = off.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, renderW, renderH);
    if (interactive) {
      ctx.setTransform(renderW / STORY_CANVAS_WIDTH, 0, 0, renderH / STORY_CANVAS_HEIGHT, 0, 0);
    }

    const hidden = hideKey ? hideKey.split('\0') : undefined;
    renderDocument(ctx, paintDoc, img, hidden ? { hideNodeIds: hidden } : undefined);

    ensureCanvasSize(canvas, displayW, displayH);
    const display = canvas.getContext('2d');
    if (!display) return;
    display.setTransform(1, 0, 0, 1, 0, 0);
    display.clearRect(0, 0, displayW, displayH);
    display.drawImage(off, 0, 0, displayW, displayH);
  }, [doc, hideKey, interactive, sourceImage, stageHeight, stageWidth]);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(rafRef.current);
  }, [paint]);

  return {
    canvasRef,
    ready: sourceImage != null,
    sourceImage,
  };
}
