import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ServeCourtPlayerAvatar } from '../ServeCourtPlayerAvatar';
import { SERVE_COURT_HIGHLIGHT_PICKLEBALL } from '../serveCourtHighlight';
import type { BasicUser } from '@/types';
import type { LiveTeamSide } from '@/utils/liveScoring';
import type { CourtServeSide } from '@/utils/liveScoring/serveGuide';
import { serveSpringSettleMs, serveSpringTransition } from '../serveArrowMotion';
import type { RallyCourtProps } from './RallyCourtProps';
import { PickleballBallMarker } from './PickleballBallMarker';
import { PickleballCourtDiagram } from './PickleballCourtDiagram';
import { ServeArcTrace } from './ServeArcTrace';
import { LIVE_COURT_FIT_CLASS } from '../LiveCourtViewport';
import { serveGuideFrameForUiId } from '../serveGuideCourtFrame';
import {
  pbPlayerXForSlot,
  pbPlayerYForEnd,
  pbServeArcReceiverPlayerIndex,
  pbServerEnd,
  pbSinglesQuadrantSide,
} from './pickleballCourtGeometry';
import {
  PB_SCENE_MIN_X,
  PB_SCENE_MIN_Y,
  PB_SCENE_VB_H,
  PB_SCENE_VB_W,
  PB_SCENE_VIEW_BOX,
  pbAvatarScaleFromFlatY,
  pbProjectFlat,
  pbSceneServeGuideArtifacts,
  pbSceneServiceBox,
} from './pickleballCourtLayout';
import { serveArcReceiverTeam, serveArcTraceEndpoints } from './serveArcPlayerEndpoints';

type PickleballCourtProps = RallyCourtProps & {
  serverTeam?: LiveTeamSide;
  serverPlayerIndex?: number;
  courtSide?: CourtServeSide;
  courtTeamASidesMirrored?: boolean;
  courtTeamBSidesMirrored?: boolean;
  endsSetup?: boolean;
  motionToken?: string;
  'aria-label'?: string;
};

function pctX(x: number) {
  return ((x - PB_SCENE_MIN_X) / PB_SCENE_VB_W) * 100;
}

function pctY(y: number) {
  return ((y - PB_SCENE_MIN_Y) / PB_SCENE_VB_H) * 100;
}

