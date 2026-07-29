import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { buildThunderPath, pointOnMatchRing } from './courtLobbyThunderPath';
import './CourtLobbyThunder.css';

export type ThunderActor = {
  id: string;
  affinity: 'near' | 'mid' | 'far';
  inProposal: boolean;
};

type PositionsRef = MutableRefObject<Map<string, { x: number; y: number }>>;

type Props = {
  actors: ThunderActor[];
  positionsRef: PositionsRef;
  active: boolean;
  cx?: number;
  cy?: number;
  ringRadius?: number;
};

const SLOT_COUNT = 3;

/** Imperative thunder — no React setState while animating. */
export function CourtLobbyThunder({
  actors,
  positionsRef,
  active,
  cx = 50,
  cy = 48,
  ringRadius = 11,
}: Props) {
  const glowRefs = useRef<(SVGPathElement | null)[]>([]);
  const coreRefs = useRef<(SVGPathElement | null)[]>([]);
  const groupRefs = useRef<(SVGGElement | null)[]>([]);
  const actorsRef = useRef(actors);
  actorsRef.current = actors;

  const rosterKey = useMemo(
    () =>
      actors
        .filter((a) => a.inProposal || a.affinity === 'near')
        .map((a) => `${a.id}:${a.affinity}:${a.inProposal ? 1 : 0}`)
        .sort()
        .join('|'),
    [actors],
  );

  useEffect(() => {
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!active || reduceMotion || !rosterKey) {
      for (const g of groupRefs.current) {
        if (g) g.style.opacity = '0';
      }
      return;
    }

    let tick = 0;
    let activeIds = new Set<string>();

    const fitActors = () =>
      actorsRef.current.filter((a) => a.inProposal || a.affinity === 'near');

    const paint = () => {
      const positions = positionsRef.current;
      const fit = fitActors().filter((a) => activeIds.has(a.id));
      for (let i = 0; i < SLOT_COUNT; i++) {
        const actor = fit[i];
        const group = groupRefs.current[i];
        const glow = glowRefs.current[i];
        const core = coreRefs.current[i];
        if (!group || !glow || !core) continue;
        if (!actor) {
          group.style.opacity = '0';
          continue;
        }
        const pos = positions.get(actor.id);
        if (!pos) {
          group.style.opacity = '0';
          continue;
        }
        const end = pointOnMatchRing(pos.x, pos.y, cx, cy, ringRadius);
        const seed = (tick * 97 + actor.id.charCodeAt(0) * 13 + Math.round(pos.x * 10)) | 0;
        const d = buildThunderPath(pos.x, pos.y, end.x, end.y, seed);
        glow.setAttribute('d', d);
        core.setAttribute('d', d);
        const strong = actor.inProposal || actor.affinity === 'near';
        group.classList.toggle('court-lobby-thunder__bolt--strong', strong);
        group.classList.toggle('court-lobby-thunder__bolt--soft', !strong);
        group.style.opacity = '1';
      }
    };

    const reshuffle = () => {
      const next = new Set<string>();
      for (const a of fitActors()) {
        if (Math.random() < 0.55) next.add(a.id);
      }
      activeIds =
        next.size > SLOT_COUNT
          ? new Set([...next].sort(() => Math.random() - 0.5).slice(0, SLOT_COUNT))
          : next;
      tick += 1;
      paint();
    };

    reshuffle();
    const pathTimer = window.setInterval(() => {
      tick += 1;
      paint();
    }, 180);
    const flashTimer = window.setInterval(reshuffle, 900);

    return () => {
      window.clearInterval(pathTimer);
      window.clearInterval(flashTimer);
    };
  }, [active, rosterKey, positionsRef, cx, cy, ringRadius]);

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full court-lobby-thunder"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <filter id="court-lobby-thunder-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="0.6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {Array.from({ length: SLOT_COUNT }, (_, i) => (
        <g
          key={i}
          ref={(el) => {
            groupRefs.current[i] = el;
          }}
          style={{ opacity: 0 }}
          className="court-lobby-thunder__bolt--strong"
        >
          <path
            ref={(el) => {
              glowRefs.current[i] = el;
            }}
            d="M 0,0"
            fill="none"
            className="court-lobby-thunder__glow"
            style={{ animationDelay: `${i * 0.2}s` }}
            filter="url(#court-lobby-thunder-glow)"
          />
          <path
            ref={(el) => {
              coreRefs.current[i] = el;
            }}
            d="M 0,0"
            fill="none"
            className="court-lobby-thunder__core"
            style={{ animationDelay: `${i * 0.2}s` }}
          />
        </g>
      ))}
    </svg>
  );
}
