import { useMemo } from 'react';
import { Group, Image as KonvaImage, Text } from 'react-konva';
import type Konva from 'konva';
import { PHOTO_TEXT_FONT_PX, PHOTO_TEXT_MAX_WIDTH_PX } from '../constants';
import type { TextNode } from '../types';
import { renderTextNodeBitmap } from '../utils/renderTextNodeBitmap';

type PhotoStoryKonvaTextProps = {
  node: TextNode;
  isEditing: boolean;
  gesturesEnabled: boolean;
  setLayerRef: (id: string, el: Konva.Group | null) => void;
  onSelect: () => void;
  onGestureStart: () => void;
  onGestureEnd: () => void;
  onDragEnd: (x: number, y: number) => void;
  onTransformEnd: (target: Konva.Node) => void;
};

export function PhotoStoryKonvaText({
  node,
  isEditing,
  gesturesEnabled,
  setLayerRef,
  onSelect,
  onGestureStart,
  onGestureEnd,
  onDragEnd,
  onTransformEnd,
}: PhotoStoryKonvaTextProps) {
  const bitmap = useMemo(
    () => renderTextNodeBitmap(node.text, node.style, node.transform.scale),
    [node.text, node.style, node.transform.scale]
  );

  const fontSize = PHOTO_TEXT_FONT_PX * node.transform.scale;
  const interactive = !isEditing && gesturesEnabled;

  const handleSelect = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (!interactive) return;
    e.cancelBubble = true;
    onSelect();
  };

  return (
    <Group
      ref={(el) => setLayerRef(node.id, el)}
      x={node.transform.x}
      y={node.transform.y}
      rotation={node.transform.rotation}
      visible={!isEditing}
      listening={interactive}
      draggable={interactive}
      onClick={handleSelect}
      onTap={handleSelect}
      onDragStart={(e) => {
        e.cancelBubble = true;
        onGestureStart();
      }}
      onDragEnd={(e) => {
        onDragEnd(e.target.x(), e.target.y());
        onGestureEnd();
      }}
      onTransformStart={(e) => {
        e.cancelBubble = true;
        onGestureStart();
      }}
      onTransformEnd={(e) => onTransformEnd(e.target)}
    >
      <KonvaImage
        image={bitmap.image}
        width={bitmap.width}
        height={bitmap.height}
        offsetX={bitmap.width / 2}
        offsetY={bitmap.height / 2}
        listening={false}
        perfectDrawEnabled={false}
      />
      <Text
        text={node.text.trim() ? node.text : ' '}
        fontSize={fontSize}
        fontStyle="bold"
        fontFamily="system-ui, -apple-system, sans-serif"
        fill="rgba(0,0,0,0.01)"
        width={PHOTO_TEXT_MAX_WIDTH_PX}
        align={node.style.align}
        offsetX={PHOTO_TEXT_MAX_WIDTH_PX / 2}
        offsetY={fontSize / 2}
        listening={interactive}
        draggable={false}
        onClick={handleSelect}
        onTap={handleSelect}
        perfectDrawEnabled={false}
      />
    </Group>
  );
}