export function PickleballCourt({
  teamAPlayers,
  teamBPlayers,
  courtEndsSwapped = false,
  courtTeamASidesMirrored = false,
  courtTeamBSidesMirrored = false,
  serverTeam,
  serverPlayerIndex = 0,
  courtSide,
  matchDoubles = false,
  endsSetup = false,
  motionToken,
  className,
  frameStyle,
  'aria-label': ariaLabel,
}: PickleballCourtProps) {
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
  const serverEnd = serverTeam ? pbServerEnd(serverTeam, courtEndsSwapped) : 'bottom';

  const slotX = (end: 'top' | 'bottom', idx: number, team: LiveTeamSide, doubles: boolean) =>
    pbPlayerXForSlot(end, idx, doubles, serveRight, layoutServeBoxes, serverPlayerIndex, serverEnd, {
      team,
      serverTeam,
      teamMirrored: team === 'teamA' ? courtTeamASidesMirrored : courtTeamBSidesMirrored,
      endsSetup,
    });

  const slots: { x: number; y: number; p?: BasicUser; team: LiveTeamSide; idx: number }[] = matchDoubles
    ? [
        {
          x: slotX('top', 0, topTeam, true),
          y: pbPlayerYForEnd('top', layoutServeBoxes),
          p: topTeam === 'teamA' ? a0 : b0,
          team: topTeam,
          idx: 0,
        },
        {
          x: slotX('top', 1, topTeam, true),
          y: pbPlayerYForEnd('top', layoutServeBoxes),
          p: topTeam === 'teamA' ? a1 : b1,
          team: topTeam,
          idx: 1,
        },
        {
          x: slotX('bottom', 0, bottomTeam, true),
          y: pbPlayerYForEnd('bottom', layoutServeBoxes),
          p: bottomTeam === 'teamA' ? a0 : b0,
          team: bottomTeam,
          idx: 0,
        },
        {
          x: slotX('bottom', 1, bottomTeam, true),
          y: pbPlayerYForEnd('bottom', layoutServeBoxes),
          p: bottomTeam === 'teamA' ? a1 : b1,
          team: bottomTeam,
          idx: 1,
        },
      ]
    : [
        {
          x: slotX('top', 0, topTeam, false),
          y: pbPlayerYForEnd('top', layoutServeBoxes),
          p: topTeam === 'teamA' ? a0 : b0,
          team: topTeam,
          idx: 0,
        },
        {
          x: slotX('bottom', 0, bottomTeam, false),
          y: pbPlayerYForEnd('bottom', layoutServeBoxes),
          p: bottomTeam === 'teamA' ? a0 : b0,
          team: bottomTeam,
          idx: 0,
        },
      ];

  const serveGuide =
    showServeOverlay && serverTeam
      ? pbSceneServeGuideArtifacts({
          serverTeam,
          courtEndsSwapped,
          serveRight,
          matchDoubles,
          serverPlayerIndex,
        })
      : null;

  const animKey =
    motionToken ??
    `${serverTeam}-${courtSide}-${serverPlayerIndex}-${courtEndsSwapped}-${courtTeamASidesMirrored}-${courtTeamBSidesMirrored}`;
  const [playersReady, setPlayersReady] = useState(false);
  const readyCountRef = useRef(0);
  const settleGenRef = useRef(0);
  const playerTargetRef = useRef(0);

  const projectedSlots = slots
    .filter((s) => s.p)
    .map((s) => {
      const pos = pbProjectFlat(s.x, s.y);
      return { ...s, px: pos.x, py: pos.y, avatarScale: pbAvatarScaleFromFlatY(s.y) };
    });
  playerTargetRef.current = projectedSlots.length;

  const receiverTeam = serveArcReceiverTeam(serverEnd, topTeam, bottomTeam);
  const serveArc =
    serveGuide && serverTeam
      ? serveArcTraceEndpoints(
          serveGuide.ball,
          projectedSlots,
          receiverTeam,
          pbServeArcReceiverPlayerIndex({ matchDoubles })
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

  const activeServiceBox =
    showServeOverlay && serverTeam
      ? pbSceneServiceBox(serverEnd, pbSinglesQuadrantSide(serverEnd, serveRight))
      : undefined;

  const fitted = className === LIVE_COURT_FIT_CLASS;
  const defaultFrame = serveGuideFrameForUiId('pickleball-board', endsSetup ? 'setup' : 'coach');
  const rootClass = fitted
    ? `relative mx-auto overflow-visible ${LIVE_COURT_FIT_CLASS}`
    : `relative mx-auto overflow-visible ${className ?? defaultFrame.className}`;
  const rootStyle = fitted ? undefined : (frameStyle ?? defaultFrame.style);

  return (
    <div className={rootClass} style={rootStyle}>
      <PickleballCourtDiagram uid={uid} activeServiceBox={activeServiceBox} />
      {serveArc && serveGuide ? (
        <>
          <div className="pointer-events-none absolute inset-0 z-[4]" aria-hidden>
            <ServeArcTrace
              motionKey={animKey}
              viewBox={PB_SCENE_VIEW_BOX}
              from={serveArc.from}
              to={serveArc.to}
              flatControl={serveGuide.flatControl}
              ready={playersReady}
            />
          </div>
          <div className="pointer-events-none absolute inset-0 z-[5]" aria-hidden>
            <PickleballBallMarker leftPct={serveGuide.ballLeftPct} topPct={serveGuide.ballTopPct} />
          </div>
        </>
      ) : null}
      <div className="pointer-events-none absolute inset-0 z-[3]" aria-hidden>
        {projectedSlots.map(({ p, px, py, team, idx, avatarScale }) => {
          if (!p) return null;
          const serving = showServeOverlay && serverTeam === team && serverPlayerIndex === idx;
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
                servingHighlightClassName={serving ? SERVE_COURT_HIGHLIGHT_PICKLEBALL : undefined}
              />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
