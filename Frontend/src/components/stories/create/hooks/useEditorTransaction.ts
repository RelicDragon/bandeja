import { useCallback, useRef } from 'react';
import type { StorySlide } from '../types/storyEditor.types';

type TransactionBaseline = {
  slides: StorySlide[];
  activeSlideIndex: number;
};

type UseEditorTransactionOptions = {
  pushHistory: (slides: StorySlide[], activeSlideIndex: number) => void;
  getSlides: () => StorySlide[];
  getActiveSlideIndex: () => number;
  cloneSlides: (slides: StorySlide[]) => StorySlide[];
};

export function useEditorTransaction({
  pushHistory,
  getSlides,
  getActiveSlideIndex,
  cloneSlides,
}: UseEditorTransactionOptions) {
  const activeRef = useRef(false);
  const baselineRef = useRef<TransactionBaseline | null>(null);

  const beginTransaction = useCallback(() => {
    if (activeRef.current) return;
    activeRef.current = true;
    baselineRef.current = {
      slides: cloneSlides(getSlides()),
      activeSlideIndex: getActiveSlideIndex(),
    };
  }, [cloneSlides, getActiveSlideIndex, getSlides]);

  const commitTransaction = useCallback(() => {
    const baseline = baselineRef.current;
    if (!activeRef.current || !baseline) return;
    pushHistory(baseline.slides, baseline.activeSlideIndex);
    activeRef.current = false;
    baselineRef.current = null;
  }, [pushHistory]);

  const cancelTransaction = useCallback(() => {
    activeRef.current = false;
    baselineRef.current = null;
  }, []);

  const isInTransaction = useCallback(() => activeRef.current, []);

  return { beginTransaction, commitTransaction, cancelTransaction, isInTransaction };
}
