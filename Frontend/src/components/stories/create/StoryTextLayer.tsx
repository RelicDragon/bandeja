import {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { STORY_OVERLAY_MAX_CHARS } from '@/api/stories';
import { lightHaptic } from '@/utils/lightHaptic';
import { useTranslation } from 'react-i18next';
import type { TextStoryLayer, Transform2D } from './types/storyEditor.types';
import { useLayerPinchGesture } from './hooks/useLayerPinchGesture';
import { useLayerTransformHandles } from './hooks/useLayerTransformHandles';
import { StoryLayerTransformHandles } from './StoryLayerTransformHandles';
import {
  layerOverlayPositionStyle,
  textFontSizePx,
  textMaxWidthPx,
} from './utils/storyCompositionLayout';
import { getTextStyleRender } from './utils/storyTextStyles';

type StoryTextLayerProps = {
  layer: TextStoryLayer;
  stageScale: number;
  selected: boolean;
  editing: boolean;
  onSelect: () => void;
  onUpdate: (patch: Partial<Pick<TextStoryLayer, 'text' | 'transform' | 'style'>>) => void;
  onEditStart: () => void;
  onEditEnd: () => void;
  onDelete: () => void;
  onTransformBegin?: () => void;
  onTransformEnd?: () => void;
};

export function StoryTextLayer({
  layer,
  stageScale,
  selected,
  editing,
  onSelect,
  onUpdate,
  onEditStart,
  onEditEnd,
  onDelete,
  onTransformBegin,
  onTransformEnd,
}: StoryTextLayerProps) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastTapRef = useRef(0);

  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (!el) return;

    const scrollIntoView = () => {
      el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    };

    scrollIntoView();
    const vv = window.visualViewport;
    if (!vv) return;
    vv.addEventListener('resize', scrollIntoView);
    vv.addEventListener('scroll', scrollIntoView);
    return () => {
      vv.removeEventListener('resize', scrollIntoView);
      vv.removeEventListener('scroll', scrollIntoView);
    };
  }, [editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const onTransformChange = useCallback(
    (transform: Transform2D) => onUpdate({ transform }),
    [onUpdate]
  );

  const pinchBind = useLayerPinchGesture({
    transform: layer.transform,
    onTransformChange,
    onTransformBegin,
    onTransformEnd,
    enabled: selected && !editing,
  });

  const { handlePointerDown, handlePointerMove, handlePointerUp } = useLayerTransformHandles({
    layerRef: rootRef,
    transform: layer.transform,
    stageScale,
    onTransformChange,
    onTransformBegin,
    onTransformEnd,
    disabled: editing,
  });

  const handleTap = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      const now = Date.now();
      if (now - lastTapRef.current < 300) onEditStart();
      else onSelect();
      lastTapRef.current = now;
    },
    [onEditStart, onSelect]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Backspace' && !editing && selected && !layer.text) {
        e.preventDefault();
        onDelete();
      }
      if (e.key === 'Escape' && editing) onEditEnd();
    },
    [editing, selected, layer.text, onDelete, onEditEnd]
  );

  const fontSizePx = textFontSizePx(stageScale);
  const maxWidthPx = textMaxWidthPx(stageScale);
  const styleRender = getTextStyleRender(layer.style.id, layer.style.align, fontSizePx);

  const layerStyle: CSSProperties = {
    ...layerOverlayPositionStyle(layer.transform, undefined, 'auto'),
    zIndex: selected ? 50 : 10,
  };

  return (
    <div
      ref={rootRef}
      {...(selected && !editing ? pinchBind() : {})}
      className={`absolute touch-none ${editing ? 'pointer-events-auto' : ''}`}
      style={layerStyle}
      onClick={handleTap}
      onKeyDown={handleKeyDown}
      role="group"
      tabIndex={selected ? 0 : -1}
    >
      {editing ? (
        <textarea
          ref={inputRef}
          value={layer.text}
          maxLength={STORY_OVERLAY_MAX_CHARS}
          rows={2}
          onChange={(e) => onUpdate({ text: e.target.value.slice(0, STORY_OVERLAY_MAX_CHARS) })}
          onBlur={() => {
            onEditEnd();
            if (!layer.text.trim()) onDelete();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className={`min-w-[120px] resize-none bg-transparent outline-none border-none ${styleRender.className}`}
          style={{ ...styleRender.style, maxWidth: maxWidthPx }}
        />
      ) : (
        <div
          className={`whitespace-pre-wrap break-words select-none ${styleRender.className} ${
            selected ? 'ring-2 ring-white/80 ring-offset-2 ring-offset-transparent rounded-lg' : ''
          }`}
          style={{ ...styleRender.style, maxWidth: maxWidthPx }}
          onPointerDown={(e) => {
            onSelect();
            handlePointerDown(e, 'move');
          }}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {layer.text || '\u00A0'}
        </div>
      )}

      {selected && !editing ? (
        <StoryLayerTransformHandles
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          deleteLabel={t('stories.editor.deleteLayer')}
          onDelete={() => {
            lightHaptic();
            onDelete();
          }}
        />
      ) : null}
    </div>
  );
}
