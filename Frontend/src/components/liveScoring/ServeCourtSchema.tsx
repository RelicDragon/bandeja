import { useId } from 'react';
import { motion } from 'framer-motion';
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
/** Ball / arrow origin — nearer net than baseline avatars. */
const BALL_Y_TEAM_A = 156;
const BALL_Y_TEAM_B = 44;
/** Arrow ends inside diagonal service box, short of baseline avatars. */
const ARROW_END_Y_TOP = 56;
const ARROW_END_Y_BOTTOM = 144;
const ARROW_END_X_IN = 30;
const ARROW_END_X_OUT = 70;
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

/** Bird's-eye: team A (bottom) faces north — deuce is diagram-east. Team B (top) faces south — deuce is diagram-west. */
function serveTargetIsWest(serverTeam: LiveTeamSide, courtSide: CourtServeSide): boolean {
  return (serverTeam === 'teamA') === (courtSide === 'leftAd');
}

/** Single parabolic arc (one `Q` control = no S‑inflection). */
function serveDiagonalArrowD(serverTeam: LiveTeamSide, westServe: boolean): string {
  const cx = MID_X;
  if (serverTeam === 'teamA') {
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

function ballPct(serverTeam: LiveTeamSide, courtSide: CourtServeSide): { left: number; top: number } {
  const west = serveTargetIsWest(serverTeam, courtSide);
  const x = west ? 26 : 74;
  const y = serverTeam === 'teamA' ? BALL_Y_TEAM_A : BALL_Y_TEAM_B;
  return { left: px(x), top: py(y) };
}

function baselineAvatarLayout(
  players: BasicUser[],
  end: 'top' | 'bottom',
  team: LiveTeamSide,
  serverTeam: LiveTeamSide,
  courtSide: CourtServeSide,
  serverPlayerIndex: number
): { left: number; top: number; player: BasicUser | null; idx: number }[] {
  const topY = end === 'top' ? py(14) : py(186);
  const xR = px(74);
  const xL = px(26);
  const west = serveTargetIsWest(serverTeam, courtSide);
  const serverX = west ? xL : xR;
  const partnerX = west ? xR : xL;
  const serving = serverTeam === team;
  const pair = players.slice(0, 2);
  const n = pair.length;
  if (n === 0) return [];
  if (n === 1) {
    return [{ left: serving ? serverX : 50, top: topY, player: pair[0] ?? null, idx: 0 }];
  }
  const si = Math.min(Math.max(0, serverPlayerIndex), n - 1);
  if (!serving) {
    return [
      { left: xL, top: topY, player: pair[0] ?? null, idx: 0 },
      { left: xR, top: topY, player: pair[1] ?? null, idx: 1 },
    ];
  }
  return [0, 1].map((idx) => ({
    idx,
    player: pair[idx] ?? null,
    left: idx === si ? serverX : partnerX,
    top: topY,
  }));
}

export function ServeCourtSchema({
  courtSide,
  serverTeam,
  serverPlayerIndex,
  motionToken,
  teamAPlayers,
  teamBPlayers,
  className,
  'aria-label': ariaLabel,
}: ServeCourtSchemaProps) {
  const rawId = useId().replace(/:/g, '');
  const arrowMarkerId = `serve-arrow-${rawId}`;
  const netMeshPatternId = `net-mesh-${rawId}`;
  const westServe = serveTargetIsWest(serverTeam, courtSide);
  const ball = ballPct(serverTeam, courtSide);
  const arrowD = serveDiagonalArrowD(serverTeam, westServe);
  const topSlots = baselineAvatarLayout(teamBPlayers, 'top', 'teamB', serverTeam, courtSide, serverPlayerIndex);
  const bottomSlots = baselineAvatarLayout(teamAPlayers, 'bottom', 'teamA', serverTeam, courtSide, serverPlayerIndex);

  const highlightTop = serverTeam === 'teamB';
  const highlightBottom = serverTeam === 'teamA';

  const rosterServeIdx = (team: LiveTeamSide, n: number) => {
    if (serverTeam !== team || n === 0) return -1;
    return n <= 1 ? 0 : Math.min(Math.max(0, serverPlayerIndex), n - 1);
  };
  const idxA = rosterServeIdx('teamA', teamAPlayers.length);
  const idxB = rosterServeIdx('teamB', teamBPlayers.length);
  const serverRing = (team: LiveTeamSide, slotIdx: number) =>
    (team === 'teamA' ? idxA === slotIdx : idxB === slotIdx)
      ? 'ring-2 ring-primary-500 ring-offset-1 ring-offset-white dark:ring-offset-gray-900'
      : '';

  return (
    <div
      className={`relative mx-auto aspect-[1/2] w-full max-w-[min(100%,17rem)] shrink-0 ${className ?? ''}`}
    >
      <svg
        role="img"
        aria-label={ariaLabel}
        viewBox={`0 0 ${VB.w} ${VB.h}`}
        className="absolute inset-0 size-full text-gray-500 dark:text-gray-400"
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

      <div className="pointer-events-none absolute inset-0 z-[2]" aria-hidden>
        <svg viewBox={`0 0 ${VB.w} ${VB.h}`} className="absolute inset-0 size-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <marker
              id={arrowMarkerId}
              markerWidth="6"
              markerHeight="6"
              refX="5.2"
              refY="3"
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <polygon points="0 0, 6 3, 0 6" className="fill-primary-600 dark:fill-primary-300" />
            </marker>
          </defs>
          <motion.path
            key={`${serverTeam}-${courtSide}-${motionToken}`}
            d={arrowD}
            fill="none"
            className="stroke-primary-600 dark:stroke-primary-300"
            strokeWidth={2.1}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="0 5.25"
            markerEnd={`url(#${arrowMarkerId})`}
            initial={{ opacity: 0.35 }}
            animate={{ opacity: 0.88 }}
            transition={{ duration: 0.28 }}
          />
        </svg>
        <motion.div
          id={`serve-ball-${motionToken}`}
          className="absolute flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
          initial={false}
          animate={{ left: `${ball.left}%`, top: `${ball.top}%` }}
          transition={springTransition}
        >
          <span
            className="size-5 shrink-0 rounded-full border border-lime-950/30 bg-gradient-to-br from-[#f4ff9a] via-[#e8fc38] to-[#b8cf0a] shadow-[inset_0_1px_2px_rgba(255,255,255,0.75),inset_0_-2px_3px_rgba(0,0,0,0.12),0_1px_3px_rgba(0,0,0,0.35),0_0_12px_rgba(220,252,80,0.55)]"
          />
        </motion.div>
      </div>

      <div className="pointer-events-none absolute inset-0 z-[3]" aria-hidden>
        {topSlots.map((s) => (
          <motion.div
            key={`tb-${s.idx}`}
            className={`absolute flex -translate-x-1/2 -translate-y-1/2 justify-center ${serverRing('teamB', s.idx)} rounded-full`}
            initial={false}
            animate={{ left: `${s.left}%`, top: `${s.top}%` }}
            transition={springTransition}
          >
            <PlayerAvatar player={s.player} inlineFace inlineFacePlain inlineFaceSize="sm" asDiv subscribePresence={false} />
          </motion.div>
        ))}
        {bottomSlots.map((s) => (
          <motion.div
            key={`ta-${s.idx}`}
            className={`absolute flex -translate-x-1/2 -translate-y-1/2 justify-center ${serverRing('teamA', s.idx)} rounded-full`}
            initial={false}
            animate={{ left: `${s.left}%`, top: `${s.top}%` }}
            transition={springTransition}
          >
            <PlayerAvatar player={s.player} inlineFace inlineFacePlain inlineFaceSize="sm" asDiv subscribePresence={false} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}
