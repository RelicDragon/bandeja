import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { Stage, Layer, Transformer, Rect } from 'react-konva';
import type Konva from 'konva';
import { PhotoStoryKonvaSticker } from './PhotoStoryKonvaSticker';
import { PhotoStoryKonvaText } from './PhotoStoryKonvaText';
import { useCompositorPreview } from '../hooks/useCompositorPreview';
import type { StoryDocument, Transform2D } from '../types';
import { isStickerNode, isTextNode } from '../types';
import { getMediaNode, getOverlayNodes } from '../utils/document';
import { clampLayerTransform } from '../utils/transform';
import { STORY_CANVAS_HEIGHT, STORY_CANVAS_WIDTH } from '../types';
import {
  TRANSFORMER_ANCHOR_FILL,
  TRANSFORMER_ANCHOR_STROKE,
  TRANSFORMER_BORDER_COLOR,
  screenFixedTransformerMetrics,
  stageVisualScale,
} from '../utils/storyTransformerMetrics';

/** Tap background to deselect — not a selectable object (IG crop-window model). */
export const PHOTO_MEDIA_NODE_KEY = '__media__';

type PhotoStoryKonvaCanvasProps = {
  doc: StoryDocument;
  stageWidth: number;
  stageHeight: number;
  selectedNodeId: string | null;
  gesturesEnabled: boolean;
  onSelectNode: (id: string | null, kind: 'media' | 'layer') => void;
  onLayerTransformChange: (nodeId: string, patch: Partial<Transform2D>) => void;
  onGestureStart: () => void;
  onGestureEnd: () => void;
  onLoadDimensions: (w: number, h: number) => void;
  editingTextId?: string | null;
  onHandlesActiveChange?: (active: boolean) => void;
};

