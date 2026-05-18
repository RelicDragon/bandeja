import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useMotionValueEvent } from 'framer-motion';
import type { BasicUser } from '@/types';
import { PlayerAvatar } from '@/components';
import type { CourtServeSide, LiveTeamSide } from '@/utils/liveScoring';

export type ServeCourtSchemaProps = {
  courtSide: CourtServeSide;
  serverTeam: LiveTeamSide;
  serverPlayerIndex: number;
  motionToken: string;
  teamAPlayers: BasicUser[];
  teamBPlayers: BasicUser[];
  courtEndsSwapped?: boolean;
  courtTeamASidesMirrored?: boolean;
  courtTeamBSidesMirrored?: boolean;
  /** Bench placement preview during serve setup (no ball, arrow, or service-box highlight). */
  endsSetup?: boolean;
  className?: string;
  'aria-label': string;
};

/** Bird's-eye: width = 10 m, height = 20 m (net at y = 10 m). One unit = 0.1 m. */
const VB = { w: 100, h: 200 };

/** FIP: service line 6.95 m from net (each side). */
const NET_Y = 100;
const SERVICE_FROM_NET = 69.5;
const Y_SERVICE_TOP = NET_Y - SERVICE_FROM_NET;
const Y_SERVICE_BOTTOM = NET_Y + SERVICE_FROM_NET;
/** Service box depth (net ↔ service line), each side. */
const H_SERVICE_BAND = SERVICE_FROM_NET;
/** Top-down net “thickness” in viewBox units (~1.0 m full band). */
const NET_HALF_H = 5;
const NET_Y0 = NET_Y - NET_HALF_H;
const NET_Y1 = NET_Y + NET_HALF_H;
/** Baseline avatars (server) and net-side partner during serve. */
const Y_BASELINE_TOP = 14;
const Y_BASELINE_BOTTOM = 186;
const Y_PARTNER_NET_TOP = 72;
const Y_PARTNER_NET_BOTTOM = 128;
/** Ball / arrow origin — nearer net than baseline avatars. */
const BALL_Y_TEAM_A = 156;
const BALL_Y_TEAM_B = 44;
/** Arrow ends inside diagonal service box, short of baseline avatars. */
const ARROW_END_Y_TOP = 56;
const ARROW_END_Y_BOTTOM = 144;
const ARROW_END_X_IN = 30;
const ARROW_END_X_OUT = 70;
const ARROW_DASH = 5.25;
const ARROW_GAP = 5.25;
const ARROW_STROKE = 2.1;
const M = 2;
const X1 = M;
const X2 = VB.w - M;
const MID_X = VB.w / 2;
const INNER_W = VB.w - 2 * M;
const COL_W = INNER_W / 2;
const COL_L_X = M;
const COL_R_X = MID_X;

const springTransition = { type: 'spring', stiffness: 380, damping: 30, mass: 0.65 } as const;

const px = (x: number) => (x / VB.w) * 100;
const py = (y: number) => (y / VB.h) * 100;

function visualEnd(team: LiveTeamSide, endsSwapped: boolean): 'top' | 'bottom' {
  const aOnBottom = !endsSwapped;
  if (team === 'teamA') return aOnBottom ? 'bottom' : 'top';
  return aOnBottom ? 'top' : 'bottom';
}

/** Baseline end faces the net: bottom → north (deuce east), top → south (deuce west). */
function serveTargetIsWest(serverTeam: LiveTeamSide, courtSide: CourtServeSide, endsSwapped: boolean): boolean {
  const isRightDeuce = courtSide === 'rightDeuce';
  return visualEnd(serverTeam, endsSwapped) === 'top' ? isRightDeuce : !isRightDeuce;
}

function ballYForEnd(end: 'top' | 'bottom'): number {
  return end === 'bottom' ? BALL_Y_TEAM_A : BALL_Y_TEAM_B;
}

/** Single parabolic arc (one `Q` control = no S‑inflection). */
function serveDiagonalArrowD(serverEnd: 'top' | 'bottom', westServe: boolean): string {
  const cx = MID_X;
  if (serverEnd === 'bottom') {
    const cy = 78;
    return westServe
      ? `M 26 ${BALL_Y_TEAM_A} Q ${cx} ${cy} ${ARROW_END_X_OUT} ${ARROW_END_Y_TOP}`
      : `M 74 ${BALL_Y_TEAM_A} Q ${cx} ${cy} ${ARROW_END_X_IN} ${ARROW_END_Y_TOP}`;
  }
  const cy = 128;
  return westServe
    ? `M 26 ${BALL_Y_TEAM_B} Q ${cx} ${cy} ${ARROW_END_X_OUT} ${ARROW_END_Y_BOTTOM}`
    : `M 74 ${BALL_Y_TEAM_B} Q ${cx} ${cy} ${ARROW_END_X_IN} ${ARROW_END_Y_BOTTOM}`;
}

