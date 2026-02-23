import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Round } from '@/types/gameResults';
import { BasicUser } from '@/types';

interface PlayerRoundData {
  score: number | null;
  won: boolean;
  lost: boolean;
  roundId: string;
  matchId: string | null;
}

interface PlayerRow {
  player: BasicUser;
  roundScores: PlayerRoundData[];
  total: number;
  wins: number;
}

interface ResultsTableViewProps {
  rounds: Round[];
  players: BasicUser[];
  isEditing: boolean;
  onAddRound: () => void;
  onCellClick: (roundId: string, matchId: string) => void;
}

export const ResultsTableView = ({ rounds, players, isEditing, onAddRound, onCellClick }: ResultsTableViewProps) => {
  const { t } = useTranslation();

  const rows = useMemo<PlayerRow[]>(() => {
    return players
      .map((player) => {
        let total = 0;
        let wins = 0;

        const roundScores = rounds.map((round) => {
          for (const match of round.matches) {
            const inA = match.teamA.includes(player.id);
            const inB = match.teamB.includes(player.id);
            if (!inA && !inB) continue;

            const set = match.sets[0];
            if (!set) return { score: null, won: false, lost: false, roundId: round.id, matchId: match.id };

            const myScore = inA ? set.teamA : set.teamB;
            const oppScore = inA ? set.teamB : set.teamA;
            total += myScore;
            const won = myScore > oppScore;
            const lost = myScore < oppScore;
            if (won) wins++;
            return { score: myScore, won, lost, roundId: round.id, matchId: match.id };
          }
          return { score: null, won: false, lost: false, roundId: round.id, matchId: null };
        });

        return { player, roundScores, total, wins };
      })
      .sort((a, b) => b.total - a.total || b.wins - a.wins);
  }, [rounds, players]);

  const getCellStyle = (data: PlayerRoundData) => {
    if (data.score === null) return 'text-gray-400 dark:text-gray-600';
    if (data.won) return 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200 border border-green-300 dark:border-green-700';
    if (data.lost) return 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-700';
    return 'text-gray-700 dark:text-gray-300';
  };

  const truncateName = (p: BasicUser) => {
    const first = p.firstName || '';
    const last = p.lastName || '';
    const full = `${first} ${last}`.trim();
    return full.length > 10 ? full.slice(0, 10) + '…' : full;
  };

  return (
    <div className="flex flex-col h-full">
      {isEditing && (
        <div className="flex justify-center py-2 px-4 flex-shrink-0">
          <button
            onClick={onAddRound}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition-colors"
          >
            <Plus size={16} />
            {t('gameResults.addRound')}
          </button>
        </div>
      )}

      <div className="flex-1 overflow-auto px-2 pb-4">
        <table className="text-sm border-collapse min-w-full w-max">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800">
              <th className="sticky top-0 left-0 z-20 bg-gray-50 dark:bg-gray-800 px-2 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 w-8">#</th>
              <th className="sticky top-0 left-8 z-20 bg-gray-50 dark:bg-gray-800 px-2 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 min-w-[90px]">
                {t('common.name', { defaultValue: 'Name' })}
              </th>
              {rounds.map((_, i) => (
                <th key={i} className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 px-2 py-2 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 min-w-[40px]">
                  {i + 1}
                </th>
              ))}
              <th className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 px-2 py-2 text-center text-xs font-bold text-gray-700 dark:text-gray-200 min-w-[48px]">
                {t('gameResults.total', { defaultValue: 'Total' })}
              </th>
              <th className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 px-2 py-2 text-center text-xs font-bold text-gray-700 dark:text-gray-200 min-w-[40px]">
                {t('gameResults.win', { defaultValue: 'Win' })}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const rowBg = idx % 2 === 0
                ? 'bg-white dark:bg-gray-900'
                : 'bg-gray-50 dark:bg-gray-800';
              return (
              <tr key={row.player.id} className={rowBg}>
                <td className={`sticky left-0 z-10 px-2 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 ${rowBg}`}>
                  {idx + 1}
                </td>
                <td className={`sticky left-8 z-10 px-2 py-2 text-sm font-medium text-gray-900 dark:text-white truncate max-w-[120px] ${rowBg}`}>
                  {truncateName(row.player)}
                </td>
                {row.roundScores.map((data, ri) => (
                  <td
                    key={ri}
                    className={`px-1 py-1.5 text-center ${isEditing && data.matchId ? 'cursor-pointer active:opacity-70' : ''}`}
                    onClick={isEditing && data.matchId ? () => onCellClick(data.roundId, data.matchId!) : undefined}
                  >
                    <span className={`inline-flex items-center justify-center w-9 h-7 rounded text-sm font-semibold ${getCellStyle(data)}`}>
                      {data.score !== null ? data.score : '—'}
                    </span>
                  </td>
                ))}
                <td className="px-2 py-2 text-center">
                  <span className="inline-flex items-center justify-center min-w-[36px] h-7 rounded bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200 text-sm font-bold">
                    {row.total}
                  </span>
                </td>
                <td className="px-2 py-2 text-center">
                  <span className="inline-flex items-center justify-center min-w-[28px] h-7 rounded bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-sm font-semibold">
                    {row.wins}
                  </span>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