function PhotoStoryKonvaCanvasInner({
  doc,
  stageWidth,
  stageHeight,
  selectedNodeId,
  gesturesEnabled,
  onSelectNode,
  onLayerTransformChange,
  onGestureStart,
  onGestureEnd,
  onLoadDimensions,
  editingTextId = null,
  onHandlesActiveChange,
}: PhotoStoryKonvaCanvasProps) {
  const stageScale = stageWidth / STORY_CANVAS_WIDTH;
  const stageRef = useRef<Konva.Stage>(null);
  const {
    canvasRef,
    ready: previewReady,
    sourceImage,
  } = useCompositorPreview(doc, stageWidth, stageHeight);
  const media = getMediaNode(doc);
  const overlays = getOverlayNodes(doc);
  const previewUrl = media?.source.previewUrl ?? '';

  const transformerRef = useRef<Konva.Transformer>(null);
  const layerRefs = useRef<Map<string, Konva.Node>>(new Map());
  const dimensionsReportedRef = useRef(false);
  const onHandlesActiveChangeRef = useRef(onHandlesActiveChange);
  onHandlesActiveChangeRef.current = onHandlesActiveChange;

  const mediaW = media?.source.naturalWidth ?? sourceImage?.naturalWidth ?? 0;
  const mediaH = media?.source.naturalHeight ?? sourceImage?.naturalHeight ?? 0;

  useEffect(() => {
    dimensionsReportedRef.current = false;
  }, [previewUrl]);

  useEffect(() => {
    if (!sourceImage || sourceImage.naturalWidth <= 0 || dimensionsReportedRef.current) return;
    dimensionsReportedRef.current = true;
    onLoadDimensions(sourceImage.naturalWidth, sourceImage.naturalHeight);
  }, [sourceImage, onLoadDimensions]);

  const transformerMetrics = useMemo(
    () => screenFixedTransformerMetrics(stageVisualScale(stageRef.current, stageScale)),
    [stageScale]
  );

  const selectedLayerTransform = useMemo(() => {
    if (!selectedNodeId || selectedNodeId === editingTextId) return null;
    const node = overlays.find((n) => n.id === selectedNodeId);
    return node?.transform ?? null;
  }, [editingTextId, overlays, selectedNodeId]);

  const syncTransformer = useCallback(() => {
    const tr = transformerRef.current;
    if (!tr) return;
    const node =
      selectedNodeId && selectedNodeId !== editingTextId
        ? layerRefs.current.get(selectedNodeId)
        : null;
    tr.nodes(node ? [node] : []);
    tr.forceUpdate();
    tr.getLayer()?.batchDraw();
  }, [editingTextId, selectedNodeId]);

  useEffect(() => {
    syncTransformer();
  }, [syncTransformer, sourceImage, overlays, selectedLayerTransform]);

  const handleTransformEnd = useCallback(
    (target: Konva.Node, layerId: string) => {
      const next = clampLayerTransform({
        x: target.x(),
        y: target.y(),
        scale: target.scaleX(),
        rotation: target.rotation(),
      });
      onLayerTransformChange(layerId, next);
      target.scaleX(next.scale);
      target.scaleY(next.scale);
      target.position({ x: next.x, y: next.y });
      target.rotation(next.rotation);
      onGestureEnd();
      onHandlesActiveChangeRef.current?.(false);
    },
    [onGestureEnd, onLayerTransformChange]
  );

  const handleTransformerEnd = useCallback(() => {
    const target = transformerRef.current?.nodes()[0];
    if (!target || !selectedNodeId) {
      onHandlesActiveChangeRef.current?.(false);
      return;
    }
    handleTransformEnd(target, selectedNodeId);
  }, [handleTransformEnd, selectedNodeId]);

  const handleTransformerLive = useCallback(() => {
    const target = transformerRef.current?.nodes()[0];
    if (!target || !selectedNodeId) return;
    const raw = {
      x: target.x(),
      y: target.y(),
      scale: target.scaleX(),
      rotation: target.rotation(),
    };
    const next = clampLayerTransform(raw);
    onLayerTransformChange(selectedNodeId, next);
    const needsSnap =
      Math.abs(next.x - raw.x) > 0.5 ||
      Math.abs(next.y - raw.y) > 0.5 ||
      Math.abs(next.scale - raw.scale) > 0.001 ||
      Math.abs(next.rotation - raw.rotation) > 0.1;
    if (needsSnap) {
      target.position({ x: next.x, y: next.y });
      target.scaleX(next.scale);
      target.scaleY(next.scale);
      target.rotation(next.rotation);
    }
  }, [onLayerTransformChange, selectedNodeId]);

  const applyTransformerChrome = useCallback(() => {
    const tr = transformerRef.current;
    if (!tr) return;
    const metrics = screenFixedTransformerMetrics(stageVisualScale(stageRef.current, stageScale));
    tr.anchorSize(metrics.anchorSize);
    tr.rotateAnchorOffset(metrics.rotateOffset);
    tr.borderStrokeWidth(metrics.borderStrokeWidth);
    tr.forceUpdate();
  }, [stageScale]);

  useEffect(() => {
    applyTransformerChrome();
  }, [applyTransformerChrome, transformerMetrics]);

  const styleTransformerAnchor = useCallback(
    (anchor: Konva.Rect) => {
      const metrics = screenFixedTransformerMetrics(stageVisualScale(stageRef.current, stageScale));
      const name = anchor.name();
      const isRotate = name === 'rotater';
      const size = isRotate ? metrics.anchorSize * 0.9 : metrics.anchorSize;
      anchor.width(size);
      anchor.height(size);
      anchor.offsetX(size / 2);
      anchor.offsetY(size / 2);
      anchor.cornerRadius(size / 2);
      anchor.fill(TRANSFORMER_ANCHOR_FILL);
      anchor.stroke(TRANSFORMER_ANCHOR_STROKE);
      anchor.strokeWidth(metrics.anchorStrokeWidth);
      anchor.hitStrokeWidth(metrics.hitStrokeWidth);
      anchor.shadowEnabled(true);
      anchor.shadowColor('rgba(0,0,0,0.45)');
      anchor.shadowBlur(8 / Math.max(stageVisualScale(stageRef.current, stageScale), 1e-6));
      anchor.shadowOpacity(0.7);
      anchor.shadowOffsetY(1 / Math.max(stageVisualScale(stageRef.current, stageScale), 1e-6));
    },
    [stageScale]
  );

  const deselect = useCallback(() => {
    if (!gesturesEnabled) return;
    onSelectNode(null, 'layer');
  }, [gesturesEnabled, onSelectNode]);

  if (!media || !sourceImage || mediaW <= 0 || mediaH <= 0) return null;

  const layerSelected =
    gesturesEnabled && selectedNodeId != null && selectedNodeId !== editingTextId;

  return (
    <div className="absolute inset-0">
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 block h-full w-full"
        aria-hidden
      />
      <Stage
        ref={stageRef}
        width={stageWidth}
        height={stageHeight}
        scaleX={stageScale}
        scaleY={stageScale}
        style={{ touchAction: 'none', position: 'absolute', inset: 0, opacity: previewReady ? 1 : 0 }}
        onMouseDown={(e) => {
          if (e.target === e.target.getStage() || e.target.name() === 'photo-deselect-hit') {
            deselect();
          }
        }}
        onTouchStart={(e) => {
          if (e.target === e.target.getStage() || e.target.name() === 'photo-deselect-hit') {
            deselect();
          }
        }}
      >
        {/* Full-frame hit target: tap empty photo area deselects layers (IG). */}
        <Layer listening={gesturesEnabled} name="photo-hit-layer">
          <Rect
            name="photo-deselect-hit"
            x={0}
            y={0}
            width={STORY_CANVAS_WIDTH}
            height={STORY_CANVAS_HEIGHT}
            fill="rgba(0,0,0,0.001)"
            listening={gesturesEnabled}
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
                  onDragMove={(x, y) => onLayerTransformChange(node.id, { x, y })}
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
                  onDragMove={(x, y) => onLayerTransformChange(node.id, { x, y })}
                  onDragEnd={(x, y) => onLayerTransformChange(node.id, { x, y })}
                />
              );
            }
            return null;
          })}

          <Transformer
            ref={transformerRef}
            rotateEnabled
            keepRatio
            flipEnabled={false}
            visible={layerSelected}
            anchorSize={transformerMetrics.anchorSize}
            anchorCornerRadius={transformerMetrics.cornerRadius}
            rotateAnchorOffset={transformerMetrics.rotateOffset}
            borderStroke={TRANSFORMER_BORDER_COLOR}
            borderStrokeWidth={transformerMetrics.borderStrokeWidth}
            anchorFill={TRANSFORMER_ANCHOR_FILL}
            anchorStroke={TRANSFORMER_ANCHOR_STROKE}
            anchorStrokeWidth={transformerMetrics.anchorStrokeWidth}
            padding={4}
            listening
            anchorStyleFunc={styleTransformerAnchor}
            enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
            boundBoxFunc={(oldBox, newBox) => {
              if (newBox.width < 24 || newBox.height < 24) return oldBox;
              return newBox;
            }}
            onTransformStart={() => {
              onHandlesActiveChangeRef.current?.(true);
              onGestureStart();
            }}
            onTransform={() => {
              applyTransformerChrome();
              handleTransformerLive();
            }}
            onTransformEnd={handleTransformerEnd}
          />
        </Layer>
      </Stage>
    </div>
  );
}

export const PhotoStoryKonvaCanvas = memo(PhotoStoryKonvaCanvasInner);
