import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { motion } from 'framer-motion';
import type { BasicUser } from '@/types';
import { ServeCourtPlayerAvatar } from '../ServeCourtPlayerAvatar';
import { SERVE_COURT_HIGHLIGHT, courtPlayerIsServing } from '../serveCourtHighlight';
import type { CourtServeSide } from '@/utils/liveScoring';
import { ServeArcTrace } from './ServeArcTrace';
import { TennisBallMarker } from './TennisBallMarker';
import { TennisCourtDiagram } from './TennisCourtDiagram';
import { serveSpringSettleMs, serveSpringTransition } from '../serveArrowMotion';
import { LIVE_COURT_FIT_CLASS } from '../LiveCourtViewport';
import { serveGuideFrameForUiId } from '../serveGuideCourtFrame';
import {
  tnPlayerXForSlot,
  tnPlayerYForEnd,
  tnServeArcReceiverPlayerIndex,
  tnServerEnd,
} from './tennisCourtGeometry';
import {
  TN_SCENE_MIN_X,
  TN_SCENE_MIN_Y,
  TN_SCENE_VB_H,
  TN_SCENE_VB_W,
  TN_SCENE_VIEW_BOX,
  tnAvatarScaleFromFlatY,
  tnProjectFlat,
  tnSceneServeArcControl,
  tnSceneServeGuideArtifacts,
  tnSceneServiceBox,
} from './tennisCourtLayout';
import { serveArcReceiverTeam, serveArcTraceEndpoints } from './serveArcPlayerEndpoints';
import type { LiveTeamSide } from '@/utils/liveScoring';

export type TennisCourtProps = {
  courtSide: CourtServeSide;
  serverTeam: LiveTeamSide;
  serverPlayerIndex: number;
  motionToken: string;
  teamAPlayers: BasicUser[];
  teamBPlayers: BasicUser[];
  courtEndsSwapped?: boolean;
  courtTeamASidesMirrored?: boolean;
  courtTeamBSidesMirrored?: boolean;
  endsSetup?: boolean;
  matchDoubles?: boolean;
  className?: string;
  frameStyle?: CSSProperties;
  'aria-label'?: string;
};

function pctX(x: number): number {
  return ((x - TN_SCENE_MIN_X) / TN_SCENE_VB_W) * 100;
}

function pctY(y: number): number {
  return ((y - TN_SCENE_MIN_Y) / TN_SCENE_VB_H) * 100;
}

