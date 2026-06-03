import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { CourtServeSide } from '@/utils/liveScoring';
import type { RallyCourtProps } from './RallyCourtProps';
import { ServeCourtPlayerAvatar } from '../ServeCourtPlayerAvatar';
import { SERVE_COURT_HIGHLIGHT_CLASSIC } from '../serveCourtHighlight';
import { serveSpringSettleMs, serveSpringTransition } from '../serveArrowMotion';
import { serveGuideFrameForUiId } from '../serveGuideCourtFrame';
import { LIVE_COURT_FIT_CLASS } from '../LiveCourtViewport';
import { pdFlatPlayerSlots, pdServeArcReceiverPlayerIndex, pdServerEnd } from './padelCourtGeometry';
import { serveArcReceiverTeam, serveArcTraceEndpointsPadel } from './serveArcPlayerEndpoints';
import {
  PD_SCENE_MIN_X,
  PD_SCENE_MIN_Y,
  PD_SCENE_VIEW_BOX,
  PD_SCENE_VB_H,
  PD_SCENE_VB_W,
  pdAvatarScaleFromFlatY,
  pdProjectFlat,
  pdSceneServeGuideArtifacts,
  pdSceneServeOverlay,
  pdSceneServiceBox,
} from './padelCourtLayout';
import { PadelCourtDiagram } from './PadelCourtDiagram';
import { ServeArrowTrace } from '../ServeArrowTrace';
import { PadelBallMarker } from './PadelBallMarker';

export type PadelCourtProps = RallyCourtProps & {
  courtSide?: CourtServeSide;
  courtTeamASidesMirrored?: boolean;
  courtTeamBSidesMirrored?: boolean;
  'aria-label'?: string;
};

function pctX(x: number) {
  return ((x - PD_SCENE_MIN_X) / PD_SCENE_VB_W) * 100;
}

function pctY(y: number) {
  return ((y - PD_SCENE_MIN_Y) / PD_SCENE_VB_H) * 100;
}

