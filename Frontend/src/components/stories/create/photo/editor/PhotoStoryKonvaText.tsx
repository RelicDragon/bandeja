import { useMemo } from 'react';
import { Group, Image as KonvaImage, Rect } from 'react-konva';
import type Konva from 'konva';
import type { TextNode } from '../types';
import { renderTextNodeBitmap } from '../utils/renderTextNodeBitmap';

const MIN_HIT_PX = 48;

type PhotoStoryKonvaTextProps = {
  node: TextNode;
  isEditing: boolean;
  isSelected: boolean;
  /** When true, only hit targets + transformer anchors render (WYSIWYG canvas preview underneath). */
  interactionOnly?: boolean;
  gesturesEnabled: boolean;
  setLayerRef: (id: string, el: Konva.Group | null) => void;
  onSelect: () => void;
  onGestureStart: () => void;
  onGestureEnd: () => void;
  onDragEnd: (x: number, y: number) => void;
};

export function PhotoStoryKonvaText({
  node,
  isEditing,
  isSelected,
  interactionOnly = false,
  gesturesEnabled,
  setLayerRef,
  onSelect,
  onGestureStart,
  onGestureEnd,
  onDragEnd,
}: PhotoStoryKonvaTextProps) {
  const bitmap = useMemo(
    () => renderTextNodeBitmap(node.text, node.style),
    [node.text, node.style]
  );

  const interactive = !isEditing && gesturesEnabled;
  const hitW = Math.max(bitmap.width, MIN_HIT_PX);
  const hitH = Math.max(bitmap.height, MIN_HIT_PX);
  const halfW = bitmap.width / 2;
  const halfH = bitmap.height / 2;

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
      scaleX={node.transform.scale}
      scaleY={node.transform.scale}
      visible={!isEditing}
      listening={interactive}
      draggable={interactive && isSelected}
      onDragStart={() => onGestureStart()}
      onDragEnd={(e) => {
        onDragEnd(e.target.x(), e.target.y());
        onGestureEnd();
      }}
    >
      {!interactionOnly ? (
        <KonvaImage
          image={bitmap.image}
          x={-halfW}
          y={-halfH}
          width={bitmap.width}
          height={bitmap.height}
          listening={false}
          perfectDrawEnabled={false}
        />
      ) : null}
      <Rect
        x={-hitW / 2}
        y={-hitH / 2}
        width={hitW}
        height={hitH}
        fill="rgba(0,0,0,0.01)"
        listening={interactive}
        onClick={handleSelect}
        onTap={handleSelect}
        perfectDrawEnabled={false}
      />
    </Group>
  );
}
