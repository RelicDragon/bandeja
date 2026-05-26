import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TextNode } from '../types';
import { computeTextEditGeometry, textEditTransform } from '../utils/textEditGeometry';
import { textPresetClassName, textPresetStyle } from '../utils/textDisplayStyles';
import { PhotoStoryTextSheet } from './PhotoStoryTextSheet';

const ANIM_MS = 340;

type PhotoStoryTextEditOverlayProps = {
  node: TextNode;
  stageRect: DOMRect;
  stageScale: number;
  initialDraft: string;
  draft: string;
  onDraftChange: (text: string) => void;
  onStyleChange: (patch: Partial<TextNode['style']>) => void;
  onCommit: () => void;
  onCancel: () => void;
};

export function PhotoStoryTextEditOverlay({
  node,
  stageRect,
  stageScale,
  initialDraft,
  draft,
  onDraftChange,
  onStyleChange,
  onCommit,
  onCancel,
}: PhotoStoryTextEditOverlayProps) {
  const { t } = useTranslation();
  const editorRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef(false);
  const [atCenter, setAtCenter] = useState(false);
  const [backdropOn, setBackdropOn] = useState(false);

  const geo = useMemo(
    () => computeTextEditGeometry(node, stageRect, stageScale),
    [node, stageRect, stageScale]
  );

  const styleNode = useMemo(
    () => ({ ...node, text: draft }),
    [node, draft]
  );

  useLayoutEffect(() => {
    closingRef.current = false;
    setAtCenter(false);
    setBackdropOn(false);
    const el = editorRef.current;
    if (el) el.textContent = initialDraft;
    const id = requestAnimationFrame(() => {
      setBackdropOn(true);
      requestAnimationFrame(() => setAtCenter(true));
    });
    return () => cancelAnimationFrame(id);
  }, [initialDraft, node.id]);

  useEffect(() => {
    if (!atCenter) return;
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, [atCenter, node.id]);

  const finish = useCallback(
    (commit: boolean) => {
      if (closingRef.current) return;
      closingRef.current = true;
      setAtCenter(false);
      setBackdropOn(false);
      window.setTimeout(() => {
        if (commit) onCommit();
        else onCancel();
      }, ANIM_MS);
    },
    [onCancel, onCommit]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        finish(false);
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        finish(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finish]);

  const transform = atCenter
    ? textEditTransform(geo.centerX, geo.centerY, 0, 1)
    : textEditTransform(geo.originX, geo.originY, geo.rotation, 1);

  const editFontSize = atCenter ? Math.max(geo.fontSizePx, 22) : geo.fontSizePx;

  return (
    <div className="fixed inset-0 z-[60] pointer-events-auto" aria-modal role="dialog">
      <div
        className="absolute inset-0 bg-black transition-opacity ease-out"
        style={{
          opacity: backdropOn ? 0.72 : 0,
          transitionDuration: `${ANIM_MS}ms`,
        }}
        onPointerDown={() => finish(true)}
      />

      <div
        className="absolute left-0 top-0 will-change-transform"
        style={{
          transform,
          transition: `transform ${ANIM_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`,
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div
          ref={editorRef}
          role="textbox"
          contentEditable
          suppressContentEditableWarning
          spellCheck
          className={`min-w-[3rem] max-w-[min(88vw,360px)] empty:before:content-[attr(data-placeholder)] empty:before:text-white/40 ${textPresetClassName(styleNode.style.id, styleNode.style.align)}`}
          style={textPresetStyle(editFontSize)}
          onInput={(e) => onDraftChange(e.currentTarget.textContent ?? '')}
          onBlur={() => finish(true)}
          data-placeholder={t('stories.overlayPlaceholder')}
        />
      </div>

      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[61] bg-gradient-to-t from-black/90 via-black/55 to-transparent pt-14 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-transform ease-out"
        style={{
          transform: atCenter ? 'translateY(0)' : 'translateY(100%)',
          transitionDuration: `${ANIM_MS}ms`,
        }}
      >
        <div
          className="pointer-events-auto"
          onMouseDown={(e) => e.preventDefault()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <PhotoStoryTextSheet node={styleNode} onStyleChange={onStyleChange} />
        </div>
      </div>
    </div>
  );
}
