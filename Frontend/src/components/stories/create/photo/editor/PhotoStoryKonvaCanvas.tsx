import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Transformer } from 'react-konva';
import type Konva from 'konva';
import { PhotoStoryKonvaSticker } from './PhotoStoryKonvaSticker';
import { PhotoStoryKonvaText } from './PhotoStoryKonvaText';
import { useCompositorPreview } from '../hooks/useCompositorPreview';
import type { StoryDocument, Transform2D } from '../types';
import { isStickerNode, isTextNode } from '../types';
import { getMediaNode, getOverlayNodes } from '../utils/document';
import { clampLayerTransform, clampMediaTransform, computeCoverScale } from '../utils/transform';
import { STORY_CANVAS_HEIGHT, STORY_CANVAS_WIDTH } from '../types';
import {
  konvaNodeScale,
  screenFixedTransformerMetrics,
} from '../utils/storyTransformerMetrics';

export const PHOTO_MEDIA_NODE_KEY = '__media__';

type PhotoStoryKonvaCanvasProps = {
  doc: StoryDocument;
  stageWidth: number;
  stageHeight: number;
  selectedNodeId: string | null;
  mediaSelected: boolean;
  gesturesEnabled: boolean;
  onSelectNode: (id: string | null, kind: 'media' | 'layer') => void;
  onMediaTransformChange: (patch: Partial<Transform2D>) => void;
  onLayerTransformChange: (nodeId: string, patch: Partial<Transform2D>) => void;
  onGestureStart: () => void;
  onGestureEnd: () => void;
  onLoadDimensions: (w: number, h: number) => void;
  editingTextId?: string | null;
};

function useHtmlImage(url: string): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!url) {
      setImg(null);
      return;
    }
    let cancelled = false;
    const el = new Image();
    el.crossOrigin = 'anonymous';
    el.decoding = 'async';
    el.onload = () => {
      if (!cancelled) setImg(el);
    };
    el.onerror = () => {
      if (!cancelled) setImg(null);
    };
    el.src = url;
    return () => {
      cancelled = true;
      el.onload = null;
    };
  }, [url]);
  return img;
}

