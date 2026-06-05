import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ServeCourtPlayerAvatar } from '../ServeCourtPlayerAvatar';
import { SERVE_COURT_HIGHLIGHT, courtPlayerIsServing } from '../serveCourtHighlight';
import { serveSpringSettleMs, serveSpringTransition } from '../serveArrowMotion';
import type { BasicUser } from '@/types';
import type { LiveTeamSide } from '@/utils/liveScoring';
import type { RallyCourtProps } from './RallyCourtProps';
import { TableTennisBallMarker } from './TableTennisBallMarker';
import { TableTennisCourtDiagram } from './TableTennisCourtDiagram';
import { ServeArcTrace } from './ServeArcTrace';
import { LIVE_COURT_FIT_CLASS } from '../LiveCourtViewport';
import { serveGuideFrameForUiId } from '../serveGuideCourtFrame';
import {
  ttPlayerXForSlot,
  ttPlayerYForEnd,
  ttServeArcReceiverPlayerIndex,
  ttServerEnd,
  ttSinglesQuadrantSide,
} from './tableTennisCourtGeometry';
import {
  TT_SCENE_MIN_X,
  TT_SCENE_MIN_Y,
  TT_SCENE_VB_H,
  TT_SCENE_VB_W,
  TT_SCENE_VIEW_BOX,
  ttAvatarScaleFromFlatY,
  ttProjectFlat,
  ttSceneServeGuideArtifacts,
  ttSceneServiceQuadrant,
} from './tableTennisCourtLayout';
import { serveArcReceiverTeam, serveArcTraceEndpoints } from './serveArcPlayerEndpoints';

type TableTennisCourtProps = RallyCourtProps & {
  serverTeam?: LiveTeamSide;
  serverPlayerIndex?: number;
  matchDoubles?: boolean;
  endsSetup?: boolean;
  motionToken?: string;
  'aria-label'?: string;
};

function pctX(x: number): number {
  return ((x - TT_SCENE_MIN_X) / TT_SCENE_VB_W) * 100;
}

function pctY(y: number): number {
  return ((y - TT_SCENE_MIN_Y) / TT_SCENE_VB_H) * 100;
}

export function TableTennisCourt({
  teamAPlayers,
  teamBPlayers,
  courtEndsSwapped = false,
  serverTeam,
  serverPlayerIndex = 0,
  courtSide,
  matchDoubles = false,
  endsSetup = false,
  motionToken,
  className,
  frameStyle,
  'aria-label': ariaLabel,
}: TableTennisCourtProps) {
  void ariaLabel;
  const uid = useId().replace(/:/g, '');
  const a0 = teamAPlayers[0];
  const a1 = teamAPlayers[1];
  const b0 = teamBPlayers[0];
  const b1 = teamBPlayers[1];

  const topTeam: LiveTeamSide = courtEndsSwapped ? 'teamA' : 'teamB';
  const bottomTeam: LiveTeamSide = courtEndsSwapped ? 'teamB' : 'teamA';
  const serveRight = courtSide === 'rightDeuce';
  const layoutServeBoxes = serverTeam != null && courtSide != null;
  const showServeOverlay = layoutServeBoxes && !endsSetup;
  const serverEnd = serverTeam ? ttServerEnd(serverTeam, courtEndsSwapped) : 'bottom';

  const singlesXForEnd = (end: 'top' | 'bottom') =>
    ttPlayerXForSlot(end, 0, matchDoubles, serveRight, layoutServeBoxes);

  const slots: { x: number; y: number; p?: BasicUser; team: LiveTeamSide; idx: number }[] = matchDoubles
    ? [
        {
          x: ttPlayerXForSlot('top', 0, true, serveRight, layoutServeBoxes),
          y: ttPlayerYForEnd('top'),
          p: topTeam === 'teamA' ? a0 : b0,
          team: topTeam,
          idx: 0,
        },
        {
          x: ttPlayerXForSlot('top', 1, true, serveRight, layoutServeBoxes),
          y: ttPlayerYForEnd('top'),
          p: topTeam === 'teamA' ? a1 : b1,
          team: topTeam,
          idx: 1,
        },
        {
          x: ttPlayerXForSlot('bottom', 0, true, serveRight, layoutServeBoxes),
          y: ttPlayerYForEnd('bottom'),
          p: bottomTeam === 'teamA' ? a0 : b0,
          team: bottomTeam,
          idx: 0,
        },
        {
          x: ttPlayerXForSlot('bottom', 1, true, serveRight, layoutServeBoxes),
          y: ttPlayerYForEnd('bottom'),
          p: bottomTeam === 'teamA' ? a1 : b1,
          team: bottomTeam,
          idx: 1,
        },
      ]
    : [
        {
          x: singlesXForEnd('top'),
          y: ttPlayerYForEnd('top'),
          p: topTeam === 'teamA' ? a0 : b0,
          team: topTeam,
          idx: 0,
        },
        {
          x: singlesXForEnd('bottom'),
          y: ttPlayerYForEnd('bottom'),
          p: bottomTeam === 'teamA' ? a0 : b0,
          team: bottomTeam,
          idx: 0,
        },
      ];

  const serveGuide =
    showServeOverlay && serverTeam
      ? ttSceneServeGuideArtifacts({
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
      const pos = ttProjectFlat(s.x, s.y);
      return { ...s, px: pos.x, py: pos.y, avatarScale: ttAvatarScaleFromFlatY(s.y) };
    });
  playerTargetRef.current = projectedSlots.length;

  const receiverTeam = serveArcReceiverTeam(serverEnd, topTeam, bottomTeam);
  const serveArc =
    serveGuide && serverTeam
      ? serveArcTraceEndpoints(
          serveGuide.ball,
          projectedSlots,
          receiverTeam,
          ttServeArcReceiverPlayerIndex({ matchDoubles, serverPlayerIndex })
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

  const activeServiceQuadrant =
    showServeOverlay && serverTeam
      ? ttSceneServiceQuadrant(serverEnd, ttSinglesQuadrantSide(serverEnd, serveRight))
      : undefined;

  const fitted = className === LIVE_COURT_FIT_CLASS;
  const defaultFrame = serveGuideFrameForUiId('table-tennis-board', endsSetup ? 'setup' : 'coach');
  const rootClass = fitted
    ? `relative mx-auto overflow-visible ${LIVE_COURT_FIT_CLASS}`
    : `relative mx-auto overflow-visible ${className ?? defaultFrame.className}`;
  const rootStyle = fitted ? undefined : (frameStyle ?? defaultFrame.style);

  return (
    <div className={rootClass} style={rootStyle}>
      <TableTennisCourtDiagram
        uid={uid}
        matchDoubles={matchDoubles}
        activeServiceQuadrant={activeServiceQuadrant}
      />
      {serveArc && serveGuide ? (
        <>
          <div className="pointer-events-none absolute inset-0 z-[4]" aria-hidden>
            <ServeArcTrace
              motionKey={animKey}
              viewBox={TT_SCENE_VIEW_BOX}
              from={serveArc.from}
              to={serveArc.to}
              flatControl={serveGuide.flatControl}
              minLift={8}
              ready={playersReady}
            />
          </div>
          <div className="pointer-events-none absolute inset-0 z-[5]" aria-hidden>
            <TableTennisBallMarker leftPct={serveGuide.ballLeftPct} topPct={serveGuide.ballTopPct} />
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
