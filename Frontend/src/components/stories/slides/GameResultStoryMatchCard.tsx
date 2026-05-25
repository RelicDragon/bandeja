import { useTranslation } from 'react-i18next';
import type { StoryResultMatch, StoryResultMatchPlayer } from '@/api/stories';
import { GameResultStoryPlayerChip } from './GameResultStoryPlayerChip';

type GameResultStoryMatchCardProps = {
  match: StoryResultMatch;
  highlightPlayerId: string;
};

const RESULT_STYLES: Record<'W' | 'L' | 'T', string> = {
  W: 'bg-emerald-400/25 text-emerald-100 ring-emerald-200/40',
  L: 'bg-rose-400/25 text-rose-100 ring-rose-200/40',
  T: 'bg-amber-400/25 text-amber-100 ring-amber-200/40',
};

function TeamLine({
  label,
  players,
  highlightPlayerId,
}: {
  label: string;
  players: StoryResultMatchPlayer[];
  highlightPlayerId: string;
}) {
  return (
    <div className="flex items-start gap-2 text-left">
      <span className="mt-1.5 w-4 shrink-0 text-[11px] font-bold tabular-nums text-white/55">{label}</span>
      <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
        {players.map((player) => (
          <GameResultStoryPlayerChip
            key={player.userId}
            player={player}
            highlighted={player.userId === highlightPlayerId}
          />
        ))}
      </div>
    </div>
  );
}

export function GameResultStoryMatchCard({ match, highlightPlayerId }: GameResultStoryMatchCardProps) {
  const { t } = useTranslation();
  const resultStyle = match.result ? RESULT_STYLES[match.result] : 'bg-white/10 text-white/70 ring-white/20';

  return (
    <article className="rounded-2xl border border-white/25 bg-white/10 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-md">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">
          {t('stories.roundMatch', { round: match.roundNumber, match: match.matchNumber })}
        </p>
        {match.result ? (
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${resultStyle}`}>
            {match.result}
          </span>
        ) : null}
      </div>

      <div className="space-y-2">
        <TeamLine label="A" players={match.teamA} highlightPlayerId={highlightPlayerId} />
        <TeamLine label="B" players={match.teamB} highlightPlayerId={highlightPlayerId} />
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {match.sets.map((set, index) => (
          <span
            key={`${match.matchId}-set-${index}`}
            className="rounded-lg bg-white/12 px-2 py-1 text-xs font-semibold tabular-nums text-white ring-1 ring-white/15"
          >
            {set.myScore}-{set.oppScore}
            {set.isTieBreak ? ' TB' : ''}
          </span>
        ))}
      </div>
    </article>
  );
}