function PhotoStoryKonvaCanvasInner({
  doc,
  stageWidth,
  stageHeight,
  selectedNodeId,
  mediaSelected,
  gesturesEnabled,
  onSelectNode,
  onMediaTransformChange,
  onLayerTransformChange,
  onGestureStart,
  onGestureEnd,
  onLoadDimensions,
  editingTextId = null,
}: PhotoStoryKonvaCanvasProps) {
  const stageScale = stageWidth / STORY_CANVAS_WIDTH;
  const [transformingNodeScale, setTransformingNodeScale] = useState<number | null>(null);
  const { canvasRef, ready: previewReady } = useCompositorPreview(doc, stageWidth, stageHeight);
  const media = getMediaNode(doc);
  const overlays = getOverlayNodes(doc);
  const previewUrl = media?.source.previewUrl ?? '';
  const sourceImg = useHtmlImage(previewUrl);

  const transformerRef = useRef<Konva.Transformer>(null);
  const mediaRef = useRef<Konva.Image>(null);
  const layerRefs = useRef<Map<string, Konva.Node>>(new Map());
  const dimensionsReportedRef = useRef(false);

  const mediaW = media?.source.naturalWidth ?? sourceImg?.naturalWidth ?? 0;
  const mediaH = media?.source.naturalHeight ?? sourceImg?.naturalHeight ?? 0;

  useEffect(() => {
    dimensionsReportedRef.current = false;
  }, [previewUrl]);

  useEffect(() => {
    if (!sourceImg || sourceImg.naturalWidth <= 0 || dimensionsReportedRef.current) return;
    dimensionsReportedRef.current = true;
    onLoadDimensions(sourceImg.naturalWidth, sourceImg.naturalHeight);
  }, [sourceImg, onLoadDimensions]);

  const selectionNodeScale = useMemo(() => {
    if (mediaSelected) return media?.transform.scale ?? 1;
    if (!selectedNodeId) return 1;
    const node = overlays.find((n) => n.id === selectedNodeId);
    return node?.transform.scale ?? 1;
  }, [mediaSelected, media?.transform.scale, overlays, selectedNodeId]);

  const transformerMetrics = useMemo(
    () =>
      screenFixedTransformerMetrics(stageScale, transformingNodeScale ?? selectionNodeScale),
    [stageScale, selectionNodeScale, transformingNodeScale]
  );

  const mtx = media?.transform.x ?? 0;
  const mty = media?.transform.y ?? 0;
  const mts = media?.transform.scale ?? 1;
  const mtr = media?.transform.rotation ?? 0;

  useEffect(() => {
    const tr = transformerRef.current;
    if (!tr) return;
    if (mediaSelected && mediaRef.current) {
      tr.nodes([mediaRef.current]);
    } else {
      const node =
        selectedNodeId && selectedNodeId !== editingTextId
          ? layerRefs.current.get(selectedNodeId)
          : null;
      tr.nodes(node ? [node] : []);
    }
    tr.forceUpdate();
    tr.getLayer()?.batchDraw();
  }, [editingTextId, mediaSelected, selectedNodeId, sourceImg, overlays]);

  const handleTransformEnd = useCallback(
    (target: Konva.Node, isMedia: boolean, layerId?: string) => {
      const scaleX = target.scaleX();
      const rotation = target.rotation();
      const x = target.x();
      const y = target.y();
      target.scaleX(1);
      target.scaleY(1);

      if (isMedia) {
        const base = computeCoverScale(mediaW, mediaH);
        const next = clampMediaTransform(
          { x: x - STORY_CANVAS_WIDTH / 2, y: y - STORY_CANVAS_HEIGHT / 2, scale: scaleX, rotation },
          base
        );
        onMediaTransformChange(next);
        target.position({ x: STORY_CANVAS_WIDTH / 2 + next.x, y: STORY_CANVAS_HEIGHT / 2 + next.y });
        target.rotation(next.rotation);
      } else if (layerId) {
        const next = clampLayerTransform({ x, y, scale: scaleX, rotation });
        onLayerTransformChange(layerId, next);
        target.position({ x: next.x, y: next.y });
        target.rotation(next.rotation);
      }
      onGestureEnd();
    },
    [mediaW, mediaH, onGestureEnd, onLayerTransformChange, onMediaTransformChange]
  );

  const handleTransformerEnd = useCallback(() => {
    setTransformingNodeScale(null);
    const target = transformerRef.current?.nodes()[0];
    if (!target) return;
    if (mediaSelected && target === mediaRef.current) {
      handleTransformEnd(target, true);
      return;
    }
    if (selectedNodeId) handleTransformEnd(target, false, selectedNodeId);
  }, [handleTransformEnd, mediaSelected, selectedNodeId]);

  const handleTransforming = useCallback(() => {
    const target = transformerRef.current?.nodes()[0];
    if (!target) return;
    const nextScale = konvaNodeScale(target);
    setTransformingNodeScale((prev) => (prev != null && Math.abs(prev - nextScale) < 0.01 ? prev : nextScale));
    transformerRef.current?.forceUpdate();
  }, []);

  const styleTransformerAnchor = useCallback(
    (anchor: Konva.Rect) => {
      const target = transformerRef.current?.nodes()[0];
      const metrics = screenFixedTransformerMetrics(stageScale, konvaNodeScale(target));
      anchor.width(metrics.anchorSize);
      anchor.height(metrics.anchorSize);
      anchor.cornerRadius(metrics.cornerRadius);
      anchor.hitStrokeWidth(metrics.hitStrokeWidth);
    },
    [stageScale]
  );

  if (!media || !sourceImg || mediaW <= 0 || mediaH <= 0) return null;

  return (
    <div className="absolute inset-0">
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 block h-full w-full"
        aria-hidden
      />
      <Stage
        width={stageWidth}
        height={stageHeight}
        scaleX={stageScale}
        scaleY={stageScale}
        style={{ touchAction: 'none', position: 'absolute', inset: 0, opacity: previewReady ? 1 : 0 }}
        onMouseDown={(e) => {
          if (!gesturesEnabled) return;
          if (e.target === e.target.getStage()) onSelectNode(null, 'layer');
        }}
        onTouchStart={(e) => {
          if (!gesturesEnabled) return;
          if (e.target === e.target.getStage()) onSelectNode(null, 'layer');
        }}
      >
        <Layer listening={gesturesEnabled} name="photo-media-layer">
          <KonvaImage
            ref={mediaRef}
            name="photo-media"
            image={sourceImg}
            opacity={0}
            x={STORY_CANVAS_WIDTH / 2 + mtx}
            y={STORY_CANVAS_HEIGHT / 2 + mty}
            offsetX={mediaW / 2}
            offsetY={mediaH / 2}
            width={mediaW}
            height={mediaH}
            scaleX={mts}
            scaleY={mts}
            rotation={mtr}
            draggable={false}
            listening={gesturesEnabled}
            onClick={() => onSelectNode(PHOTO_MEDIA_NODE_KEY, 'media')}
            onTap={() => onSelectNode(PHOTO_MEDIA_NODE_KEY, 'media')}
          />
        </Layer>

        <Layer listening={gesturesEnabled} name="photo-overlay-layer">
          {overlays.map((node) => {
            if (isStickerNode(node)) {
              return (
                <PhotoStoryKonvaSticker
                  key={node.id}
                  node={node}
                  isSelected={selectedNodeId === node.id}
                  interactionOnly
                  gesturesEnabled={gesturesEnabled}
                  setLayerRef={(id, el) => {
                    if (el) layerRefs.current.set(id, el);
                    else layerRefs.current.delete(id);
                  }}
                  onSelect={() => onSelectNode(node.id, 'layer')}
                  onGestureStart={onGestureStart}
                  onGestureEnd={onGestureEnd}
                  onDragEnd={(x, y) => onLayerTransformChange(node.id, { x, y })}
                />
              );
            }
            if (isTextNode(node)) {
              const isEditing = node.id === editingTextId;
              const isSelected = selectedNodeId === node.id && !isEditing;
              return (
                <PhotoStoryKonvaText
                  key={node.id}
                  node={node}
                  isEditing={isEditing}
                  isSelected={isSelected}
                  interactionOnly
                  gesturesEnabled={gesturesEnabled}
                  setLayerRef={(id, el) => {
                    if (el) layerRefs.current.set(id, el);
                    else layerRefs.current.delete(id);
                  }}
                  onSelect={() => onSelectNode(node.id, 'layer')}
                  onGestureStart={onGestureStart}
                  onGestureEnd={onGestureEnd}
                  onDragEnd={(x, y) => onLayerTransformChange(node.id, { x, y })}
                />
              );
            }
            return null;
          })}

          <Transformer
            ref={transformerRef}
            rotateEnabled
            anchorSize={transformerMetrics.anchorSize}
            anchorCornerRadius={transformerMetrics.cornerRadius}
            rotateAnchorOffset={transformerMetrics.rotateOffset}
            borderStrokeWidth={transformerMetrics.borderStrokeWidth}
            padding={2}
            listening
            anchorStyleFunc={styleTransformerAnchor}
            enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
            boundBoxFunc={(oldBox, newBox) => {
              if (newBox.width < 16 || newBox.height < 16) return oldBox;
              return newBox;
            }}
            onTransformStart={onGestureStart}
            onTransform={handleTransforming}
            onTransformEnd={handleTransformerEnd}
          />
        </Layer>
      </Stage>
    </div>
  );
}

export const PhotoStoryKonvaCanvas = memo(PhotoStoryKonvaCanvasInner);
