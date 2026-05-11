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
  rules: ScoringRules;
  saving?: boolean;
  error?: string | null;
  isOnline?: boolean;
  onServeSetupComplete: (side: LiveTeamSide, doublesPlayerIndex: number) => void;
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
  saving,
  error,
  isOnline = true,
  onServeSetupComplete,
  onSkipServeGuide,
  showPointHeadline = true,
}: LiveScoreCenterProps) => {
  const { t } = useTranslation();
  const na = useMemo(() => rosterNames(teamAPlayers), [teamAPlayers]);
  const nb = useMemo(() => rosterNames(teamBPlayers), [teamBPlayers]);
  const setupNeeded = needsServeSetup(state, rules);
  const snapshot = useMemo(() => {
    if (setupNeeded) return null;
    return computeServeGuideSnapshot(state, rules, na, nb);
  }, [setupNeeded, state, rules, na, nb]);

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
      <div className="mt-5 text-center">
        <div className="text-sm uppercase tracking-wide opacity-60">
          {t('gameDetails.liveScoring.setN', { n: state.activeSetIndex + 1 })}
        </div>
        {showPointHeadline ? (
          <div className="mt-1 text-3xl font-black">
            {state.mode === 'classic' ? pointCenter || t('gameDetails.liveScoring.game') : t('gameDetails.liveScoring.points')}
          </div>
        ) : null}
      </div>

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
          <LiveServeCoachStrip snapshot={snapshot} teamAPlayers={teamAPlayers} teamBPlayers={teamBPlayers} />
        ) : null}
      </div>

      {error ? <p className="mt-4 text-xs text-red-500">{error}</p> : null}
    </section>
  );
};
