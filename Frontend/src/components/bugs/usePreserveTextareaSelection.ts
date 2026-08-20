import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { isIOS } from '@/utils/capacitor';
import {
  applyTextSelection,
  clampSelection,
  LAYOUT_JITTER_WINDOW_MS,
  nextPreservedSelection,
  readTextSelection,
  shouldRestoreSelection,
  type SelectionPlatform,
  type TextSelection,
} from './selectionPreserve';

const selectionPlatform = (): SelectionPlatform => (isIOS() ? 'ios' : 'other');

export function usePreserveTextareaSelection(
  elementRef: RefObject<HTMLTextAreaElement | null>,
) {
  const selectionRef = useRef<TextSelection>({ start: 0, end: 0 });
  const lastValueRef = useRef('');
  const restoringRef = useRef(false);
  const composingRef = useRef(false);
  const userSelectingRef = useRef(false);
  const layoutJitterAtRef = useRef(Number.NEGATIVE_INFINITY);
  const valueCommitAtRef = useRef(Number.NEGATIVE_INFINITY);
  const restoreRafRef = useRef(0);

  const restore = useCallback(() => {
    if (composingRef.current) return;
    const el = elementRef.current;
    if (!el || document.activeElement !== el) return;
    const current = readTextSelection(el);
    if (!current) return;
    const intended = clampSelection(selectionRef.current, el.value.length);
    if (
      !shouldRestoreSelection(current, intended, {
        platform: selectionPlatform(),
        userSelecting: userSelectingRef.current,
      })
    ) {
      return;
    }
    restoringRef.current = true;
    applyTextSelection(el, intended);
    restoringRef.current = false;
  }, [elementRef]);

  const restoreDuringLayoutJitter = useCallback(() => {
    restore();
    if (performance.now() - layoutJitterAtRef.current <= LAYOUT_JITTER_WINDOW_MS) {
      restoreRafRef.current = requestAnimationFrame(restoreDuringLayoutJitter);
      return;
    }
    restoreRafRef.current = 0;
  }, [restore]);

  const noteLayoutJitter = useCallback(() => {
    layoutJitterAtRef.current = performance.now();
    if (restoreRafRef.current) cancelAnimationFrame(restoreRafRef.current);
    restoreRafRef.current = requestAnimationFrame(restoreDuringLayoutJitter);
  }, [restoreDuringLayoutJitter]);

  const captureFromElement = useCallback((el: HTMLTextAreaElement) => {
    if (restoringRef.current) return;
    const incoming = readTextSelection(el);
    if (!incoming) return;
    const valueChanged = el.value !== lastValueRef.current;
    if (valueChanged) valueCommitAtRef.current = performance.now();
    const next = nextPreservedSelection({
      incoming,
      previous: selectionRef.current,
      valueChanged,
      msSinceLayoutJitter: performance.now() - layoutJitterAtRef.current,
      msSinceValueCommit: performance.now() - valueCommitAtRef.current,
      userSelecting: userSelectingRef.current,
    });
    selectionRef.current = next;
    lastValueRef.current = el.value;
    if (
      shouldRestoreSelection(incoming, next, {
        platform: selectionPlatform(),
        userSelecting: userSelectingRef.current,
      })
    ) {
      restoringRef.current = true;
      applyTextSelection(el, next);
      restoringRef.current = false;
    }
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
    const markSelecting = () => {
      userSelectingRef.current = true;
    };
    const clearSelecting = () => {
      userSelectingRef.current = false;
    };

    const vv = window.visualViewport;
    vv?.addEventListener('resize', onViewport);
    vv?.addEventListener('scroll', onViewport);
    window.addEventListener('resize', onViewport);
    document.addEventListener('selectionchange', onSelectionChange);
    el.addEventListener('pointerdown', markSelecting);
    window.addEventListener('pointerup', clearSelecting);
    window.addEventListener('pointercancel', clearSelecting);
    return () => {
      vv?.removeEventListener('resize', onViewport);
      vv?.removeEventListener('scroll', onViewport);
      window.removeEventListener('resize', onViewport);
      document.removeEventListener('selectionchange', onSelectionChange);
      el.removeEventListener('pointerdown', markSelecting);
      window.removeEventListener('pointerup', clearSelecting);
      window.removeEventListener('pointercancel', clearSelecting);
      if (restoreRafRef.current) cancelAnimationFrame(restoreRafRef.current);
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
