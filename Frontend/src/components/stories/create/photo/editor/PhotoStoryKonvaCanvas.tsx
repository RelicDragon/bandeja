import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Text, Transformer } from 'react-konva';
import type Konva from 'konva';
import { PHOTO_STICKER_FONT_PX } from '../constants';
import { PhotoStoryKonvaText } from './PhotoStoryKonvaText';
import type { StoryDocument, Transform2D } from '../types';
import { isStickerNode, isTextNode } from '../types';
import { getMediaNode, getOverlayNodes } from '../utils/document';
import { clampLayerTransform, clampMediaTransform, computeCoverScale } from '../utils/transform';
import { STORY_CANVAS_HEIGHT, STORY_CANVAS_WIDTH } from '../types';
import { buildPreviewFilteredImage } from '../utils/previewFilteredImage';

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
    tr.getLayer()?.batchDraw();
  }, [editingTextId, mediaSelected, selectedNodeId, mediaImg, overlays.length]);

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

  if (!media || !mediaImg || mediaW <= 0 || mediaH <= 0) return null;

  return (
    <Stage
      width={stageWidth}
      height={stageHeight}
      scaleX={stageScale}
      scaleY={stageScale}
      onMouseDown={(e) => {
        if (!gesturesEnabled) return;
        if (e.target === e.target.getStage()) onSelectNode(null, 'layer');
      }}
      onTouchStart={(e) => {
        if (!gesturesEnabled) return;
        if (e.target === e.target.getStage()) onSelectNode(null, 'layer');
      }}
    >
      <Layer listening={gesturesEnabled}>
        <KonvaImage
          ref={mediaRef}
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
          draggable={gesturesEnabled && mediaSelected}
          listening={gesturesEnabled}
          onClick={() => onSelectNode(PHOTO_MEDIA_NODE_KEY, 'media')}
          onTap={() => onSelectNode(PHOTO_MEDIA_NODE_KEY, 'media')}
          onDragStart={() => {
            onGestureStart();
            onSelectNode(PHOTO_MEDIA_NODE_KEY, 'media');
          }}
          onDragEnd={(e) => {
            const t = e.target;
            onMediaTransformChange({
              x: t.x() - STORY_CANVAS_WIDTH / 2,
              y: t.y() - STORY_CANVAS_HEIGHT / 2,
            });
            onGestureEnd();
          }}
          onTransformStart={() => {
            onGestureStart();
            onSelectNode(PHOTO_MEDIA_NODE_KEY, 'media');
          }}
          onTransformEnd={(e) => handleTransformEnd(e.target, true)}
        />
      </Layer>

      <Layer listening={gesturesEnabled}>
        {overlays.map((node) => {
          if (isStickerNode(node)) {
            return (
              <Text
                key={node.id}
                ref={(el) => {
                  if (el) layerRefs.current.set(node.id, el);
                  else layerRefs.current.delete(node.id);
                }}
                text={node.emoji}
                fontSize={PHOTO_STICKER_FONT_PX}
                x={node.transform.x}
                y={node.transform.y}
                offsetX={PHOTO_STICKER_FONT_PX / 2}
                offsetY={PHOTO_STICKER_FONT_PX / 2}
                scaleX={node.transform.scale}
                scaleY={node.transform.scale}
                rotation={node.transform.rotation}
                draggable={gesturesEnabled}
                perfectDrawEnabled={false}
                onClick={() => onSelectNode(node.id, 'layer')}
                onTap={() => onSelectNode(node.id, 'layer')}
                onDragStart={onGestureStart}
                onDragEnd={(e) => {
                  onLayerTransformChange(node.id, { x: e.target.x(), y: e.target.y() });
                  onGestureEnd();
                }}
                onTransformStart={onGestureStart}
                onTransformEnd={(e) => handleTransformEnd(e.target, false, node.id)}
              />
            );
          }
          if (isTextNode(node)) {
            const isEditing = node.id === editingTextId;
            return (
              <PhotoStoryKonvaText
                key={node.id}
                node={node}
                isEditing={isEditing}
                gesturesEnabled={gesturesEnabled}
                setLayerRef={(id, el) => {
                  if (el) layerRefs.current.set(id, el);
                  else layerRefs.current.delete(id);
                }}
                onSelect={() => onSelectNode(node.id, 'layer')}
                onGestureStart={onGestureStart}
                onGestureEnd={onGestureEnd}
                onDragEnd={(x, y) => onLayerTransformChange(node.id, { x, y })}
                onTransformEnd={(target) => handleTransformEnd(target, false, node.id)}
              />
            );
          }
          return null;
        })}

        <Transformer
          ref={transformerRef}
          rotateEnabled
          anchorSize={14}
          borderStrokeWidth={2}
          enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 16 || newBox.height < 16) return oldBox;
            return newBox;
          }}
        />
      </Layer>
    </Stage>
  );
}

export const PhotoStoryKonvaCanvas = memo(PhotoStoryKonvaCanvasInner);
