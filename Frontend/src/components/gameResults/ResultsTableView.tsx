import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { Round } from '@/types/gameResults';
import { BasicUser } from '@/types';
import { useIsLandscape } from '@/hooks/useIsLandscape';
import { ConfirmationModal } from '@/components';

interface PlayerRoundData {
  score: number | null;
  won: boolean;
  lost: boolean;
  roundId: string;
  matchId: string | null;
  courtId: string | undefined;
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
  onDeleteRound?: (roundId: string) => void;
}

export const ResultsTableView = ({ rounds, players, isEditing, onAddRound, onCellClick, onDeleteRound }: ResultsTableViewProps) => {
  const { t } = useTranslation();
  const isLandscape = useIsLandscape();
  const [roundIdToDelete, setRoundIdToDelete] = useState<string | null>(null);

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
            if (!set) return { score: null, won: false, lost: false, roundId: round.id, matchId: match.id, courtId: match.courtId };

            const myScore = inA ? set.teamA : set.teamB;
            const oppScore = inA ? set.teamB : set.teamA;
            total += myScore;
            const won = myScore > oppScore;
            const lost = myScore < oppScore;
            if (won) wins++;
            return { score: myScore, won, lost, roundId: round.id, matchId: match.id, courtId: match.courtId };
          }
          return { score: null, won: false, lost: false, roundId: round.id, matchId: null, courtId: undefined };
        });

        return { player, roundScores, total, wins };
      })
      .sort((a, b) => b.total - a.total || b.wins - a.wins);
  }, [rounds, players]);

  const courtColors = useMemo(() => {
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const r of rounds) {
      for (const m of r.matches) {
        const c = m.courtId ?? '';
        if (c && !seen.has(c)) {
          seen.add(c);
          ids.push(c);
        }
      }
    }
    return ids;
  }, [rounds]);

  const COURT_PASTELS = [
    'bg-rose-100 dark:bg-rose-900/30',
    'bg-sky-100 dark:bg-sky-900/30',
    'bg-amber-100 dark:bg-amber-900/30',
    'bg-emerald-100 dark:bg-emerald-900/30',
    'bg-violet-100 dark:bg-violet-900/30',
    'bg-teal-100 dark:bg-teal-900/30',
    'bg-pink-100 dark:bg-pink-900/30',
    'bg-lime-100 dark:bg-lime-900/30',
  ];

  const getCourtStyle = (courtId: string | undefined) => {
    if (!courtId) return '';
    const i = courtColors.indexOf(courtId);
    if (i < 0) return '';
    return COURT_PASTELS[i % COURT_PASTELS.length] ?? '';
  };

  const getCellStyle = (data: PlayerRoundData) => {
    const bg = getCourtStyle(data.courtId) || '';
    const border = data.won
      ? 'border-2 border-green-500 dark:border-green-500'
      : data.lost
        ? 'border-2 border-red-500 dark:border-red-500'
        : 'border border-gray-200 dark:border-gray-600';
    const text = data.score === null
      ? 'text-gray-400 dark:text-gray-600'
      : data.won
        ? 'text-green-800 dark:text-green-200'
        : data.lost
          ? 'text-red-700 dark:text-red-300'
          : 'text-gray-700 dark:text-gray-300';
    return `${bg} ${border} ${text}`;
  };

  const truncateName = (p: BasicUser) => {
    const first = p.firstName || '';
    const last = p.lastName || '';
    const full = `${first} ${last}`.trim();
    return full.length > 10 ? full.slice(0, 10) + '…' : full;
  };

  return (
    <div className="flex flex-col h-full">
      {isEditing && !isLandscape && (
        <div className="flex justify-center py-2 px-4 flex-shrink-0">
          <button
            onClick={onAddRound}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium transition-colors"
          >
            <Plus size={16} />
            {t('gameResults.addRound')}
          </button>
        </div>
      )}

      <div className="flex-1 overflow-auto px-0 pb-4">
        <table className="text-sm border-collapse min-w-full w-max">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800">
              <th className="sticky top-0 left-0 z-20 bg-gray-50 dark:bg-gray-800 px-1 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 w-6">#</th>
              <th className="sticky top-0 left-4 z-20 bg-gray-50 dark:bg-gray-800 px-1 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 min-w-[90px]">
                {t('common.name', { defaultValue: 'Name' })}
              </th>
              {rounds.map((_, i) => (
                <th key={i} className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 px-1 py-2 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 min-w-[40px]">
                  {i + 1}
                </th>
              ))}
              <th className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 px-1 py-2 text-center text-xs font-bold text-gray-700 dark:text-gray-200 min-w-[48px]">
                {t('gameResults.total', { defaultValue: 'Total' })}
              </th>
              <th className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 px-1 py-2 text-center text-xs font-bold text-gray-700 dark:text-gray-200 min-w-[40px]">
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
                <td className={`sticky left-0 z-10 px-1 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 ${rowBg}`}>
                  {idx + 1}
                </td>
                <td className={`sticky left-4 z-10 px-1 py-2 text-sm font-medium text-gray-900 dark:text-white truncate max-w-[120px] ${rowBg}`}>
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
                <td className="px-1 py-2 text-center">
                  <span className="inline-flex items-center justify-center min-w-[36px] h-7 rounded bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200 text-sm font-bold">
                    {row.total}
                  </span>
                </td>
                <td className="px-1 py-2 text-center">
                  <span className="inline-flex items-center justify-center min-w-[28px] h-7 rounded bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-sm font-semibold">
                    {row.wins}
                  </span>
                </td>
              </tr>
              );
            })}
            {isEditing && onDeleteRound && rounds.length > 1 && (
              <tr className="bg-gray-100 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
                <td className="sticky left-0 z-10 w-6 bg-gray-100 dark:bg-gray-800" />
                <td className="sticky left-4 z-10 min-w-[90px] bg-gray-100 dark:bg-gray-800" />
                {rounds.map((round) => (
                  <td key={round.id} className="px-1 py-1.5 text-center bg-gray-100 dark:bg-gray-800">
                    <button
                      type="button"
                      onClick={() => setRoundIdToDelete(round.id)}
                      className="inline-flex items-center justify-center w-9 h-7 rounded text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-900/30 border border-transparent hover:border-red-300 dark:hover:border-red-700 transition-colors"
                      title={t('gameResults.deleteRound')}
                      aria-label={t('gameResults.deleteRound')}
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                ))}
                <td className="px-1 py-2 bg-gray-100 dark:bg-gray-800" />
                <td className="px-1 py-2 bg-gray-100 dark:bg-gray-800" />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {courtColors.length > 0 && (
        <div className="flex flex-wrap justify-center gap-3 px-4 py-2 flex-shrink-0 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          {courtColors.map((courtId, i) => (
            <div key={courtId} className="flex items-center gap-1.5">
              <span
                className={`inline-block w-5 h-4 rounded ${COURT_PASTELS[i % COURT_PASTELS.length] ?? ''} border border-gray-300 dark:border-gray-600`}
                aria-hidden
              />
              <span className="text-xs text-gray-600 dark:text-gray-400">
                {t('gameResults.courtNumber', { defaultValue: 'Court {{number}}', number: i + 1 })}
              </span>
            </div>
          ))}
        </div>
      )}

      {roundIdToDelete && (
        <ConfirmationModal
          isOpen={!!roundIdToDelete}
          title={t('gameResults.deleteRound')}
          message={t('gameResults.deleteRoundConfirmation')}
          confirmText={t('common.delete')}
          cancelText={t('common.cancel')}
          confirmVariant="danger"
          onConfirm={() => {
            if (roundIdToDelete) {
              onDeleteRound?.(roundIdToDelete);
              setRoundIdToDelete(null);
            }
          }}
          onClose={() => setRoundIdToDelete(null)}
        />
      )}
    </div>
  );
};
