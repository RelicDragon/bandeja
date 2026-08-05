import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PoolMember } from '@/api/playIntents';
import { mismatchLabel } from './mismatchLabel';

type ArenaSize = { width: number; height: number };
type Position = { x: number; y: number };

type Props = {
  /** Live avatar positions, keyed by userId — same ref the arena mutates each frame. */
  positionsRef: React.MutableRefObject<Map<string, Position>>;
  arenaSizeRef: React.MutableRefObject<ArenaSize>;
  /** Far-field members carrying a mismatch reason (already filtered by the arena). */
  members: PoolMember[];
};

const MAX_VISIBLE = 2;
const CYCLE_MS = 4500;

/** Bubbles float above the avatar so the tail points down at the head. */
const BUBBLE_OFFSET_Y = -5.5;
/** Keep the bubble this far inside the arena box so it's never cropped. */
const BUBBLE_MARGIN = 4;

type PlacedBubble = {
  /** translate3d for the bubble's top-left, in px. */
  transform: string;
  /** Where to put the tail (0..1 of the bubble width) so it points at the avatar. */
  tailRatio: number;
  /** Whether the tail should flip below (avatar below bubble) or stay above. */
  tailBelow: boolean;
};

/**
 * Positions a bubble so its body stays fully inside the arena box while the
 * tail stays anchored to the avatar. Computes the bubble's ideal center above
 * the avatar's head, then clamps the rectangle into the arena and shifts the
 * tail horizontally (and flips it vertically if needed) to keep pointing at
 * the player. `elW`/`elH` are the bubble's measured pixel dimensions.
 */
function placeBubble(
  x: number,
  y: number,
  arena: ArenaSize,
  elW: number,
  elH: number,
): PlacedBubble {
  const anchorXpx = (x / 100) * arena.width;
  const anchorYpx = ((y + BUBBLE_OFFSET_Y) / 100) * arena.height;

  // Ideal: bubble bottom-center at the anchor (floats above the head).
  const idealLeft = anchorXpx - elW / 2;
  const idealTop = anchorYpx - elH;

  // Clamp the bubble body inside the arena with a small margin.
  const left = Math.max(
    BUBBLE_MARGIN,
    Math.min(arena.width - elW - BUBBLE_MARGIN, idealLeft),
  );
  // Vertically prefer above; if that would crop the top, drop it below the
  // avatar instead so the tail flips downward.
  let top = idealTop;
  let tailBelow = false;
  if (top < BUBBLE_MARGIN) {
    // Place below the avatar: top = anchor (head) + small gap.
    top = anchorYpx + elH + 6;
    tailBelow = true;
  }
  top = Math.max(BUBBLE_MARGIN, Math.min(arena.height - elH - BUBBLE_MARGIN, top));

  // Tail x: where the avatar sits relative to the clamped bubble, as a ratio.
  const tailRatio = elW > 0 ? Math.max(0.12, Math.min(0.88, (anchorXpx - left) / elW)) : 0.5;

  return {
    transform: `translate3d(${left}px, ${top}px, 0)`,
    tailRatio,
    tailBelow,
  };
}

/**
 * Tiny message bubbles that explain why grayed-out far-field players don't fit
 * the viewer's play intent ("Plays mornings", "Different level", …). At most
 * {@link MAX_VISIBLE} are shown at once, cycling every {@link CYCLE_MS} with a
 * smooth fade. Each bubble tracks its drifting avatar through the shared
 * positions ref (no React re-render per frame).
 */
export function CourtLobbyMismatchBubbles({
  positionsRef,
  arenaSizeRef,
  members,
}: Props) {
  const { t } = useTranslation();

  // Deterministic order so the cycle doesn't reshuffle every render.
  const allIds = useMemo(
    () =>
      members
        .filter((m) => !!m.mismatch)
        .map((m) => m.userId)
        .sort((a, b) => a.localeCompare(b)),
    [members],
  );
  const memberById = useMemo(() => {
    const map = new Map<string, PoolMember>();
    for (const m of members) map.set(m.userId, m);
    return map;
  }, [members]);

  const [page, setPage] = useState(0);
  const pageRef = useRef(0);
  pageRef.current = page;

  const totalPages = Math.max(1, Math.ceil(allIds.length / MAX_VISIBLE));
  const safePage = Math.min(page, totalPages - 1);
  const visibleIds = useMemo(
    () =>
      new Set(
        allIds.slice(safePage * MAX_VISIBLE, safePage * MAX_VISIBLE + MAX_VISIBLE),
      ),
    [allIds, safePage],
  );

  // Cycle the active window on a timer; pause while the tab is hidden.
  useEffect(() => {
    if (allIds.length <= MAX_VISIBLE) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const advance = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      setPage((current) => {
        const pages = Math.max(1, Math.ceil(allIds.length / MAX_VISIBLE));
        return (current + 1) % pages;
      });
    };
    const start = () => {
      if (timer) return;
      timer = setInterval(advance, CYCLE_MS);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };
    start();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }
    return () => {
      stop();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
    };
  }, [allIds.length]);

  // Glue each visible bubble to its drifting avatar via a single rAF loop
  // (at most MAX_VISIBLE DOM writes per frame). The synchronous pass runs once
  // on mount / whenever the visible set changes so a freshly-shown bubble lands
  // on its avatar immediately, before the first animation frame. The rAF tick
  // re-reads the refs each frame so an arena resize or positions mutation is
  // picked up immediately instead of lagging until `allIds` changes.
  const bubbleEls = useRef(new Map<string, HTMLDivElement>());
  const tailEls = useRef(new Map<string, HTMLSpanElement>());
  useEffect(() => {
    const place = (ids: string[]) => {
      const positions = positionsRef.current;
      const arena = arenaSizeRef.current;
      for (const id of ids) {
        const pos = positions.get(id);
        const el = bubbleEls.current.get(id);
        const tail = tailEls.current.get(id);
        if (!pos || !el) continue;
        const placed = placeBubble(pos.x, pos.y, arena, el.offsetWidth, el.offsetHeight);
        el.style.transform = placed.transform;
        if (tail) {
          tail.style.left = `${placed.tailRatio * 100}%`;
          tail.dataset.below = placed.tailBelow ? 'true' : 'false';
        }
      }
    };
    place([...visibleIds]);

    let frame = 0;
    const tick = () => {
      const activeIds = allIds.slice(
        pageRef.current * MAX_VISIBLE,
        pageRef.current * MAX_VISIBLE + MAX_VISIBLE,
      );
      place(activeIds);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [allIds, positionsRef, arenaSizeRef, visibleIds]);

  if (allIds.length === 0) return null;

  return (
    <>
      {allIds.map((id) => {
        const member = memberById.get(id);
        const mismatch = member?.mismatch;
        if (!member || !mismatch) return null;
        const isVisible = visibleIds.has(id);
        return (
          <div
            key={id}
            ref={(el) => {
              if (el) bubbleEls.current.set(id, el);
              else bubbleEls.current.delete(id);
            }}
            className="court-lobby-arena__mismatch-bubble"
            data-visible={isVisible ? 'true' : 'false'}
            aria-hidden={!isVisible}
          >
            <span className="court-lobby-arena__mismatch-text">
              {mismatchLabel(t, mismatch)}
            </span>
            <span
              ref={(el) => {
                if (el) tailEls.current.set(id, el);
                else tailEls.current.delete(id);
              }}
              className="court-lobby-arena__mismatch-tail"
              aria-hidden
            />
          </div>
        );
      })}
    </>
  );
}
