import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { BasicUser } from '@/types';
import type { LiveMatchCourtOrientation, LivePointsServeRotation, LiveScoringState, LiveTeamSide } from '@/utils/liveScoring';
import {
  activeSetScore,
  computeServeGuideSnapshot,
  liveSetLabelForRow,
} from '@/utils/liveScoring';
import type { ScoringRules } from '@/utils/scoring';
import { LiveServeCoachStrip } from './LiveServeCoachStrip';

type LiveScoreCenterProps = {
  state: LiveScoringState;
  teamAPlayers: BasicUser[];
  teamBPlayers: BasicUser[];
  pointCenter: string;
  rules: ScoringRules;
  saving?: boolean;
  error?: string | null;
  /** Shown below serve strip; distinct from `error` (e.g. match complete). */
  statusNote?: string | null;
  isOnline?: boolean;
  /** When true, the serve setup / coach strip is hidden (e.g. match decided). */
  hideServeGuide?: boolean;
  onServeSetupComplete: (
    side: LiveTeamSide,
    doublesPlayerIndex: number,
    rotation: LivePointsServeRotation,
    courtOrientation: LiveMatchCourtOrientation
  ) => void;
  onSkipServeGuide: () => void;
  showPointHeadline?: boolean;
};

const rosterNames = (players: BasicUser[]) =>
  players.map((p) => [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.id);

export const LiveScoreCenter = ({
  state,
  teamAPlayers,
  teamBPlayers,
  pointCenter,
  rules,
  error,
  statusNote,
  isOnline = true,
  hideServeGuide,
  showPointHeadline = true,
}: LiveScoreCenterProps) => {
  const { t } = useTranslation();
  const na = useMemo(() => rosterNames(teamAPlayers), [teamAPlayers]);
  const nb = useMemo(() => rosterNames(teamBPlayers), [teamBPlayers]);
  const snapshot = useMemo(() => {
    return computeServeGuideSnapshot(state, rules, na, nb);
  }, [state, rules, na, nb]);
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
          <LiveServeCoachStrip snapshot={snapshot} teamAPlayers={teamAPlayers} teamBPlayers={teamBPlayers} />
        </div>
      ) : null}

      {statusNote ? (
        <p className="mt-4 text-center text-xs font-medium text-emerald-800 dark:text-emerald-200/90">{statusNote}</p>
      ) : null}
      {error ? <p className="mt-4 text-xs text-red-500">{error}</p> : null}
    </section>
  );
};
