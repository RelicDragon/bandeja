import { Trash2 } from 'lucide-react';
import type { PointerEvent } from 'react';
import type { LayerDragMode } from './hooks/useLayerTransformHandles';

type StoryLayerTransformHandlesProps = {
  onPointerDown: (e: PointerEvent<HTMLElement>, mode: LayerDragMode) => void;
  onPointerMove: (e: PointerEvent<HTMLElement>) => void;
  onPointerUp: (e: PointerEvent<HTMLElement>) => void;
  onDelete?: () => void;
  deleteLabel?: string;
};

export function StoryLayerTransformHandles({
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onDelete,
  deleteLabel = 'Delete',
}: StoryLayerTransformHandlesProps) {
  const handleProps = {
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
  };

  return (
    <>
      {onDelete ? (
        <button
          type="button"
          aria-label={deleteLabel}
          className="absolute -bottom-10 left-1/2 -translate-x-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-white border-2 border-red-500 text-red-600 shadow touch-none"
          onPointerDown={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 size={14} />
        </button>
      ) : null}
      <button
        type="button"
        aria-label="Rotate"
        className="absolute -top-8 left-1/2 -translate-x-1/2 h-6 w-6 rounded-full bg-white border-2 border-primary-500 shadow touch-none"
        onPointerDown={(e) => onPointerDown(e, 'rotate')}
        {...handleProps}
      />
      {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => {
        const pos =
          corner === 'tl'
            ? '-top-2 -left-2'
            : corner === 'tr'
              ? '-top-2 -right-2'
              : corner === 'bl'
                ? '-bottom-2 -left-2'
                : '-bottom-2 -right-2';
        return (
          <button
            key={corner}
            type="button"
            aria-label="Scale"
            className={`absolute ${pos} h-5 w-5 rounded-full bg-white border-2 border-primary-500 shadow touch-none`}
            onPointerDown={(e) => onPointerDown(e, `scale-${corner}` as LayerDragMode)}
            {...handleProps}
          />
        );
      })}
    </>
  );
}
