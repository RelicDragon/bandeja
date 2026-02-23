import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Plus, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Round } from '@/types/gameResults';
import { BasicUser, Game } from '@/types';
import { useIsLandscape } from '@/hooks/useIsLandscape';
import { useColumnResize } from '@/hooks/useColumnResize';
import { ConfirmationModal } from '@/components';
import { calculateGameStandings } from '@/services/gameStandings';

interface PlayerRoundData {
  score: number | null;
  won: boolean;
  lost: boolean;
  roundId: string;
  matchId: string | null;
  courtId: string | undefined;
  teamIndex?: 1 | 2;
}

interface PlayerRow {
  player: BasicUser;
  roundScores: PlayerRoundData[];
  total: number;
  delta: number;
  wins: number;
  ties: number;
  games: number;
}

function buildRoundScoresForPlayer(rounds: Round[], playerId: string): PlayerRoundData[] {
  return rounds.map((round) => {
    for (const match of round.matches) {
      const inA = match.teamA.includes(playerId);
      const inB = match.teamB.includes(playerId);
      if (!inA && !inB) continue;

      const set = match.sets[0];
      if (!set) return { score: null, won: false, lost: false, roundId: round.id, matchId: match.id, courtId: match.courtId, teamIndex: inA ? 1 : 2 };

      const myScore = inA ? set.teamA : set.teamB;
      const oppScore = inA ? set.teamB : set.teamA;
      const won = myScore > oppScore;
      const lost = myScore < oppScore;
      const teamIndex = inA ? 1 : 2;
      return { score: myScore, won, lost, roundId: round.id, matchId: match.id, courtId: match.courtId, teamIndex };
    }
    return { score: null, won: false, lost: false, roundId: round.id, matchId: null, courtId: undefined };
  });
}

interface ResultsTableViewProps {
  game: Game | null;
  rounds: Round[];
  players: BasicUser[];
  isEditing: boolean;
  onAddRound: () => void;
  onCellClick: (roundId: string, matchId: string) => void;
  onDeleteRound?: (roundId: string) => void;
}

