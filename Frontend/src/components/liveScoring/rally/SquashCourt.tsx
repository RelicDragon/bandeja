import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { BasicUser } from '@/types';
import { ServeCourtPlayerAvatar } from '../ServeCourtPlayerAvatar';
import { SERVE_COURT_HIGHLIGHT_SQUASH } from '../serveCourtHighlight';
import type { LiveTeamSide } from '@/utils/liveScoring';
import type { CourtServeSide } from '@/utils/liveScoring/serveGuide';
import { serveSpringSettleMs, serveSpringTransition } from '../serveArrowMotion';
import type { RallyCourtProps } from './RallyCourtProps';
import { SquashCourtDiagram } from './SquashCourtDiagram';
import { SquashBallMarker } from './SquashBallMarker';
import { SquashServeTrace } from './SquashServeTrace';
import { LIVE_COURT_FIT_CLASS } from '../LiveCourtViewport';
import { serveGuideFrameForUiId } from '../serveGuideCourtFrame';
import {
  SQ_SCENE_MIN_X,
  SQ_SCENE_MIN_Y,
  SQ_SCENE_VIEW_BOX,
  SQ_SCENE_VB_H,
  SQ_SCENE_VB_W,
  sqAvatarScaleFromScreenY,
  sqSceneServeOverlay,
  sqServePlacement,
  sqSetupPlacement,
  sqSceneServiceBox,
} from './squashCourtLayout';

type SquashCourtProps = RallyCourtProps & {
  serverTeam?: LiveTeamSide;
  courtSide?: CourtServeSide;
  endsSetup?: boolean;
  motionToken?: string;
  'aria-label'?: string;
};

function pctX(x: number) {
  return ((x - SQ_SCENE_MIN_X) / SQ_SCENE_VB_W) * 100;
}

function pctY(y: number) {
  return ((y - SQ_SCENE_MIN_Y) / SQ_SCENE_VB_H) * 100;
}

export function SquashCourt({
  teamAPlayers,
  teamBPlayers,
  courtEndsSwapped = false,
  serverTeam,
  courtSide,
  endsSetup = false,
  motionToken,
  className,
  frameStyle,
  'aria-label': ariaLabel,
}: SquashCourtProps) {
  void ariaLabel;
  const uid = useId().replace(/:/g, '');
  const a0 = teamAPlayers[0];
  const b0 = teamBPlayers[0];
  const hasServe = serverTeam != null && courtSide != null && !endsSetup;

  const placement =
    hasServe && serverTeam && courtSide
      ? sqServePlacement({ serverTeam, courtEndsSwapped, courtSide })
      : null;

  const players: { team: LiveTeamSide; p: BasicUser; x: number; y: number; serving: boolean }[] = [];

  if (placement && serverTeam) {
    const recvTeam: LiveTeamSide = serverTeam === 'teamA' ? 'teamB' : 'teamA';
    players.push(
      { team: serverTeam, p: serverTeam === 'teamA' ? a0! : b0!, x: placement.server.x, y: placement.server.y, serving: true },
      { team: recvTeam, p: recvTeam === 'teamA' ? a0! : b0!, x: placement.receiver.x, y: placement.receiver.y, serving: false }
    );
  } else {
    for (const team of ['teamA', 'teamB'] as const) {
      const pos = sqSetupPlacement(team, courtEndsSwapped);
      const p = team === 'teamA' ? a0 : b0;
      if (p) players.push({ team, p, x: pos.x, y: pos.y, serving: serverTeam === team });
    }
  }

  const activeServiceBox =
    placement && hasServe ? sqSceneServiceBox(placement.serverZone) : undefined;

  const trace = placement
    ? sqSceneServeOverlay({
        serverZone: placement.serverZone,
        receiverZone: placement.receiverZone,
      })
    : null;

  const animKey = motionToken ?? `${serverTeam}-${courtSide}-${courtEndsSwapped}`;
  const [playersReady, setPlayersReady] = useState(false);
  const readyCountRef = useRef(0);
  const settleGenRef = useRef(0);
  const playerTargetRef = useRef(players.length);
  playerTargetRef.current = players.length;

  useEffect(() => {
    const gen = ++settleGenRef.current;
    readyCountRef.current = 0;
    setPlayersReady(false);
    const t = window.setTimeout(() => {
      if (settleGenRef.current === gen) setPlayersReady(true);
    }, serveSpringSettleMs);
    return () => window.clearTimeout(t);
  }, [animKey]);

  const onPlayerMoveComplete = useCallback(() => {
    const gen = settleGenRef.current;
    readyCountRef.current += 1;
    if (readyCountRef.current >= playerTargetRef.current && settleGenRef.current === gen) {
      setPlayersReady(true);
    }
  }, []);

  const fitted = className === LIVE_COURT_FIT_CLASS;
  const defaultFrame = serveGuideFrameForUiId('squash-board', endsSetup ? 'setup' : 'coach');
  const rootClass = fitted
    ? `relative mx-auto overflow-visible ${LIVE_COURT_FIT_CLASS}`
    : `relative mx-auto overflow-visible ${className ?? defaultFrame.className}`;
  const rootStyle = fitted ? undefined : (frameStyle ?? defaultFrame.style);

  return (
    <div className={rootClass} style={rootStyle}>
      <SquashCourtDiagram activeServiceBox={activeServiceBox} uid={uid} />
      {trace ? (
        <>
          <div className="pointer-events-none absolute inset-0 z-[4]" aria-hidden>
            <SquashServeTrace
              motionKey={animKey}
              viewBox={SQ_SCENE_VIEW_BOX}
              trace={trace}
              ready={playersReady}
            />
          </div>
          <div className="pointer-events-none absolute inset-0 z-[5]" aria-hidden>
            <SquashBallMarker leftPct={trace.ballLeftPct} topPct={trace.ballTopPct} />
          </div>
        </>
      ) : null}
      <div className="pointer-events-none absolute inset-0 z-[3]" aria-hidden>
        {players.map(({ p, x, y, serving }) => (
          <motion.div
            key={p.id}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center overflow-visible"
            initial={false}
            animate={{ left: `${pctX(x)}%`, top: `${pctY(y)}%` }}
            transition={serveSpringTransition}
            onAnimationComplete={onPlayerMoveComplete}
          >
            <ServeCourtPlayerAvatar
              player={p}
              scale={sqAvatarScaleFromScreenY(y)}
              servingHighlightClassName={serving ? SERVE_COURT_HIGHLIGHT_SQUASH : undefined}
            />
          </motion.div>
        ))}
      </div>
    </div>
  );
}
