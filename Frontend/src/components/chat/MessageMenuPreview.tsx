import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, type TargetAndTransition, type Transition } from 'framer-motion';
import type { MessageMenuRect } from '@/utils/messageMenuLayout';
import { MESSAGE_MENU_PREVIEW_SPRING } from '@/components/chat/chatListMotion';

export interface MessageMenuPreviewExit {
  /** Viewport top to fly back to (re-measured original row), or null → fade/scale out in place. */
  top: number | null;
}

export interface MessageMenuPreviewProps {
  sourceElement: HTMLElement;
  sourceRect: MessageMenuRect;
  top: number;
  height: number;
  clipped: boolean;
  exit: MessageMenuPreviewExit | null;
  reduceMotion: boolean;
  onNaturalHeight: (height: number) => void;
  onExitComplete?: () => void;
}

const FADE_OUT_TRANSITION: Transition = { duration: 0.22, ease: [0.22, 1, 0.36, 1] };
const REDUCED_TRANSITION: Transition = { duration: 0 };
const REDUCED_FADE_OUT_TRANSITION: Transition = { duration: 0.15 };
const CLIP_FADE = '56px';
const EXIT_SAFETY_MS = 700;

const MASK = 'linear-gradient(to bottom, #000 calc(100% - var(--menu-preview-fade)), transparent 100%)';

function prepareClone(source: HTMLElement, width: number): HTMLElement {
  const clone = source.cloneNode(true) as HTMLElement;
  const s = clone.style;
  s.margin = '0';
  s.width = `${width}px`;
  s.maxWidth = 'none';
  s.pointerEvents = 'none';
  s.userSelect = 'none';
  s.webkitUserSelect = 'none';
  // framer-motion leaves inline transform/opacity on the row; parent may hide the original.
  s.transform = '';
  s.opacity = '';
  s.visibility = 'visible';

  clone.removeAttribute('id');
  clone.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));

  // cloneNode does not copy canvas bitmaps.
  const srcCanvases = source.querySelectorAll('canvas');
  const dstCanvases = clone.querySelectorAll('canvas');
  dstCanvases.forEach((dst, i) => {
    const src = srcCanvases[i];
    if (!src) return;
    try {
      dst.width = src.width;
      dst.height = src.height;
      dst.getContext('2d')?.drawImage(src, 0, 0);
    } catch {
      // tainted / webgl canvases: leave blank
    }
  });

  clone.querySelectorAll('video').forEach((video) => {
    video.muted = true;
    video.autoplay = false;
    video.removeAttribute('autoplay');
  });

  return clone;
}

export const MessageMenuPreview: React.FC<MessageMenuPreviewProps> = ({
  sourceElement,
  sourceRect,
  top,
  height,
  clipped,
  exit,
  reduceMotion,
  onNaturalHeight,
  onExitComplete,
}) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const onNaturalHeightRef = useRef(onNaturalHeight);
  const onExitCompleteRef = useRef(onExitComplete);
  const exitFiredRef = useRef(false);
  const [naturalHeight, setNaturalHeight] = useState(0);

  useLayoutEffect(() => {
    onNaturalHeightRef.current = onNaturalHeight;
    onExitCompleteRef.current = onExitComplete;
  });

  // Width is captured at open; intentionally not a dependency.
  const widthRef = useRef(sourceRect.width);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const clone = prepareClone(sourceElement, widthRef.current);
    host.replaceChildren(clone);

    let last = -1;
    const report = () => {
      const h = clone.offsetHeight;
      if (h === last) return;
      last = h;
      setNaturalHeight(h);
      onNaturalHeightRef.current(h);
    };
    report();

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(report);
      observer.observe(clone);
    }

    return () => {
      observer?.disconnect();
      host.replaceChildren();
    };
  }, [sourceElement]);

  const fireExitComplete = useCallback(() => {
    if (exitFiredRef.current) return;
    exitFiredRef.current = true;
    onExitCompleteRef.current?.();
  }, []);

  const closing = exit !== null;

  useEffect(() => {
    if (!closing) {
      exitFiredRef.current = false;
      return;
    }
    const id = window.setTimeout(fireExitComplete, EXIT_SAFETY_MS);
    return () => window.clearTimeout(id);
  }, [closing, fireExitComplete]);

  const openHeight = height > 0 ? height : sourceRect.height;
  const exitTop = exit?.top ?? null;

  const target = useMemo((): TargetAndTransition => {
    if (closing) {
      if (exitTop !== null) {
        return {
          y: exitTop,
          height: naturalHeight > 0 ? naturalHeight : sourceRect.height,
          '--menu-preview-fade': '0px',
          opacity: 1,
          scale: 1,
          transition: reduceMotion ? REDUCED_TRANSITION : MESSAGE_MENU_PREVIEW_SPRING,
        };
      }
      return {
        opacity: 0,
        scale: 0.94,
        transition: reduceMotion ? REDUCED_FADE_OUT_TRANSITION : FADE_OUT_TRANSITION,
      };
    }
    return {
      y: top,
      height: openHeight,
      '--menu-preview-fade': clipped ? CLIP_FADE : '0px',
      opacity: 1,
      scale: 1,
      transition: reduceMotion ? REDUCED_TRANSITION : MESSAGE_MENU_PREVIEW_SPRING,
    };
  }, [closing, exitTop, naturalHeight, sourceRect.height, top, openHeight, clipped, reduceMotion]);

  // Mount-time only; later prop changes go through `animate`.
  const [initial] = useState<TargetAndTransition>(() => ({
    y: reduceMotion && height > 0 ? top : sourceRect.top,
    height: reduceMotion && height > 0 ? height : sourceRect.height,
    '--menu-preview-fade': '0px',
    opacity: 1,
    scale: 1,
  }));

  return (
    <motion.div
      aria-hidden
      initial={initial}
      animate={target}
      exit={target}
      onAnimationComplete={() => {
        if (closing) fireExitComplete();
      }}
      style={{
        position: 'fixed',
        top: 0,
        left: sourceRect.left,
        width: sourceRect.width,
        overflow: 'hidden',
        pointerEvents: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        zIndex: 9999,
        willChange: 'transform',
        transformOrigin: 'center top',
        maskImage: MASK,
        WebkitMaskImage: MASK,
      }}
    >
      <div ref={hostRef} />
    </motion.div>
  );
};
