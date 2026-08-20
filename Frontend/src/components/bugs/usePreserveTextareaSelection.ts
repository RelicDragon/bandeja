import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import {
  applyTextSelection,
  clampSelection,
  nextPreservedSelection,
  readTextSelection,
  shouldRestoreSelection,
  type TextSelection,
} from './selectionPreserve';

export function usePreserveTextareaSelection(
  elementRef: RefObject<HTMLTextAreaElement | null>,
) {
  const selectionRef = useRef<TextSelection>({ start: 0, end: 0 });
  const lastValueRef = useRef('');
  const restoringRef = useRef(false);
  const composingRef = useRef(false);
  const layoutJitterAtRef = useRef(0);

  const restore = useCallback(() => {
    if (composingRef.current) return;
    const el = elementRef.current;
    if (!el || document.activeElement !== el) return;
    const current = readTextSelection(el);
    if (!current) return;
    const intended = clampSelection(selectionRef.current, el.value.length);
    if (!shouldRestoreSelection(current, intended)) return;
    restoringRef.current = true;
    applyTextSelection(el, intended);
    restoringRef.current = false;
  }, [elementRef]);

  const noteLayoutJitter = useCallback(() => {
    layoutJitterAtRef.current = performance.now();
    requestAnimationFrame(() => {
      requestAnimationFrame(restore);
    });
  }, [restore]);

  const captureFromElement = useCallback((el: HTMLTextAreaElement) => {
    if (restoringRef.current) return;
    const incoming = readTextSelection(el);
    if (!incoming) return;
    selectionRef.current = nextPreservedSelection({
      incoming,
      previous: selectionRef.current,
      valueChanged: el.value !== lastValueRef.current,
      msSinceLayoutJitter: performance.now() - layoutJitterAtRef.current,
    });
    lastValueRef.current = el.value;
  }, []);

  useLayoutEffect(() => {
    restore();
  });

  useEffect(() => {
    const el = elementRef.current;
    if (!el) return;

    const onViewport = () => {
      if (document.activeElement !== el) return;
      noteLayoutJitter();
    };
    const onSelectionChange = () => {
      if (document.activeElement !== el) return;
      captureFromElement(el);
    };

    const vv = window.visualViewport;
    vv?.addEventListener('resize', onViewport);
    vv?.addEventListener('scroll', onViewport);
    window.addEventListener('resize', onViewport);
    document.addEventListener('selectionchange', onSelectionChange);
    return () => {
      vv?.removeEventListener('resize', onViewport);
      vv?.removeEventListener('scroll', onViewport);
      window.removeEventListener('resize', onViewport);
      document.removeEventListener('selectionchange', onSelectionChange);
    };
  }, [captureFromElement, elementRef, noteLayoutJitter]);

  return {
    captureFromElement,
    onCompositionStart: () => {
      composingRef.current = true;
    },
    onCompositionEnd: (el: HTMLTextAreaElement) => {
      composingRef.current = false;
      captureFromElement(el);
    },
  };
}
