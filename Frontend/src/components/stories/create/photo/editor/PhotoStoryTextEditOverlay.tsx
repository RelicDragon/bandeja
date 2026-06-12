import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TextNode } from '../types';
import { computeTextEditGeometry, textEditTransform } from '../utils/textEditGeometry';
import {
  textEditLayoutClassName,
  textEditPresetClassName,
  textEditPresetStyle,
  textEditTransparentLayoutStyle,
  textPresetStyle,
} from '../utils/textDisplayStyles';
import { PhotoStoryTextEditBitmap } from './PhotoStoryTextEditBitmap';
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
  const sessionFontRef = useRef<{ nodeId: string; fontSizePx: number } | null>(null);
  const closingRef = useRef<'commit' | 'cancel' | false>(false);
  const [atCenter, setAtCenter] = useState(false);
  const [backdropOn, setBackdropOn] = useState(false);
  const [editing, setEditing] = useState(false);

  const geo = useMemo(
    () => computeTextEditGeometry(node, stageRect, stageScale),
    [node, stageRect, stageScale]
  );

  if (!sessionFontRef.current || sessionFontRef.current.nodeId !== node.id) {
    sessionFontRef.current = { nodeId: node.id, fontSizePx: geo.fontSizePx };
  }
  const editFontSize = sessionFontRef.current.fontSizePx;

  const styleNode = useMemo(() => ({ ...node, text: draft }), [node, draft]);

  const flyClassName = textEditPresetClassName(styleNode.style.id, styleNode.style.align);
  const flyStyle = useMemo(
    () => ({
      ...textPresetStyle(editFontSize),
      ...textEditPresetStyle(styleNode.style.id, editFontSize),
    }),
    [editFontSize, styleNode.style.id]
  );
  const editingClassName = textEditLayoutClassName(styleNode.style.align);
  const editingStyle = useMemo(
    () => textEditTransparentLayoutStyle(editFontSize),
    [editFontSize]
  );

  const flyTransform = atCenter
    ? textEditTransform(geo.centerX, geo.centerY, geo.rotation, 1)
    : textEditTransform(geo.originX, geo.originY, geo.rotation, 1);

  useLayoutEffect(() => {
    closingRef.current = false;
    setAtCenter(false);
    setBackdropOn(false);
    setEditing(false);
    const el = editorRef.current;
    if (el) el.textContent = initialDraft;
    const id = requestAnimationFrame(() => {
      setBackdropOn(true);
      requestAnimationFrame(() => setAtCenter(true));
    });
    return () => cancelAnimationFrame(id);
  }, [initialDraft, node.id]);

  const focusEditor = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, []);

  const handleFlyTransitionEnd = useCallback(
    (e: React.TransitionEvent<HTMLDivElement>) => {
      if (e.propertyName !== 'transform' || closingRef.current) return;
      if (atCenter && !editing) {
        setEditing(true);
        focusEditor();
      }
    },
    [atCenter, editing, focusEditor]
  );

  useEffect(() => {
    if (!atCenter || editing || closingRef.current) return;
    const id = window.setTimeout(() => {
      if (closingRef.current) return;
      setEditing(true);
      focusEditor();
    }, ANIM_MS + 40);
    return () => clearTimeout(id);
  }, [atCenter, editing, focusEditor]);

  const finish = useCallback(
    (commit: boolean) => {
      if (closingRef.current) return;
      closingRef.current = commit ? 'commit' : 'cancel';
      setEditing(false);
      setAtCenter(false);
      setBackdropOn(false);
      window.setTimeout(() => {
        if (closingRef.current === 'commit') onCommit();
        else if (closingRef.current === 'cancel') onCancel();
        closingRef.current = false;
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

  const blockInput = useCallback(
    (e: React.SyntheticEvent) => {
      if (!editing) e.preventDefault();
    },
    [editing]
  );

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
        className={`absolute left-0 top-0 z-[61] will-change-transform ${editing ? 'pointer-events-auto' : 'pointer-events-none'}`}
        style={{
          transform: flyTransform,
          transition: `transform ${ANIM_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`,
        }}
        onTransitionEnd={handleFlyTransitionEnd}
      >
        <div className="relative inline-block min-w-[3rem]">
          {editing ? (
            <PhotoStoryTextEditBitmap
              text={draft}
              style={styleNode.style}
              displayFontSizePx={editFontSize}
            />
          ) : null}
          <div
            ref={editorRef}
            role="textbox"
            contentEditable
            suppressContentEditableWarning
            spellCheck={editing}
            tabIndex={-1}
            className={`relative z-10 min-w-[3rem] empty:before:content-[attr(data-placeholder)] empty:before:text-white/40 ${
              editing ? editingClassName : flyClassName
            }`}
            style={{
              ...(editing ? editingStyle : flyStyle),
              userSelect: editing ? 'text' : 'none',
            }}
          onBeforeInput={blockInput}
          onKeyDown={blockInput}
          onPaste={blockInput}
          onInput={(e) => {
            if (!editing) return;
            onDraftChange(e.currentTarget.textContent ?? '');
          }}
          onBlur={() => {
            if (editing) finish(true);
          }}
          data-placeholder={t('stories.overlayPlaceholder')}
          />
        </div>
      </div>

      <div
        className="cap-keyboard-aware-bottom-panel pointer-events-none absolute inset-x-0 bottom-0 z-[61] bg-gradient-to-t from-black/90 via-black/55 to-transparent pt-14 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-transform ease-out"
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
