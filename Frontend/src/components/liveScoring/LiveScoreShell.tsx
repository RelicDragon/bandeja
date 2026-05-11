import type { LiveScoringState, LiveTeamSide } from '@/utils/liveScoring';
import { activeSetScore, canAdvanceLiveSet, getClassicPointLabels } from '@/utils/liveScoring';
import type { ScoringRules } from '@/utils/scoring';
import { LiveScoreCenter } from './LiveScoreCenter';
import { LiveTeamPanel } from './LiveTeamPanel';

type LiveScoreShellProps = {
  state: LiveScoringState;
  teamALabel: string;
  teamBLabel: string;
  revision: number;
  rules: ScoringRules;
  isLandscape: boolean;
  tv?: boolean;
  saving?: boolean;
  error?: string | null;
  onScore: (side: LiveTeamSide) => void;
  onUndo: (side: LiveTeamSide) => void;
  onConfirmGameWin: () => void;
  onCancelGameWin: () => void;
  onSetFirstServer: (side: LiveTeamSide) => void;
  onNextSet: () => void;
};

export const LiveScoreShell = ({
  state,
  teamALabel,
  teamBLabel,
  revision,
  rules,
  isLandscape,
  tv,
  saving,
  error,
  onScore,
  onUndo,
  onConfirmGameWin,
  onCancelGameWin,
  onSetFirstServer,
  onNextSet,
}: LiveScoreShellProps) => {
  const set = activeSetScore(state);
  const points = getClassicPointLabels(state.classic);
  const canAdvanceSet = canAdvanceLiveSet(state, rules);

  if (tv) {
    return (
      <div className="grid min-h-0 flex-1 grid-rows-[1fr_auto_1fr] gap-4 p-4 md:grid-cols-[1fr_auto_1fr] md:grid-rows-1">
        <LiveTeamPanel side="teamA" label={teamALabel} games={set.teamA} point={state.mode === 'classic' ? points.teamA : undefined} tv />
        <div className="flex flex-col items-center justify-center px-4 text-center">
          <div className="text-sm uppercase tracking-[0.4em] text-white/50">Set {state.activeSetIndex + 1}</div>
          <div className="mt-4 text-[clamp(2rem,7vw,7rem)] font-black leading-none">{state.mode === 'classic' ? points.center || 'Live' : 'Live'}</div>
          <div className="mt-3 text-xs text-white/40">rev {revision}</div>
        </div>
        <LiveTeamPanel side="teamB" label={teamBLabel} games={set.teamB} point={state.mode === 'classic' ? points.teamB : undefined} tv />
      </div>
    );
  }

  return (
    <div
      className={
        isLandscape
          ? 'grid min-h-0 flex-1 grid-cols-[1fr_minmax(16rem,22rem)_1fr] gap-4 p-4'
          : 'flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]'
      }
    >
      <LiveTeamPanel
        side="teamA"
        label={teamALabel}
        games={set.teamA}
        point={state.mode === 'classic' ? points.teamA : undefined}
        disabled={saving}
        onScore={onScore}
        onUndo={onUndo}
      />
      <LiveScoreCenter
        state={state}
        pointCenter={points.center}
        revision={revision}
        saving={saving}
        error={error}
        onConfirmGameWin={onConfirmGameWin}
        onCancelGameWin={onCancelGameWin}
        onSetFirstServer={onSetFirstServer}
        onNextSet={onNextSet}
        canAdvanceSet={canAdvanceSet}
      />
      <LiveTeamPanel
        side="teamB"
        label={teamBLabel}
        games={set.teamB}
        point={state.mode === 'classic' ? points.teamB : undefined}
        disabled={saving}
        onScore={onScore}
        onUndo={onUndo}
      />
    </div>
  );
};
