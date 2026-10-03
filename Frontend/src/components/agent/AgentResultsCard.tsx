import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Trophy } from 'lucide-react';
import type { AgentCardPlayer, AgentResultsCard as AgentResultsCardData, AgentResultsCardMatch } from '@shared/agentContract';
import { agentToolCardPath, playedSets, setWinners, type AgentCardTone } from '@/features/agent/agentToolCards';
import { AgentCardPill, AgentCardShell } from './AgentCardShell';

const STATUS_TONE: Record<AgentResultsCardData['resultsStatus'], AgentCardTone> = {
  FINAL: 'good',
  IN_PROGRESS: 'warn',
  NONE: 'info',
};

const MEDAL = [
  'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
  'bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-100',
  'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200',
];

function Names({ players, strong }: { players: AgentCardPlayer[]; strong: boolean }) {
  const { t } = useTranslation();
  if (players.length === 0) {
    return <span className="text-gray-400 dark:text-gray-500">{t('agent.cards.results.noPlayers')}</span>;
  }
  return (
    <>
      {players.map((p, i) => (
        <span key={`${p.name}-${i}`}>
          {i > 0 ? <span className="text-gray-400 dark:text-gray-500"> · </span> : null}
          <span
            className={
              p.you
                ? 'font-semibold text-primary-700 dark:text-primary-300'
                : strong
                  ? 'font-semibold text-gray-900 dark:text-white'
                  : 'text-gray-600 dark:text-gray-300'
            }
          >
            {p.you ? t('agent.cards.results.you', { name: p.name }) : p.name}
          </span>
        </span>
      ))}
    </>
  );
}

function SideRow({ match, side }: { match: AgentResultsCardMatch; side: 'teamA' | 'teamB' }) {
  const { t } = useTranslation();
  const won = match.winner === side;
  const lost = match.winner != null && match.winner !== side && match.winner !== 'tie';
  const sets = playedSets(match);
  const winners = setWinners({ ...match, sets });
  return (
    <div className={`flex min-w-0 items-center gap-2 py-1 ${lost ? 'opacity-70' : ''}`}>
      <span className="flex w-4 flex-shrink-0 justify-center">
        {won ? (
          <Trophy size={13} className="text-amber-500 dark:text-amber-400" aria-label={t('agent.cards.results.winner')} />
        ) : null}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px]" dir="auto">
        <Names players={match[side]} strong={won} />
      </span>
      <span className="flex flex-shrink-0 gap-1 tabular-nums" dir="ltr">
        {sets.length === 0 ? (
          <span className="w-5 text-center text-sm text-gray-400">–</span>
        ) : (
          sets.map((s, i) => (
            <span
              key={i}
              className={`w-5 text-center text-sm ${
                winners[i] === side ? 'font-bold text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'
              } ${s.tieBreak ? 'text-xs' : ''}`}
            >
              {s[side]}
            </span>
          ))
        )}
      </span>
    </div>
  );
}

function MatchBlock({ match, showRef }: { match: AgentResultsCardMatch; showRef: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-xl bg-gray-50 px-2.5 py-1 dark:bg-gray-900/40">
      {showRef ? (
        <div className="flex items-center justify-between pt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
          <span>{t('agent.cards.results.matchRef', { round: match.round, match: match.match })}</span>
          {match.winner === 'tie' ? <span>{t('agent.cards.results.draw')}</span> : null}
        </div>
      ) : null}
      <SideRow match={match} side="teamA" />
      <div className="ms-6 border-t border-gray-200/80 dark:border-gray-700/70" />
      <SideRow match={match} side="teamB" />
      {!showRef && match.winner === 'tie' ? (
        <div className="pb-1 text-[11px] text-gray-500 dark:text-gray-400">{t('agent.cards.results.draw')}</div>
      ) : null}
    </div>
  );
}

/** Scoreboard: teams, set scores (winning sets bold), the winner's trophy, a podium when final. */
export const AgentResultsCard = memo(function AgentResultsCard({
  card,
  linkable = true,
}: {
  card: AgentResultsCardData;
  linkable?: boolean;
}) {
  const { t } = useTranslation();
  const more = card.matchCount - card.matches.length;
  const showRef = card.matchCount > 1;
  return (
    <AgentCardShell
      icon={<Trophy size={20} aria-hidden />}
      iconClassName="bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
      title={card.title || t('agent.entity.untitledGame')}
      subtitle={card.matchCount > 1 ? t('agent.cards.results.matches', { count: card.matchCount }) : null}
      pill={<AgentCardPill tone={STATUS_TONE[card.resultsStatus]}>{t(`agent.cards.results.status.${card.resultsStatus}`)}</AgentCardPill>}
      path={linkable ? agentToolCardPath(card) : null}
    >
      <div className="flex flex-col gap-1.5">
        {card.standings?.length ? (
          <ol className="flex flex-col gap-1 pb-1">
            {card.standings.map((row, i) => (
              <li key={`${row.name}-${i}`} className="flex min-w-0 items-center gap-2 text-[13px]">
                <span
                  className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold tabular-nums ${MEDAL[i] ?? MEDAL[2]}`}
                >
                  {row.position ?? i + 1}
                </span>
                <span
                  className={`min-w-0 flex-1 truncate ${row.you ? 'font-semibold text-primary-700 dark:text-primary-300' : 'text-gray-900 dark:text-white'}`}
                  dir="auto"
                >
                  {row.you ? t('agent.cards.results.you', { name: row.name }) : row.name}
                </span>
                <span className="flex-shrink-0 text-xs tabular-nums text-gray-500 dark:text-gray-400" dir="ltr">
                  {row.ties > 0 ? `${row.wins}-${row.ties}-${row.losses}` : `${row.wins}-${row.losses}`}
                </span>
              </li>
            ))}
          </ol>
        ) : null}
        {card.matches.map((m) => (
          <MatchBlock key={`${m.round}-${m.match}`} match={m} showRef={showRef} />
        ))}
        {card.matches.length === 0 ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('agent.cards.results.noMatches')}</p>
        ) : null}
        {more > 0 ? (
          <p className="text-xs font-medium text-primary-600 dark:text-primary-400">{t('agent.cards.results.more', { count: more })}</p>
        ) : null}
      </div>
    </AgentCardShell>
  );
});
