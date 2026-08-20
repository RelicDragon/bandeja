import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { isIOS } from '@/utils/capacitor';
import {
  applyTextSelection,
  clampSelection,
  isSelectionRestoreLoopActive,
  nextPreservedSelection,
  readTextSelection,
  shouldRestoreSelection,
  type SelectionPlatform,
  type TextSelection,
} from './selectionPreserve';
import { createRestoreRafLoop, type RestoreRafLoop } from './selectionRestoreLoop';

const selectionPlatform = (): SelectionPlatform => (isIOS() ? 'ios' : 'other');

export function usePreserveTextareaSelection(
  elementRef: RefObject<HTMLTextAreaElement | null>,
  value: string,
) {
  const selectionRef = useRef<TextSelection>({ start: 0, end: 0 });
  const lastValueRef = useRef(value);
  const restoringRef = useRef(false);
  const composingRef = useRef(false);
  const userSelectingRef = useRef(false);
  const layoutJitterAtRef = useRef(Number.NEGATIVE_INFINITY);
  const valueCommitAtRef = useRef(Number.NEGATIVE_INFINITY);
  const restoreLoopRef = useRef<RestoreRafLoop | null>(null);

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

  const armRestoreLoop = useCallback(() => {
    restoreLoopRef.current?.arm();
  }, []);

  const noteLayoutJitter = useCallback(() => {
    layoutJitterAtRef.current = performance.now();
    armRestoreLoop();
  }, [armRestoreLoop]);

  const captureFromElement = useCallback((el: HTMLTextAreaElement) => {
    if (restoringRef.current) return;
    const incoming = readTextSelection(el);
    if (!incoming) return;
    const previousValueLength = lastValueRef.current.length;
    const valueChanged = el.value !== lastValueRef.current;
    if (valueChanged) valueCommitAtRef.current = performance.now();
    const platform = selectionPlatform();
    const next = nextPreservedSelection({
      incoming,
      previous: selectionRef.current,
      valueChanged,
      previousValueLength,
      nextValueLength: el.value.length,
      msSinceLayoutJitter: performance.now() - layoutJitterAtRef.current,
      msSinceValueCommit: performance.now() - valueCommitAtRef.current,
      userSelecting: userSelectingRef.current,
      platform,
    });
    selectionRef.current = next;
    lastValueRef.current = el.value;
    if (valueChanged) armRestoreLoop();
    if (
      shouldRestoreSelection(incoming, next, {
        platform,
        userSelecting: userSelectingRef.current,
      })
    ) {
      restoringRef.current = true;
      applyTextSelection(el, next);
      restoringRef.current = false;
    }
  }, [armRestoreLoop]);

  useLayoutEffect(() => {
    if (lastValueRef.current !== value) {
      lastValueRef.current = value;
      selectionRef.current = clampSelection(selectionRef.current, value.length);
    }
    restore();
  }, [restore, value]);

  useEffect(() => {
    const loop = createRestoreRafLoop({
      restore,
      shouldContinue: () =>
        isSelectionRestoreLoopActive({
          now: performance.now(),
          layoutJitterAt: layoutJitterAtRef.current,
          valueCommitAt: valueCommitAtRef.current,
        }),
    });
    restoreLoopRef.current = loop;

    const el = elementRef.current;
    if (!el) {
      return () => {
        loop.stop();
        restoreLoopRef.current = null;
      };
    }

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
      loop.stop();
      restoreLoopRef.current = null;
      vv?.removeEventListener('resize', onViewport);
      vv?.removeEventListener('scroll', onViewport);
      window.removeEventListener('resize', onViewport);
      document.removeEventListener('selectionchange', onSelectionChange);
      el.removeEventListener('pointerdown', markSelecting);
      window.removeEventListener('pointerup', clearSelecting);
      window.removeEventListener('pointercancel', clearSelecting);
    };
  }, [captureFromElement, elementRef, noteLayoutJitter, restore]);

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
