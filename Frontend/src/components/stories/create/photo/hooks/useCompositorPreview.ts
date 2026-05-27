import { useCallback, useEffect, useRef, useState } from 'react';
import type { StoryDocument } from '../types';
import { getMediaNode } from '../utils/document';
import { renderDocument } from '../utils/renderDocument';
import { STORY_CANVAS_HEIGHT, STORY_CANVAS_WIDTH } from '../utils/transform';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Renders `renderDocument` (export path) into a display canvas sized to the stage. */
export function useCompositorPreview(
  doc: StoryDocument | null,
  stageWidth: number,
  stageHeight: number
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);
  const mediaUrl = doc ? getMediaNode(doc)?.source.previewUrl ?? '' : '';

  useEffect(() => {
    if (!mediaUrl) {
      setSourceImage(null);
      return;
    }
    let cancelled = false;
    void loadImage(mediaUrl).then((img) => {
      if (!cancelled) setSourceImage(img);
    });
    return () => {
      cancelled = true;
    };
  }, [mediaUrl]);

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

    if (!offscreenRef.current) {
      offscreenRef.current = document.createElement('canvas');
    }
    const off = offscreenRef.current;
    off.width = STORY_CANVAS_WIDTH;
    off.height = STORY_CANVAS_HEIGHT;
    const ctx = off.getContext('2d');
    if (!ctx) return;

    renderDocument(ctx, docSnapshot, img);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(stageWidth * dpr));
    const h = Math.max(1, Math.round(stageHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const display = canvas.getContext('2d');
    if (!display) return;
    display.setTransform(1, 0, 0, 1, 0, 0);
    display.clearRect(0, 0, w, h);
    display.drawImage(off, 0, 0, w, h);
  }, [doc, sourceImage, stageHeight, stageWidth]);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(rafRef.current);
  }, [paint]);

  return { canvasRef, ready: sourceImage != null };
}
