import { useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

/** Typing speed (chars/s) with no backlog: one or two characters per frame. */
const BASE_CHARS_PER_SEC = 55;
/** Extra speed per char of backlog, so a long burst still types out instead of lagging forever. */
const BACKLOG_BOOST_PER_SEC = 0.9;
/** Cap: about 4 chars per frame at 60 fps, still visibly typed, never a pasted chunk. */
const MAX_CHARS_PER_SEC = 240;
/** Re-render (and re-parse markdown) at most this often. */
const COMMIT_INTERVAL_MS = 16;

/** Don't cut a UTF-16 surrogate pair (emoji) in half. */
function safeCut(text: string, n: number): number {
  const code = text.charCodeAt(n - 1);
  return code >= 0xd800 && code <= 0xdbff ? n + 1 : n;
}

/**
 * Text typed out character by character instead of landing in network-sized chunks.
 * `animate`: the text is streaming or arrived after the chat opened. Text that was never
 * animated on this mount (history) shows at once; once animated it keeps typing until it
 * catches up, even after the stream ends (the persisted copy keeps the same React key).
 */
export function useSmoothText(target: string, animate: boolean): { text: string; revealing: boolean } {
  const reducedMotion = usePrefersReducedMotion();
  const animatedRef = useRef(animate);
  if (animate) animatedRef.current = true;
  const typing = animatedRef.current && !reducedMotion;

  const [shown, setShown] = useState(() => (typing ? 0 : target.length));
  const accRef = useRef(shown);

  useEffect(() => {
    if (!typing) {
      accRef.current = target.length;
      return;
    }
    // A rewritten / shorter text: never show past the new end.
    if (accRef.current > target.length) accRef.current = target.length;
    let raf = 0;
    let last = performance.now();
    let lastCommit = 0;
    const tick = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      const backlog = target.length - accRef.current;
      if (backlog <= 0) {
        setShown(target.length);
        return;
      }
      const rate = Math.min(MAX_CHARS_PER_SEC, BASE_CHARS_PER_SEC + backlog * BACKLOG_BOOST_PER_SEC);
      accRef.current = Math.min(target.length, accRef.current + (rate * dt) / 1000);
      if (now - lastCommit >= COMMIT_INTERVAL_MS || accRef.current >= target.length) {
        lastCommit = now;
        setShown(Math.floor(accRef.current));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, typing]);

  // Not typing (history, reduced motion): the whole text now, not after the effect's extra render.
  if (!typing) return { text: target, revealing: false };
  const end = Math.min(target.length, safeCut(target, shown));
  return { text: target.slice(0, end), revealing: end < target.length };
}
