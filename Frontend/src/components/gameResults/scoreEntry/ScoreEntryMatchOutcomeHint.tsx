import { useTranslation } from 'react-i18next';
import { Handshake, Trophy } from 'lucide-react';
import type { BasicUser } from '@/types';
import { teamLabel } from './teamLabel';

interface ScoreEntryMatchOutcomeHintProps {
  outcome: 'A' | 'B' | 'tie';
  teamAPlayers: BasicUser[];
  teamBPlayers: BasicUser[];
  /** The side's user-team name, when the side is one. */
  teamAName?: string | null;
  teamBName?: string | null;
}

/** Says who takes the match with the score being entered, so no further set is expected. */
export const ScoreEntryMatchOutcomeHint = ({
  outcome,
  teamAPlayers,
  teamBPlayers,
  teamAName,
  teamBName,
}: ScoreEntryMatchOutcomeHintProps) => {
  const { t } = useTranslation();
  const Icon = outcome === 'tie' ? Handshake : Trophy;
  const winners = outcome === 'A' ? teamAPlayers : teamBPlayers;
  const winnerName = outcome === 'A' ? teamAName : teamBName;
  const text =
    outcome === 'tie'
      ? t('gameResults.scoreEntryMatchDrawn')
      : t('gameResults.scoreEntryMatchWon', {
          team: winnerName
            ? winnerName
            : winners.length > 0
              ? teamLabel(winners) : t(outcome === 'A' ? 'gameResults.teamA' : 'gameResults.teamB'),
        });

  return (
    <div className="flex justify-center px-4 pt-2">
      <p
        role="status"
        className="inline-flex max-w-full items-center gap-2 rounded-full bg-primary-500/[0.09] py-1 ps-1 pe-3 text-[12.5px] font-medium leading-tight text-primary-700 ring-1 ring-inset ring-primary-500/15 dark:bg-primary-400/10 dark:text-primary-300 dark:ring-primary-400/20"
      >
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-500/15 dark:bg-primary-400/15"
          aria-hidden
        >
          <Icon size={11} strokeWidth={2} />
        </span>
        <span className="truncate">{text}</span>
      </p>
    </div>
  );
};
