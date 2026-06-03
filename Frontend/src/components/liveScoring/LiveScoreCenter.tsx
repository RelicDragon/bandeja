import { useMemo, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import type { BasicUser, Sport } from '@/types';
import type {
  LiveMatchCourtOrientation,
  LivePointsServeRotation,
  LiveScoringState,
  LiveTeamSide,
  ServeGuideSnapshot,
} from '@/utils/liveScoring';
import { activeSetScore } from '@/utils/liveScoring';
import type { ScoringRules } from '@/utils/scoring';
import { LiveServeCoachStrip } from './LiveServeCoachStrip';
import type { ServeCourtProps } from './ServeCourtProps';
import type { RallyCourtProps } from './rally/RallyCourtProps';
import { PickleballCoachButtons } from './rally/PickleballCoachButtons';
import { PickleballStrictFaultButtons } from './rally/PickleballStrictFaultButtons';
import { RallyOfficiatingButtons } from './rally/RallyOfficiatingButtons';
import { RallyScoreBoard } from './rally/RallyScoreBoard';
import type { OfficiatingLevel } from '@shared/officiatingLevel';
import { officiatingIsStrict } from '@shared/officiatingLevel';
import { rallyScoreMetaForState } from '@/liveScoring/rallyScoreMeta';
import { LiveCourtViewport } from './LiveCourtViewport';

type LiveScoreCenterProps = {
  state: LiveScoringState;
  teamAPlayers: BasicUser[];
  teamBPlayers: BasicUser[];
  CourtSchemaComponent?: ComponentType<ServeCourtProps> | null;
  matchDoubles?: boolean;
  serveGuideSnapshot?: ServeGuideSnapshot | null;
  rules: ScoringRules;
  saving?: boolean;
  error?: string | null;
  /** Shown below serve strip; distinct from `error` (e.g. match complete). */
  statusNote?: string | null;
  isOnline?: boolean;
  /** When true, the serve setup / coach strip is hidden (e.g. match decided). */
  hideServeGuide?: boolean;
  RallyCourtComponent?: ComponentType<RallyCourtProps> | null;
  courtAspect?: readonly [number, number] | null;
  onServeSetupComplete: (
    side: LiveTeamSide,
    doublesPlayerIndex: number,
    rotation: LivePointsServeRotation,
    courtOrientation: LiveMatchCourtOrientation
  ) => void;
  onSkipServeGuide: () => void;
  sport?: Sport | string | null;
  officiatingLevel?: OfficiatingLevel;
  officiatingHintsEnabled?: boolean;
  letPending?: boolean;
  onKitchenFault?: (faultingTeam: LiveTeamSide) => void;
  onLet?: () => void;
  onLetReplay?: () => void;
  onServiceFault?: () => void;
};

export const LiveScoreCenter = ({
  state,
  teamAPlayers,
  teamBPlayers,
  CourtSchemaComponent,
  matchDoubles = false,
  serveGuideSnapshot,
  rules,
  error,
  statusNote,
  isOnline = true,
  hideServeGuide,
  RallyCourtComponent,
  courtAspect = null,
  sport,
  officiatingLevel = 'none',
  officiatingHintsEnabled = false,
  letPending,
  onKitchenFault,
  onLet,
  onLetReplay,
  onServiceFault,
}: LiveScoreCenterProps) => {
  const { t } = useTranslation();
  const snapshot = serveGuideSnapshot ?? null;
  const setScore = activeSetScore(state);
  const rallyMeta = useMemo(() => rallyScoreMetaForState(state, rules), [state, rules]);

  const changeEndsLabel = t('gameDetails.liveScoring.changeEnds');
  const showServeCoachStrip = !hideServeGuide && snapshot && !RallyCourtComponent && CourtSchemaComponent;

  const courtViewport = courtAspect ? (
    <LiveCourtViewport
      aspect={courtAspect}
      className="min-h-[11rem] flex-1"
      changeEndsBeforeNextPoint={snapshot?.changeEndsBeforeNextPoint}
      changeEndsLabel={changeEndsLabel}
    >
      <RallyScoreBoard
        CourtComponent={RallyCourtComponent!}
        teamAPlayers={teamAPlayers}
        teamBPlayers={teamBPlayers}
        teamAScore={setScore.teamA}
        teamBScore={setScore.teamB}
        matchDoubles={matchDoubles}
        serverTeam={snapshot?.serverTeam}
        serverPlayerIndex={snapshot?.serverPlayerIndex}
        courtSide={snapshot?.courtSide}
        courtEndsSwapped={snapshot?.courtEndsSwapped}
        courtTeamASidesMirrored={snapshot?.courtTeamASidesMirrored}
        courtTeamBSidesMirrored={snapshot?.courtTeamBSidesMirrored}
        motionToken={snapshot?.motionToken}
        setChips={rallyMeta.setChips}
        setsWon={rallyMeta.setsWon}
        gameCap={rallyMeta.gameCap}
        gameLabel={rallyMeta.gameLabel}
        courtOnly
      />
    </LiveCourtViewport>
  ) : null;

  return (
    <section className="flex min-h-0 w-full max-w-full flex-1 flex-col overflow-hidden self-stretch">
      {!isOnline ? (
        <div className="flex w-full min-w-0 text-xs">
          <div className="min-w-0">
            <span className="inline-flex max-w-[min(100%,14rem)] rounded-full border border-amber-400/40 bg-amber-500/12 px-2 py-0.5 font-semibold text-amber-950 dark:border-amber-500/35 dark:bg-amber-500/15 dark:text-amber-50">
              {t('gameDetails.liveScoring.syncedWhenOnline')}
            </span>
          </div>
        </div>
      ) : null}

      {showServeCoachStrip ? (
        <div className="mt-2 space-y-3">
          <LiveServeCoachStrip
            snapshot={snapshot}
            teamAPlayers={teamAPlayers}
            teamBPlayers={teamBPlayers}
            CourtSchemaComponent={CourtSchemaComponent}
            matchDoubles={matchDoubles}
          />
        </div>
      ) : null}

      {RallyCourtComponent && courtAspect ? (
        <div className="mt-1 flex min-h-0 w-full min-w-0 flex-1 flex-col gap-2 overflow-hidden">
          {courtViewport}
          <div className="flex shrink-0 flex-col items-center gap-2">
            {sport === 'PICKLEBALL' && officiatingHintsEnabled ? <PickleballCoachButtons /> : null}
            {sport === 'PICKLEBALL' && officiatingIsStrict(officiatingLevel) && onKitchenFault ? (
              <PickleballStrictFaultButtons onKitchenFault={onKitchenFault} />
            ) : null}
            {sport === 'BADMINTON' && (officiatingHintsEnabled || officiatingIsStrict(officiatingLevel)) ? (
              <RallyOfficiatingButtons
                level={officiatingLevel}
                letPending={letPending}
                onLet={onLet}
                onLetReplay={onLetReplay}
                onServiceFault={onServiceFault}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      {statusNote ? (
        <p className="mt-4 text-center text-xs font-medium text-emerald-800 dark:text-emerald-200/90">{statusNote}</p>
      ) : null}
      {error ? <p className="mt-4 text-xs text-red-500">{error}</p> : null}
    </section>
  );
};