const throwEase = [0.12, 0.82, 0.22, 1] as const;
const throwDuration = 0.58;

type PathTip = { x: number; y: number; rot: number };

function pathTipAt(path: SVGPathElement, len: number, t: number): PathTip {
  const clamped = Math.max(0, Math.min(1, t));
  const at = clamped * len;
  const pt = path.getPointAtLength(at);
  const back = Math.max(0, at - 2);
  const toAt = clamped >= 1 ? len : Math.min(len, at + 2);
  const from = path.getPointAtLength(back);
  const to = path.getPointAtLength(Math.max(back + 0.01, toAt));
  const rot = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
  return { x: pt.x, y: pt.y, rot };
}

/** Mask reveal stroke — grows visible length along path (works with dashed stroke underneath). */
function maskRevealAt(len: number, p: number): { strokeDasharray: string; strokeDashoffset: number } {
  if (len <= 0) return { strokeDasharray: '0 1', strokeDashoffset: 0 };
  const t = Math.max(0, Math.min(1, p));
  return { strokeDasharray: `${len} ${len}`, strokeDashoffset: len * (1 - t) };
}

/** Arrow tip starts at path origin (ball icon); dashed trail grows only behind the tip. */
function ServeArrowTrace({ d, motionKey }: { d: string; motionKey: string }) {
  const maskId = useId().replace(/:/g, '');
  const pathRef = useRef<SVGPathElement>(null);
  const progress = useMotionValue(0);
  const [tip, setTip] = useState<PathTip | null>(null);
  const [maskReveal, setMaskReveal] = useState({ strokeDasharray: '0 1', strokeDashoffset: 0 });

  const syncFrame = (p: number) => {
    const el = pathRef.current;
    if (!el) return;
    const len = el.getTotalLength();
    if (len <= 0) return;
    setMaskReveal(maskRevealAt(len, p));
    setTip(pathTipAt(el, len, p));
  };

  useLayoutEffect(() => {
    progress.set(0);
    syncFrame(0);
  }, [d, progress]);

  useMotionValueEvent(progress, 'change', syncFrame);

  useEffect(() => {
    let cancelled = false;

    const runThrow = () => {
      const el = pathRef.current;
      const len = el?.getTotalLength() ?? 0;
      if (!el || len <= 0) {
        requestAnimationFrame(runThrow);
        return;
      }

      void (async () => {
        progress.stop();
        progress.set(0);
        syncFrame(0);

        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        if (cancelled) return;

        await animate(progress, 1, { duration: throwDuration, ease: throwEase });
      })();
    };

    runThrow();

    return () => {
      cancelled = true;
      progress.stop();
    };
  }, [motionKey, d, progress]);

  return (
    <svg viewBox={`0 0 ${VB.w} ${VB.h}`} className="absolute inset-0 size-full" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse">
          <path
            d={d}
            fill="none"
            stroke="white"
            strokeWidth={ARROW_STROKE + 4}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={maskReveal.strokeDasharray}
            strokeDashoffset={maskReveal.strokeDashoffset}
          />
        </mask>
      </defs>
      <path
        ref={pathRef}
        d={d}
        fill="none"
        className="stroke-primary-600 dark:stroke-primary-300"
        strokeWidth={ARROW_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={`${ARROW_DASH} ${ARROW_GAP}`}
        strokeDashoffset={0}
        mask={`url(#${maskId})`}
        opacity={0.88}
      />
      {tip ? (
        <g transform={`translate(${tip.x} ${tip.y}) rotate(${tip.rot})`}>
          <polygon
            points="0,-2.4 4.8,0 0,2.4"
            className="fill-primary-600 dark:fill-primary-300"
          />
        </g>
      ) : null}
    </svg>
  );
}

function ballPct(
  serverTeam: LiveTeamSide,
  courtSide: CourtServeSide,
  endsSwapped: boolean
): { left: number; top: number } {
  const west = serveTargetIsWest(serverTeam, courtSide, endsSwapped);
  const x = west ? 26 : 74;
  const y = ballYForEnd(visualEnd(serverTeam, endsSwapped));
  return { left: px(x), top: py(y) };
}

function avatarY(end: 'top' | 'bottom', depth: 'baseline' | 'net'): number {
  if (end === 'top') return depth === 'net' ? py(Y_PARTNER_NET_TOP) : py(Y_BASELINE_TOP);
  return depth === 'net' ? py(Y_PARTNER_NET_BOTTOM) : py(Y_BASELINE_BOTTOM);
}

function baselineAvatarLayout(
  players: BasicUser[],
  end: 'top' | 'bottom',
  team: LiveTeamSide,
  serverTeam: LiveTeamSide,
  courtSide: CourtServeSide,
  serverPlayerIndex: number,
  endsSwapped: boolean,
  teamASidesMirrored: boolean,
  teamBSidesMirrored: boolean,
  baselineOnly = false
): { left: number; top: number; player: BasicUser | null; idx: number }[] {
  const baselineY = avatarY(end, 'baseline');
  const netY = avatarY(end, 'net');
  const xR = px(74);
  const xL = px(26);
  const teamMirrored = team === 'teamA' ? teamASidesMirrored : teamBSidesMirrored;
  const west = serveTargetIsWest(serverTeam, courtSide, endsSwapped);
  const serverX = west ? xL : xR;
  const partnerX = west ? xR : xL;
  const serving = !baselineOnly && serverTeam === team;
  const pair = players.slice(0, 2);
  const n = pair.length;
  if (n === 0) return [];
  if (n === 1) {
    return [{ left: serving ? serverX : 50, top: baselineY, player: pair[0] ?? null, idx: 0 }];
  }
  const si = Math.min(Math.max(0, serverPlayerIndex), n - 1);
  const p0Left = teamMirrored ? xL : xR;
  const p1Left = teamMirrored ? xR : xL;
  if (!serving) {
    return [
      { left: p0Left, top: baselineY, player: pair[0] ?? null, idx: 0 },
      { left: p1Left, top: baselineY, player: pair[1] ?? null, idx: 1 },
    ];
  }
  return [0, 1].map((idx) => ({
    idx,
    player: pair[idx] ?? null,
    left: idx === si ? serverX : partnerX,
    top: idx === si ? baselineY : netY,
  }));
}

export function ServeCourtSchema({
  courtSide,
  serverTeam,
  serverPlayerIndex,
  motionToken,
  teamAPlayers,
  teamBPlayers,
  courtEndsSwapped = false,
  courtTeamASidesMirrored = false,
  courtTeamBSidesMirrored = false,
  endsSetup = false,
  className,
  'aria-label': ariaLabel,
}: ServeCourtSchemaProps) {
  const rawId = useId().replace(/:/g, '');
  const netMeshPatternId = `net-mesh-${rawId}`;
  const westServe = serveTargetIsWest(serverTeam, courtSide, courtEndsSwapped);
  const ball = ballPct(serverTeam, courtSide, courtEndsSwapped);
  const serverEnd = visualEnd(serverTeam, courtEndsSwapped);
  const arrowD = serveDiagonalArrowD(serverEnd, westServe);
  const showServeOverlay = !endsSetup;
  const topPlayers = courtEndsSwapped ? teamAPlayers : teamBPlayers;
  const bottomPlayers = courtEndsSwapped ? teamBPlayers : teamAPlayers;
  const topTeam = courtEndsSwapped ? 'teamA' : 'teamB';
  const bottomTeam = courtEndsSwapped ? 'teamB' : 'teamA';
  const topSlots = baselineAvatarLayout(
    topPlayers,
    'top',
    topTeam,
    serverTeam,
    courtSide,
    serverPlayerIndex,
    courtEndsSwapped,
    courtTeamASidesMirrored,
    courtTeamBSidesMirrored,
    endsSetup
  );
  const bottomSlots = baselineAvatarLayout(
    bottomPlayers,
    'bottom',
    bottomTeam,
    serverTeam,
    courtSide,
    serverPlayerIndex,
    courtEndsSwapped,
    courtTeamASidesMirrored,
    courtTeamBSidesMirrored,
    endsSetup
  );

  const highlightTop = showServeOverlay && serverEnd === 'top';
  const highlightBottom = showServeOverlay && serverEnd === 'bottom';

  const rosterServeIdx = (team: LiveTeamSide, n: number) => {
    if (serverTeam !== team || n === 0) return -1;
    return n <= 1 ? 0 : Math.min(Math.max(0, serverPlayerIndex), n - 1);
  };
  const idxA = rosterServeIdx('teamA', teamAPlayers.length);
  const idxB = rosterServeIdx('teamB', teamBPlayers.length);
  const serverRing = (team: LiveTeamSide, slotIdx: number) =>
    !endsSetup && (team === 'teamA' ? idxA === slotIdx : idxB === slotIdx)
      ? 'ring-2 ring-primary-500 ring-offset-1 ring-offset-white dark:ring-offset-gray-900'
      : '';

  const rootClass = endsSetup
    ? `pointer-events-none relative mx-auto shrink-0 overflow-hidden ${className ?? ''}`
    : `relative mx-auto aspect-[1/2] w-full max-w-[min(100%,17rem)] shrink-0 ${className ?? ''}`;

  return (
    <div className={rootClass}>
      <svg
        role="img"
        aria-label={ariaLabel}
        viewBox={`0 0 ${VB.w} ${VB.h}`}
        className={`absolute inset-0 size-full text-gray-500 dark:text-gray-400${endsSetup ? ' pointer-events-none' : ''}`}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id={netMeshPatternId} width={3.5} height={3.5} patternUnits="userSpaceOnUse">
            <rect width={3.5} height={3.5} fill="#e2eaf3" />
            <path d="M0 0 H3.5 M0 0 V3.5" fill="none" stroke="#8fa3b8" strokeOpacity={0.55} strokeWidth={0.35} />
          </pattern>
        </defs>
        <rect x={M} y={M} width={VB.w - 2 * M} height={VB.h - 2 * M} rx="3" className="fill-none stroke-current stroke-[0.9]" />
        <line x1={X1} y1={Y_SERVICE_TOP} x2={X2} y2={Y_SERVICE_TOP} className="stroke-current stroke-[0.7]" opacity={0.55} />
        <line x1={X1} y1={Y_SERVICE_BOTTOM} x2={X2} y2={Y_SERVICE_BOTTOM} className="stroke-current stroke-[0.7]" opacity={0.55} />
        <line x1={MID_X} y1={Y_SERVICE_TOP} x2={MID_X} y2={NET_Y0} className="stroke-current stroke-[0.85]" opacity={0.82} />
        <line x1={MID_X} y1={NET_Y1} x2={MID_X} y2={Y_SERVICE_BOTTOM} className="stroke-current stroke-[0.85]" opacity={0.82} />

        <rect x={M} y={M} width={INNER_W} height={NET_Y - M} rx="2" className="fill-gray-200/25 dark:fill-gray-700/20" />
        <rect x={M} y={NET_Y} width={INNER_W} height={VB.h - NET_Y - M} rx="2" className="fill-gray-200/25 dark:fill-gray-700/20" />

        {highlightTop ? (
          <>
            <rect
              x={COL_L_X}
              y={Y_SERVICE_TOP}
              width={COL_W}
              height={H_SERVICE_BAND}
              rx="2"
              className={
                westServe
                  ? 'fill-primary-500/30 stroke-primary-600 stroke-[1.25] dark:fill-primary-400/22 dark:stroke-primary-300'
                  : 'fill-gray-300/40 stroke-none dark:fill-gray-600/30'
              }
            />
            <rect
              x={COL_R_X}
              y={Y_SERVICE_TOP}
              width={COL_W}
              height={H_SERVICE_BAND}
              rx="2"
              className={
                westServe
                  ? 'fill-gray-300/40 stroke-none dark:fill-gray-600/30'
                  : 'fill-primary-500/30 stroke-primary-600 stroke-[1.25] dark:fill-primary-400/22 dark:stroke-primary-300'
              }
            />
          </>
        ) : null}

        {highlightBottom ? (
          <>
            <rect
              x={COL_L_X}
              y={NET_Y}
              width={COL_W}
              height={H_SERVICE_BAND}
              rx="2"
              className={
                westServe
                  ? 'fill-primary-500/30 stroke-primary-600 stroke-[1.25] dark:fill-primary-400/22 dark:stroke-primary-300'
                  : 'fill-gray-300/40 stroke-none dark:fill-gray-600/30'
              }
            />
            <rect
              x={COL_R_X}
              y={NET_Y}
              width={COL_W}
              height={H_SERVICE_BAND}
              rx="2"
              className={
                westServe
                  ? 'fill-gray-300/40 stroke-none dark:fill-gray-600/30'
                  : 'fill-primary-500/30 stroke-primary-600 stroke-[1.25] dark:fill-primary-400/22 dark:stroke-primary-300'
              }
            />
          </>
        ) : null}

        <g>
          <rect x={X1} y={NET_Y0 - 0.4} width={2} height={NET_Y1 - NET_Y0 + 0.8} rx={0.25} fill="#b9c6d4" stroke="#9aacbc" strokeWidth={0.15} />
          <rect x={X2 - 2} y={NET_Y0 - 0.4} width={2} height={NET_Y1 - NET_Y0 + 0.8} rx={0.25} fill="#b9c6d4" stroke="#9aacbc" strokeWidth={0.15} />
          <rect
            x={X1}
            y={NET_Y0 + 0.45}
            width={X2 - X1}
            height={Math.max(0.1, NET_Y1 - NET_Y0 - 0.9)}
            fill={`url(#${netMeshPatternId})`}
            stroke="#9aacbc"
            strokeWidth={0.2}
          />
          <line x1={X1} y1={NET_Y1} x2={X2} y2={NET_Y1} stroke="#7d8fa3" strokeWidth={0.8} strokeLinecap="square" />
          <line x1={X1} y1={NET_Y0} x2={X2} y2={NET_Y0} stroke="#dce6f0" strokeWidth={2.45} strokeLinecap="square" />
          <line x1={X1} y1={NET_Y0} x2={X2} y2={NET_Y0} stroke="#9aacbc" strokeWidth={0.5} strokeLinecap="square" />
        </g>
      </svg>

      {showServeOverlay ? (
        <div className="pointer-events-none absolute inset-0 z-[2]" aria-hidden>
          <ServeArrowTrace
            key={`${serverTeam}-${courtSide}-${motionToken}`}
            motionKey={`${serverTeam}-${courtSide}-${motionToken}`}
            d={arrowD}
          />
          <motion.div
            className="absolute flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
            initial={false}
            animate={{ left: `${ball.left}%`, top: `${ball.top}%` }}
            transition={springTransition}
          >
            <span className="size-5 shrink-0 rounded-full border border-lime-950/30 bg-gradient-to-br from-[#f4ff9a] via-[#e8fc38] to-[#b8cf0a] shadow-[inset_0_1px_2px_rgba(255,255,255,0.75),inset_0_-2px_3px_rgba(0,0,0,0.12),0_1px_3px_rgba(0,0,0,0.35),0_0_12px_rgba(220,252,80,0.55)]" />
          </motion.div>
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-0 z-[3] overflow-hidden" aria-hidden>
        {endsSetup
          ? topSlots.map((s) => (
              <motion.div
                key={`setup-${s.player?.id ?? `${topTeam}-top-${s.idx}`}`}
                className="absolute flex -translate-x-1/2 -translate-y-1/2 justify-center rounded-full"
                initial={false}
                animate={{ left: `${s.left}%`, top: `${s.top}%` }}
                transition={springTransition}
              >
                <PlayerAvatar player={s.player} inlineFace inlineFacePlain inlineFaceSize="sm" asDiv subscribePresence={false} />
              </motion.div>
            ))
          : null}
        {endsSetup
          ? bottomSlots.map((s) => (
              <motion.div
                key={`setup-${s.player?.id ?? `${bottomTeam}-bottom-${s.idx}`}`}
                className="absolute flex -translate-x-1/2 -translate-y-1/2 justify-center rounded-full"
                initial={false}
                animate={{ left: `${s.left}%`, top: `${s.top}%` }}
                transition={springTransition}
              >
                <PlayerAvatar player={s.player} inlineFace inlineFacePlain inlineFaceSize="sm" asDiv subscribePresence={false} />
              </motion.div>
            ))
          : null}
        {!endsSetup
          ? topSlots.map((s) => (
              <motion.div
                key={`tb-${s.idx}`}
                className={`absolute flex -translate-x-1/2 -translate-y-1/2 justify-center ${serverRing(topTeam, s.idx)} rounded-full`}
                initial={false}
                animate={{ left: `${s.left}%`, top: `${s.top}%` }}
                transition={springTransition}
              >
                <PlayerAvatar player={s.player} inlineFace inlineFacePlain inlineFaceSize="sm" asDiv subscribePresence={false} />
              </motion.div>
            ))
          : null}
        {!endsSetup
          ? bottomSlots.map((s) => (
              <motion.div
                key={`ta-${s.idx}`}
                className={`absolute flex -translate-x-1/2 -translate-y-1/2 justify-center ${serverRing(bottomTeam, s.idx)} rounded-full`}
                initial={false}
                animate={{ left: `${s.left}%`, top: `${s.top}%` }}
                transition={springTransition}
              >
                <PlayerAvatar player={s.player} inlineFace inlineFacePlain inlineFaceSize="sm" asDiv subscribePresence={false} />
              </motion.div>
            ))
          : null}
      </div>
    </div>
  );
}
