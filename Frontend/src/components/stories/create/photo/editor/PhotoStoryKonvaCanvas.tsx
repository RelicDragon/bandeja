import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Transformer } from 'react-konva';
import type Konva from 'konva';
import { PhotoStoryKonvaSticker } from './PhotoStoryKonvaSticker';
import { PhotoStoryKonvaText } from './PhotoStoryKonvaText';
import type { StoryDocument, Transform2D } from '../types';
import { isStickerNode, isTextNode } from '../types';
import { getMediaNode, getOverlayNodes } from '../utils/document';
import { clampLayerTransform, clampMediaTransform, computeCoverScale } from '../utils/transform';
import { STORY_CANVAS_HEIGHT, STORY_CANVAS_WIDTH } from '../types';
import { buildPreviewFilteredImage } from '../utils/previewFilteredImage';

export const PHOTO_MEDIA_NODE_KEY = '__media__';

const TRANSFORMER_ANCHOR_SCREEN_PX = 22;
const TRANSFORMER_ROTATE_OFFSET_SCREEN_PX = 40;
const TRANSFORMER_HIT_SCREEN_PX = 44;

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
  const touchAnchorPx = TRANSFORMER_ANCHOR_SCREEN_PX / stageScale;
  const touchRotateOffsetPx = TRANSFORMER_ROTATE_OFFSET_SCREEN_PX / stageScale;
  const touchHitPx = TRANSFORMER_HIT_SCREEN_PX / stageScale;
  const media = getMediaNode(doc);
  const overlays = getOverlayNodes(doc);
  const previewUrl = media?.source.previewUrl ?? '';
  const sourceImg = useHtmlImage(previewUrl);
  const [displayImg, setDisplayImg] = useState<HTMLImageElement | null>(null);
  const adjust = media?.adjust;

  useEffect(() => {
    if (!sourceImg) {
      setDisplayImg(null);
      return;
    }
    let cancelled = false;
    void buildPreviewFilteredImage(sourceImg, adjust ?? { brightness: 100, contrast: 100, saturation: 100 }).then(
      (img) => {
        if (!cancelled) setDisplayImg(img);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [sourceImg, adjust]);

  const mediaImg = displayImg ?? sourceImg;

  const transformerRef = useRef<Konva.Transformer>(null);
  const mediaRef = useRef<Konva.Image>(null);
  const layerRefs = useRef<Map<string, Konva.Node>>(new Map());
  const dimensionsReportedRef = useRef(false);

  const mediaW = media?.source.naturalWidth ?? mediaImg?.naturalWidth ?? 0;
  const mediaH = media?.source.naturalHeight ?? mediaImg?.naturalHeight ?? 0;

  useEffect(() => {
    dimensionsReportedRef.current = false;
  }, [previewUrl]);

  useEffect(() => {
    if (!mediaImg || mediaImg.naturalWidth <= 0 || dimensionsReportedRef.current) return;
    dimensionsReportedRef.current = true;
    onLoadDimensions(mediaImg.naturalWidth, mediaImg.naturalHeight);
  }, [mediaImg, onLoadDimensions]);

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
  }, [editingTextId, mediaSelected, selectedNodeId, mediaImg, overlays]);

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
          { x: x - STORY_CANVAS_WIDTH / 2, y: y - STORY_CANVAS_HEIGHT / 2, scale: scaleX * base, rotation },
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
    const target = transformerRef.current?.nodes()[0];
    if (!target) return;
    if (mediaSelected && target === mediaRef.current) {
      handleTransformEnd(target, true);
      return;
    }
    if (selectedNodeId) handleTransformEnd(target, false, selectedNodeId);
  }, [handleTransformEnd, mediaSelected, selectedNodeId]);

  const styleTransformerAnchor = useCallback(
    (anchor: Konva.Rect) => {
      anchor.hitStrokeWidth(touchHitPx);
    },
    [touchHitPx]
  );

  if (!media || !mediaImg || mediaW <= 0 || mediaH <= 0) return null;

  return (
    <Stage
      width={stageWidth}
      height={stageHeight}
      scaleX={stageScale}
      scaleY={stageScale}
      style={{ touchAction: 'none' }}
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
          image={mediaImg}
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
          anchorSize={touchAnchorPx}
          anchorCornerRadius={4}
          rotateAnchorOffset={touchRotateOffsetPx}
          borderStrokeWidth={2}
          padding={2}
          listening
          anchorStyleFunc={styleTransformerAnchor}
          enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 16 || newBox.height < 16) return oldBox;
            return newBox;
          }}
          onTransformStart={onGestureStart}
          onTransformEnd={handleTransformerEnd}
        />
      </Layer>
    </Stage>
  );
}

export const PhotoStoryKonvaCanvas = memo(PhotoStoryKonvaCanvasInner);