export function PadelCourt({
  courtSide,
  serverTeam,
  serverPlayerIndex = 0,
  motionToken,
  teamAPlayers,
  teamBPlayers,
  teamAScore: _teamAScore,
  teamBScore: _teamBScore,
  courtEndsSwapped = false,
  courtTeamASidesMirrored = false,
  courtTeamBSidesMirrored = false,
  endsSetup = false,
  matchDoubles = false,
  className,
  frameStyle,
  'aria-label': ariaLabel,
}: PadelCourtProps) {
  void _teamAScore;
  void _teamBScore;
  void ariaLabel;
  const uid = useId().replace(/:/g, '');

  const layoutServe = serverTeam != null && courtSide != null;
  const showServeOverlay = layoutServe && !endsSetup;
  const serveTeam = serverTeam ?? 'teamA';
  const serveSide = courtSide ?? 'rightDeuce';
  const serveRight = serveSide === 'rightDeuce';
  const serverEnd = pdServerEnd(serveTeam, courtEndsSwapped);
  const flatSlots = pdFlatPlayerSlots({
    teamAPlayers,
    teamBPlayers,
    courtEndsSwapped,
    courtTeamASidesMirrored,
    courtTeamBSidesMirrored,
    serverTeam: serveTeam,
    serverPlayerIndex,
    courtSide: serveSide,
    matchDoubles,
    endsSetup,
    layoutServe,
  });

  const animKey = [
    motionToken ?? 'serve',
    serverTeam,
    courtSide,
    serverPlayerIndex,
    courtEndsSwapped,
    courtTeamASidesMirrored,
    courtTeamBSidesMirrored,
  ].join('|');

  const [playersReady, setPlayersReady] = useState(false);
  const readyCountRef = useRef(0);
  const settleGenRef = useRef(0);
  const playerTargetRef = useRef(0);

  const projectedSlots = flatSlots
    .filter((s) => s.player)
    .map((s) => {
      const pos = pdProjectFlat(s.x, s.y);
      return {
        ...s,
        px: pos.x,
        py: pos.y,
        avatarScale: pdAvatarScaleFromFlatY(s.y),
      };
    });
  playerTargetRef.current = projectedSlots.length;

  const serverSlot = projectedSlots.find((s) => s.team === serveTeam && s.idx === serverPlayerIndex);
  const serveGuide =
    showServeOverlay && serverSlot
      ? pdSceneServeGuideArtifacts(
          {
            serverTeam: serveTeam,
            courtSide: serveSide,
            courtEndsSwapped,
            matchDoubles,
            serverPlayerIndex,
          },
          { px: serverSlot.px, py: serverSlot.py, avatarScale: serverSlot.avatarScale ?? 1 }
        )
      : null;
  const topTeam = courtEndsSwapped ? 'teamA' : 'teamB';
  const bottomTeam = courtEndsSwapped ? 'teamB' : 'teamA';
  const receiverTeam = serveArcReceiverTeam(serverEnd, topTeam, bottomTeam);
  const serveArc =
    serveGuide && serverTeam
      ? serveArcTraceEndpointsPadel(
          serveGuide.ball,
          serveGuide.flatEnd,
          projectedSlots,
          receiverTeam,
          pdServeArcReceiverPlayerIndex({
            receiverTeam,
            westServe: serveRight,
            matchDoubles,
            courtTeamASidesMirrored,
            courtTeamBSidesMirrored,
          })
        )
      : null;
  const serveTrace =
    serveGuide && serveArc
      ? pdSceneServeOverlay(
          {
            serverTeam: serveTeam,
            courtSide: serveSide,
            courtEndsSwapped,
            matchDoubles,
            serverPlayerIndex,
          },
          { from: serveGuide.ball, to: serveArc.to }
        )
      : null;

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

  const activeServiceBox = showServeOverlay ? pdSceneServiceBox(serverEnd, serveRight) : undefined;

  const fitted = className === LIVE_COURT_FIT_CLASS;
  const defaultFrame = serveGuideFrameForUiId('padel-court', endsSetup ? 'setup' : 'coach');
  const rootClass = fitted
    ? `relative mx-auto overflow-visible ${LIVE_COURT_FIT_CLASS}`
    : `relative mx-auto overflow-visible ${className ?? defaultFrame.className}`;
  const rootStyle = fitted ? undefined : (frameStyle ?? defaultFrame.style);

  return (
    <div className={rootClass} style={rootStyle}>
      <PadelCourtDiagram uid={uid} activeServiceBox={activeServiceBox} />
      {serveTrace && serveGuide ? (
        <>
          <div className="pointer-events-none absolute inset-0 z-[4]" aria-hidden>
            {playersReady ? (
              <ServeArrowTrace motionKey={animKey} viewBox={PD_SCENE_VIEW_BOX} d={serveTrace.arrowD} />
            ) : null}
          </div>
          <div className="pointer-events-none absolute inset-0 z-[5]" aria-hidden>
            <PadelBallMarker leftPct={serveGuide.ballLeftPct} topPct={serveGuide.ballTopPct} />
          </div>
        </>
      ) : null}
      <div className="pointer-events-none absolute inset-0 z-[3]" aria-hidden>
        {projectedSlots.map(({ player, px, py, team, idx, avatarScale }) => {
          if (!player) return null;
          const serving = showServeOverlay && serverTeam === team && serverPlayerIndex === idx;
          return (
            <motion.div
              key={`${player.id}-${idx}`}
              className="absolute flex -translate-x-1/2 -translate-y-full items-end justify-center overflow-visible"
              initial={false}
              animate={{ left: `${pctX(px)}%`, top: `${pctY(py)}%` }}
              transition={serveSpringTransition}
              onAnimationComplete={onPlayerMoveComplete}
            >
              <ServeCourtPlayerAvatar
                player={player}
                scale={avatarScale}
                servingHighlightClassName={serving ? SERVE_COURT_HIGHLIGHT_CLASSIC : undefined}
              />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
