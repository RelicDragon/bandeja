import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { BasicUser } from '@/types';
import type { LiveScoringState, LiveTeamSide } from '@/utils/liveScoring';
import { computeServeGuideSnapshot, needsServeSetup } from '@/utils/liveScoring';
import type { ScoringRules } from '@/utils/scoring';
import { LiveServeCoachStrip } from './LiveServeCoachStrip';
import { LiveServeSetupCard } from './LiveServeSetupCard';

type LiveScoreCenterProps = {
  state: LiveScoringState;
  teamAPlayers: BasicUser[];
  teamBPlayers: BasicUser[];
  pointCenter: string;
  revision: number;
  rules: ScoringRules;
  saving?: boolean;
  error?: string | null;
  onConfirmGameWin: () => void;
  onCancelGameWin: () => void;
  onServeSetupComplete: (side: LiveTeamSide, doublesPlayerIndex: number) => void;
  onSkipServeGuide: () => void;
  onNextSet: () => void;
  canAdvanceSet: boolean;
};

const rosterNames = (players: BasicUser[]) =>
  players.map((p) => [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.id);

export const LiveScoreCenter = ({
  state,
  teamAPlayers,
  teamBPlayers,
  pointCenter,
  revision,
  rules,
  saving,
  error,
  onConfirmGameWin,
  onCancelGameWin,
  onServeSetupComplete,
  onSkipServeGuide,
  onNextSet,
  canAdvanceSet,
}: LiveScoreCenterProps) => {
  const { t } = useTranslation();
  const pendingSide = state.classic?.pendingGameWinConfirmSide;

  const sideLine = (players: BasicUser[]) =>
    players.length
      ? players.map((p) => [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.id).join(', ')
      : '';

  const pendingLabel = pendingSide ? sideLine(pendingSide === 'teamA' ? teamAPlayers : teamBPlayers) : '';

  const na = useMemo(() => rosterNames(teamAPlayers), [teamAPlayers]);
  const nb = useMemo(() => rosterNames(teamBPlayers), [teamBPlayers]);
  const setupNeeded = needsServeSetup(state, rules);
  const snapshot = useMemo(() => {
    if (setupNeeded) return null;
    return computeServeGuideSnapshot(state, rules, na, nb);
  }, [setupNeeded, state, rules, na, nb]);

  return (
    <section className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center justify-between gap-2 text-xs opacity-60">
        <span>{t('gameDetails.liveScoring.liveScoringOn')}</span>
        <span>
          {t('gameDetails.liveScoring.rev')} {revision}
        </span>
      </div>
      <div className="mt-5 text-center">
        <div className="text-sm uppercase tracking-wide opacity-60">
          {t('gameDetails.liveScoring.setN', { n: state.activeSetIndex + 1 })}
        </div>
        <div className="mt-1 text-3xl font-black">{state.mode === 'classic' ? pointCenter || t('gameDetails.liveScoring.game') : t('gameDetails.liveScoring.points')}</div>
        <div className="mt-2 text-xs opacity-60">{saving ? t('gameDetails.liveScoring.syncing') : t('gameDetails.liveScoring.syncedWhenOnline')}</div>
      </div>

      {pendingSide ? (
        <div className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          <div className="text-sm font-semibold">
            {pendingLabel ? t('gameDetails.liveScoring.confirmGameFor', { name: pendingLabel }) : t('gameDetails.liveScoring.confirmGameWin')}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" className="rounded-xl bg-amber-600 py-3 text-sm font-bold text-white" onClick={onConfirmGameWin}>
              {t('gameDetails.liveScoring.confirmCta')}
            </button>
            <button type="button" className="rounded-xl border border-amber-300 py-3 text-sm font-bold" onClick={onCancelGameWin}>
              {t('gameDetails.liveScoring.cancelCta')}
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-5 space-y-3">
        {setupNeeded ? (
          <LiveServeSetupCard
            teamAPlayers={teamAPlayers}
            teamBPlayers={teamBPlayers}
            saving={saving}
            onComplete={onServeSetupComplete}
            onSkipHints={onSkipServeGuide}
          />
        ) : snapshot ? (
          <LiveServeCoachStrip snapshot={snapshot} />
        ) : null}
      </div>

      <button
        type="button"
        className="mt-5 w-full rounded-2xl border border-gray-300 py-3 text-sm font-bold disabled:opacity-40 dark:border-gray-700"
        disabled={saving || !canAdvanceSet}
        onClick={onNextSet}
      >
        {t('gameDetails.liveScoring.nextSet')}
      </button>

      {error ? <p className="mt-4 text-xs text-red-500">{error}</p> : null}
    </section>
  );
};