export function TennisCourt({
  courtSide,
  serverTeam,
  serverPlayerIndex = 0,
  motionToken,
  teamAPlayers,
  teamBPlayers,
  courtEndsSwapped = false,
  courtTeamASidesMirrored: _courtTeamASidesMirrored = false,
  courtTeamBSidesMirrored: _courtTeamBSidesMirrored = false,
  endsSetup = false,
  matchDoubles = false,
  className,
  frameStyle,
  'aria-label': ariaLabel,
}: TennisCourtProps) {
  void ariaLabel;
  const uid = useId().replace(/:/g, '');
  const a0 = teamAPlayers[0];
  const a1 = teamAPlayers[1];
  const b0 = teamBPlayers[0];
  const b1 = teamBPlayers[1];

  const topTeam: LiveTeamSide = courtEndsSwapped ? 'teamA' : 'teamB';
  const bottomTeam: LiveTeamSide = courtEndsSwapped ? 'teamB' : 'teamA';
  const serveRight = courtSide === 'rightDeuce';
  const layoutServe = serverTeam != null && courtSide != null;
  const showServeOverlay = layoutServe && !endsSetup;
  const serverEnd = serverTeam ? tnServerEnd(serverTeam, courtEndsSwapped) : 'bottom';

  const slots: { x: number; y: number; p?: BasicUser; team: LiveTeamSide; idx: number }[] = matchDoubles
    ? [
        {
          x: tnPlayerXForSlot('top', 0, true, serveRight, layoutServe, serverPlayerIndex, serverEnd),
          y: tnPlayerYForEnd('top', layoutServe),
          p: topTeam === 'teamA' ? a0 : b0,
          team: topTeam,
          idx: 0,
        },
        {
          x: tnPlayerXForSlot('top', 1, true, serveRight, layoutServe, serverPlayerIndex, serverEnd),
          y: tnPlayerYForEnd('top', layoutServe),
          p: topTeam === 'teamA' ? a1 : b1,
          team: topTeam,
          idx: 1,
        },
        {
          x: tnPlayerXForSlot('bottom', 0, true, serveRight, layoutServe, serverPlayerIndex, serverEnd),
          y: tnPlayerYForEnd('bottom', layoutServe),
          p: bottomTeam === 'teamA' ? a0 : b0,
          team: bottomTeam,
          idx: 0,
        },
        {
          x: tnPlayerXForSlot('bottom', 1, true, serveRight, layoutServe, serverPlayerIndex, serverEnd),
          y: tnPlayerYForEnd('bottom', layoutServe),
          p: bottomTeam === 'teamA' ? a1 : b1,
          team: bottomTeam,
          idx: 1,
        },
      ]
    : [
        {
          x: tnPlayerXForSlot('top', 0, false, serveRight, layoutServe, serverPlayerIndex, serverEnd),
          y: tnPlayerYForEnd('top', layoutServe),
          p: topTeam === 'teamA' ? a0 : b0,
          team: topTeam,
          idx: 0,
        },
        {
          x: tnPlayerXForSlot('bottom', 0, false, serveRight, layoutServe, serverPlayerIndex, serverEnd),
          y: tnPlayerYForEnd('bottom', layoutServe),
          p: bottomTeam === 'teamA' ? a0 : b0,
          team: bottomTeam,
          idx: 0,
        },
      ];

  const serveGuide =
    showServeOverlay && serverTeam
      ? tnSceneServeGuideArtifacts({
          serverTeam,
          courtEndsSwapped,
          serveRight,
          matchDoubles,
          serverPlayerIndex,
        })
      : null;

  const animKey = motionToken ?? `${serverTeam}-${courtSide}-${serverPlayerIndex}-${courtEndsSwapped}`;
  const [playersReady, setPlayersReady] = useState(false);
  const readyCountRef = useRef(0);
  const settleGenRef = useRef(0);
  const playerTargetRef = useRef(0);

  const projectedSlots = slots
    .filter((s) => s.p)
    .map((s) => {
      const pos = tnProjectFlat(s.x, s.y);
      return { ...s, px: pos.x, py: pos.y, avatarScale: tnAvatarScaleFromFlatY(s.y) };
    });
  playerTargetRef.current = projectedSlots.length;

  const receiverTeam = serveArcReceiverTeam(serverEnd, topTeam, bottomTeam);
  const serveArc =
    serveGuide && serverTeam
      ? serveArcTraceEndpoints(
          serveGuide.ball,
          projectedSlots,
          receiverTeam,
          tnServeArcReceiverPlayerIndex({ matchDoubles })
        )
      : null;
  const serveArcControl = serveArc ? tnSceneServeArcControl(serveArc.from, serveArc.to) : null;

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

  const activeServiceBox =
    showServeOverlay && serverTeam
      ? tnSceneServiceBox(serverEnd, serveRight, matchDoubles)
      : undefined;

  const fitted = className === LIVE_COURT_FIT_CLASS;
  const defaultFrame = serveGuideFrameForUiId('tennis-court', endsSetup ? 'setup' : 'coach');
  const rootClass = fitted
    ? `relative mx-auto overflow-visible ${LIVE_COURT_FIT_CLASS}${endsSetup ? ' pointer-events-none' : ''}`
    : `relative mx-auto overflow-visible shrink-0 ${className ?? defaultFrame.className}${endsSetup ? ' pointer-events-none' : ''}`;
  const rootStyle = fitted ? undefined : (frameStyle ?? defaultFrame.style);

  return (
    <div className={rootClass} style={rootStyle}>
      <TennisCourtDiagram uid={uid} matchDoubles={matchDoubles} activeServiceBox={activeServiceBox} />
      {serveArc && serveGuide && serveArcControl ? (
        <>
          <div className="pointer-events-none absolute inset-0 z-[4]" aria-hidden>
            <ServeArcTrace
              motionKey={animKey}
              viewBox={TN_SCENE_VIEW_BOX}
              from={serveArc.from}
              to={serveArc.to}
              control={serveArcControl}
              ready={playersReady}
            />
          </div>
          <div className="pointer-events-none absolute inset-0 z-[5]" aria-hidden>
            <TennisBallMarker leftPct={serveGuide.ballLeftPct} topPct={serveGuide.ballTopPct} />
          </div>
        </>
      ) : null}
      <div className="pointer-events-none absolute inset-0 z-[3]" aria-hidden>
        {projectedSlots.map(({ p, px, py, team, idx, avatarScale }) => {
          if (!p) return null;
          const serving = courtPlayerIsServing({
            endsSetup,
            showServeOverlay,
            serverTeam,
            team,
            serverPlayerIndex,
            playerIndex: idx,
          });
          return (
            <motion.div
              key={`${p.id}-${idx}`}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center overflow-visible"
              initial={false}
              animate={{ left: `${pctX(px)}%`, top: `${pctY(py)}%` }}
              transition={serveSpringTransition}
              onAnimationComplete={onPlayerMoveComplete}
            >
              <ServeCourtPlayerAvatar
                player={p}
                scale={avatarScale}
                servingHighlightClassName={serving ? SERVE_COURT_HIGHLIGHT : undefined}
              />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