export const ResultsTableView = ({ game, rounds, players, isEditing, onAddRound, onCellClick, onDeleteRound }: ResultsTableViewProps) => {
  const { t } = useTranslation();
  const isLandscape = useIsLandscape();
  const [roundIdToDelete, setRoundIdToDelete] = useState<string | null>(null);
  const { width: nameColWidth, isDragging, splitterProps } = useColumnResize({
    initialWidth: 120,
    minWidth: 50,
    maxWidth: 300,
  });

  const rows = useMemo<PlayerRow[]>(() => {
    if (game && rounds.length > 0) {
      const standings = calculateGameStandings(game, rounds, game.winnerOfGame || 'BY_MATCHES_WON');
      return standings.map((s) => {
        const roundScores = buildRoundScoresForPlayer(rounds, s.user.id);
        return {
          player: s.user,
          roundScores,
          total: s.scoresMade,
          delta: s.scoresDelta,
          wins: s.matchesWon,
          ties: s.ties,
          games: roundScores.filter((d) => d.score !== null).length,
        };
      });
    }
    return players.map((player) => {
      const roundScores = buildRoundScoresForPlayer(rounds, player.id);
      const total = roundScores.reduce((sum, d) => sum + (d.score ?? 0), 0);
      const delta = roundScores.reduce((s, d) => {
        if (d.score === null) return s;
        const opp = rounds
          .find((r) => r.id === d.roundId)
          ?.matches.find((m) => m.id === d.matchId);
        if (!opp?.sets[0]) return s;
        const inA = opp.teamA.includes(player.id);
        const oppScore = inA ? opp.sets[0].teamB : opp.sets[0].teamA;
        return s + (d.score! - oppScore);
      }, 0);
      const wins = roundScores.filter((d) => d.won).length;
      const ties = roundScores.filter((d) => !d.won && !d.lost && d.score !== null).length;
      return {
        player,
        roundScores,
        total,
        delta,
        wins,
        ties,
        games: roundScores.filter((d) => d.score !== null).length,
      };
    }).sort((a, b) => b.wins - a.wins || b.ties - a.ties || b.delta - a.delta);
  }, [game, rounds, players]);

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

  const courtIdToName = useMemo(() => {
    const map = new Map<string, string>();
    if (game?.gameCourts) {
      for (const { court } of game.gameCourts) {
        if (court?.id && court?.name) map.set(court.id, court.name);
      }
    }
    return map;
  }, [game?.gameCourts]);

  const COURT_PASTELS = [
    'bg-violet-100 dark:bg-violet-900/30',
    'bg-teal-100 dark:bg-teal-900/30',
    'bg-indigo-100 dark:bg-indigo-900/30',
    'bg-cyan-100 dark:bg-cyan-900/30',
    'bg-blue-100 dark:bg-blue-900/30',
    'bg-slate-100 dark:bg-slate-900/30',
  ];

  const getCourtStyle = (courtId: string | undefined) => {
    if (!courtId) return 'bg-gray-100 dark:bg-gray-800';
    const i = courtColors.indexOf(courtId);
    if (i < 0) return 'bg-gray-100 dark:bg-gray-800';
    return COURT_PASTELS[i % COURT_PASTELS.length] ?? 'bg-gray-100 dark:bg-gray-800';
  };

  const getCellStyle = (data: PlayerRoundData) => {
    const bg = getCourtStyle(data.courtId);
    const text = data.score === null
      ? 'text-gray-400 dark:text-gray-600'
      : 'text-gray-800 dark:text-gray-200';
    return `${bg} border border-gray-200 dark:border-gray-600 ${text}`;
  };

  const getWltBadge = (data: PlayerRoundData) => {
    if (data.score === null) return null;
    if (data.won) return { letter: 'W', className: 'text-green-600 dark:text-green-400' };
    if (data.lost) return { letter: 'L', className: 'text-red-600 dark:text-red-400' };
    if (data.score === 0) return null;
    return { letter: 'T', className: 'text-amber-600 dark:text-amber-400' };
  };

  const fullName = (p: BasicUser) => {
    return `${p.firstName || ''} ${p.lastName || ''}`.trim();
  };

  const nameColStyle = { width: nameColWidth, minWidth: nameColWidth, maxWidth: nameColWidth };

  return (
    <div className="flex flex-col">
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

      <div className="overflow-x-auto px-0 pb-2">
        <table className="text-sm border-collapse w-full" style={{ userSelect: isDragging.current ? 'none' : undefined }}>
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800">
              <th className="sticky top-0 left-0 z-20 bg-gray-50 dark:bg-gray-800 px-1 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 w-6">#</th>
              <th
                className="sticky top-0 left-4 z-20 bg-gray-50 dark:bg-gray-800 px-1 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400"
                style={nameColStyle}
              >
                <div className="flex items-center">
                  <span className="truncate flex-1">{t('gameResults.player')}</span>
                  <div
                    className="flex-shrink-0 w-5 h-full cursor-col-resize flex items-center justify-center gap-0.5 touch-none select-none"
                    {...splitterProps}
                  >
                    <ChevronLeft size={12} strokeWidth={3} className="text-gray-500 dark:text-gray-400" />
                    <div className="w-0.5 h-4 bg-gray-500 dark:bg-gray-400 rounded-full" />
                    <ChevronRight size={12} strokeWidth={3} className="text-gray-500 dark:text-gray-400" />
                  </div>
                </div>
              </th>
              {rounds.map((_, i) => (
                <th key={i} className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 px-1 py-2 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 min-w-[40px]">
                  {i + 1}
                </th>
              ))}
              <th className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 px-1 py-2 text-center text-xs font-bold text-gray-700 dark:text-gray-200 min-w-[40px]" title={t('gameResults.gamesPlayed', { defaultValue: 'Matches played' })}>
                {t('gameResults.games', { defaultValue: 'Games' })}
              </th>
              <th className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 px-1 py-2 text-center text-xs font-bold text-gray-700 dark:text-gray-200 min-w-[48px]">
                {t('gameResults.total')}
              </th>
              <th className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 px-1 py-2 text-center text-xs font-bold text-gray-700 dark:text-gray-200 min-w-[40px]" title={t('gameResults.scoreDelta', { defaultValue: 'Score difference' })}>
                Δ
              </th>
              <th className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 px-1 py-2 text-center text-xs font-bold text-gray-700 dark:text-gray-200 min-w-[40px] rounded-tr-lg">
                {t('gameResults.win', { defaultValue: 'Win' })}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={row.player.id} className="bg-white dark:bg-gray-900">
                <td className="sticky left-0 z-10 px-1 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-900">
                  {idx + 1}
                </td>
                <td
                  className="sticky left-4 z-10 px-1 py-2 text-sm font-medium text-gray-900 dark:text-white bg-white dark:bg-gray-900"
                  style={nameColStyle}
                >
                  <div className="truncate">{fullName(row.player)}</div>
                </td>
                {row.roundScores.map((data, ri) => {
                  const wlt = getWltBadge(data);
                  const roundNumber = rounds.findIndex((r) => r.id === data.roundId) + 1;
                  const handleCellClick = () => {
                    if (!isEditing) return;
                    if (data.matchId) {
                      onCellClick(data.roundId, data.matchId);
                    } else {
                      toast(t('gameResults.playerNotInRound', { playerName: fullName(row.player), roundNumber, defaultValue: '{{playerName}} is not participating in round {{roundNumber}}' }));
                    }
                  };
                  return (
                  <td
                    key={ri}
                    className={`px-1 py-1.5 text-center ${getCourtStyle(data.courtId)} ${isEditing ? 'cursor-pointer active:opacity-70' : ''}`}
                    onClick={handleCellClick}
                  >
                    <span className={`relative inline-flex items-center justify-center w-9 h-7 rounded text-sm font-semibold ${getCellStyle(data)}`}>
                      {data.score !== null ? (data.score === 0 ? <span className="animate-question-bounce">?</span> : data.score) : '—'}
                      {data.teamIndex !== undefined && (
                        <span className="absolute bottom-0.5 left-0.5 text-[8px] leading-none font-bold text-gray-500 dark:text-gray-400">
                          {data.teamIndex}
                        </span>
                      )}
                      {wlt && (
                        <span className={`absolute bottom-0.5 right-0.5 text-[8px] leading-none font-bold ${wlt.className}`}>
                          {wlt.letter}
                        </span>
                      )}
                    </span>
                  </td>
                  );
                })}
                <td className="px-1 py-2 text-center">
                  <span className="inline-flex items-center justify-center min-w-[28px] h-7 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm font-semibold">
                    {row.games}
                  </span>
                </td>
                <td className="px-1 py-2 text-center">
                  <span className="inline-flex items-center justify-center min-w-[36px] h-7 rounded bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200 text-sm font-bold">
                    {row.total}
                  </span>
                </td>
                <td className="px-1 py-2 text-center">
                  <span className={`inline-flex items-center justify-center min-w-[36px] h-7 rounded text-sm font-semibold ${row.delta > 0 ? 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200' : row.delta < 0 ? 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>
                    {row.delta > 0 ? '+' : ''}{row.delta}
                  </span>
                </td>
                <td className="px-1 py-2 text-center">
                  <span className="inline-flex items-center justify-center min-w-[28px] h-7 rounded bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-sm font-semibold">
                    {row.wins}
                  </span>
                </td>
              </tr>
            ))}
            {isEditing && onDeleteRound && rounds.length > 1 && (
              <tr className="bg-gray-100 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
                <td className="sticky left-0 z-10 w-6 bg-gray-100 dark:bg-gray-800" />
                <td className="sticky left-4 z-10 bg-gray-100 dark:bg-gray-800" style={nameColStyle} />
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
                {courtIdToName.get(courtId) ?? t('gameResults.courtNumber', { defaultValue: 'Court {{number}}', number: i + 1 })}
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
