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
import {
  activeSetScore,
  liveSetLabelForRow,
} from '@/utils/liveScoring';
import type { ScoringRules } from '@/utils/scoring';
import { LiveServeCoachStrip } from './LiveServeCoachStrip';
import type { ServeCourtSchemaProps } from './ServeCourtSchema';
import type { RallyCourtProps } from './rally/RallyCourtProps';
import { PickleballCoachButtons } from './rally/PickleballCoachButtons';
import { RallyScoreBoard } from './rally/RallyScoreBoard';
import { rallyScoreMetaForState } from '@/liveScoring/rallyScoreMeta';

type LiveScoreCenterProps = {
  state: LiveScoringState;
  teamAPlayers: BasicUser[];
  teamBPlayers: BasicUser[];
  CourtSchemaComponent: ComponentType<ServeCourtSchemaProps>;
  matchDoubles?: boolean;
  serveGuideSnapshot?: ServeGuideSnapshot | null;
  pointCenter: string;
  rules: ScoringRules;
  saving?: boolean;
  error?: string | null;
  /** Shown below serve strip; distinct from `error` (e.g. match complete). */
  statusNote?: string | null;
  isOnline?: boolean;
  /** When true, the serve setup / coach strip is hidden (e.g. match decided). */
  hideServeGuide?: boolean;
  RallyCourtComponent?: ComponentType<RallyCourtProps> | null;
  onServeSetupComplete: (
    side: LiveTeamSide,
    doublesPlayerIndex: number,
    rotation: LivePointsServeRotation,
    courtOrientation: LiveMatchCourtOrientation
  ) => void;
  onSkipServeGuide: () => void;
  showPointHeadline?: boolean;
  sport?: Sport | string | null;
};

export const LiveScoreCenter = ({
  state,
  teamAPlayers,
  teamBPlayers,
  CourtSchemaComponent,
  matchDoubles = false,
  serveGuideSnapshot,
  pointCenter,
  rules,
  error,
  statusNote,
  isOnline = true,
  hideServeGuide,
  RallyCourtComponent,
  showPointHeadline = true,
  sport,
}: LiveScoreCenterProps) => {
  const { t } = useTranslation();
  const snapshot = serveGuideSnapshot ?? null;
  const setScore = activeSetScore(state);
  const rallyMeta = useMemo(() => rallyScoreMetaForState(state, rules), [state, rules]);

  const setHeader = useMemo(() => {
    const label = liveSetLabelForRow(activeSetScore(state), state.activeSetIndex, rules);
    if (label.kind === 'SUPER_TIE_BREAK') return t('gameDetails.liveScoring.superTieBreakShort');
    if (label.kind === 'TIE_BREAK') {
      return `${t('gameDetails.liveScoring.setN', { n: label.setOneBased })} · ${t('gameDetails.liveScoring.tieBreakShort')}`;
    }
    return t('gameDetails.liveScoring.setN', { n: label.setOneBased });
  }, [state, rules, t]);

  const showSetPointBlock = showPointHeadline;

  return (
    <section className="w-fit max-w-full min-w-0">
      {!isOnline ? (
        <div className="flex w-full min-w-0 text-xs">
          <div className="min-w-0">
            <span className="inline-flex max-w-[min(100%,14rem)] rounded-full border border-amber-400/40 bg-amber-500/12 px-2 py-0.5 font-semibold text-amber-950 dark:border-amber-500/35 dark:bg-amber-500/15 dark:text-amber-50">
              {t('gameDetails.liveScoring.syncedWhenOnline')}
            </span>
          </div>
        </div>
      ) : null}
      {showSetPointBlock ? (
        <div className="mt-5 text-center">
          {!hideServeGuide ? (
            <div className="text-sm uppercase tracking-wide opacity-60">{setHeader}</div>
          ) : null}
          {showPointHeadline ? (
            <div className={`text-3xl font-black ${!hideServeGuide ? 'mt-1' : ''}`}>
              {state.mode === 'classic' ? pointCenter || t('gameDetails.liveScoring.game') : t('gameDetails.liveScoring.points')}
            </div>
          ) : null}
        </div>
      ) : null}

      {!hideServeGuide && snapshot ? (
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

      {RallyCourtComponent ? (
        <div className="mt-4 flex w-full flex-col items-center gap-2">
          <RallyScoreBoard
            CourtComponent={RallyCourtComponent}
            teamAPlayers={teamAPlayers}
            teamBPlayers={teamBPlayers}
            teamAScore={setScore.teamA}
            teamBScore={setScore.teamB}
            setChips={rallyMeta.setChips}
            setsWon={rallyMeta.setsWon}
            gameCap={rallyMeta.gameCap}
            gameLabel={rallyMeta.gameLabel}
          />
          {sport === 'PICKLEBALL' ? <PickleballCoachButtons /> : null}
        </div>
      ) : null}

      {statusNote ? (
        <p className="mt-4 text-center text-xs font-medium text-emerald-800 dark:text-emerald-200/90">{statusNote}</p>
      ) : null}
      {error ? <p className="mt-4 text-xs text-red-500">{error}</p> : null}
    </section>
  );
};
