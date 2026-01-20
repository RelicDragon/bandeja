import { Edit2, ExternalLink, Award, MapPin, Calendar, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { PlayerAvatar, ConfirmationModal } from '@/components';
import { Game } from '@/types';
import { getLeagueGroupColor, getLeagueGroupSoftColor } from '@/utils/leagueGroupColors';
import { formatDate } from '@/utils/dateFormat';
import { useAuthStore } from '@/store/authStore';
import { resolveDisplaySettings, formatGameTime } from '@/utils/displayPreferences';
import { gamesApi } from '@/api/games';
import toast from 'react-hot-toast';
import { RoundData } from '@/api/results';

interface LeagueGameCardProps {
  game: Game;
  onEdit?: () => void;
  onOpen?: () => void;
  showGroupTag?: boolean;
  allRounds?: RoundData[] | null;
  onDelete?: () => Promise<void> | void;
}

export const LeagueGameCard = ({
  game,
  onEdit,
  onOpen,
  showGroupTag = true,
  allRounds,
  onDelete,
}: LeagueGameCardProps) => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const displaySettings = user ? resolveDisplaySettings(user) : null;

  const getTeamPlayers = (teamIndex: number) => {
    if (game.fixedTeams && game.fixedTeams.length > teamIndex) {
      return game.fixedTeams[teamIndex].players
        .filter(tp => tp.user)
        .map(tp => tp.user!);
    }
    return [];
  };

  const teamAPlayers = getTeamPlayers(0);
  const teamBPlayers = getTeamPlayers(1);

  const teamAPlayerIds = teamAPlayers.map(p => p.id);
  const teamBPlayerIds = teamBPlayers.map(p => p.id);

  const isFinal = game.resultsStatus === 'FINAL';
  const canEdit = game.resultsStatus === 'NONE' && onEdit;
  const canDelete = game.resultsStatus === 'NONE' && onDelete;
  const groupColor = game.leagueGroup ? getLeagueGroupColor(game.leagueGroup.color) : null;
  const groupSoftColor = game.leagueGroup ? getLeagueGroupSoftColor(game.leagueGroup.color) : null;

  let winner: 'teamA' | 'teamB' | null = null;
  let isTie = false;
  
  if (isFinal && game.outcomes && game.outcomes.length > 0) {
    const teamAOutcomes = game.outcomes.filter(o => teamAPlayerIds.includes(o.user?.id));
    const teamBOutcomes = game.outcomes.filter(o => teamBPlayerIds.includes(o.user?.id));
    
    // For fixed teams, all players have identical stats, so just take the first player's wins
    const teamAWins = teamAOutcomes.length > 0 ? (teamAOutcomes[0].wins || 0) : 0;
    const teamBWins = teamBOutcomes.length > 0 ? (teamBOutcomes[0].wins || 0) : 0;
    
    if (teamAWins > teamBWins) {
      winner = 'teamA';
    } else if (teamBWins > teamAWins) {
      winner = 'teamB';
    } else {
      isTie = true;
    }
  }

  const getDurationLabel = () => {
    if (!game.startTime || !game.endTime) return '';

    const durationHours =
      (new Date(game.endTime).getTime() - new Date(game.startTime).getTime()) /
      (1000 * 60 * 60);

    if (durationHours <= 0) return '';

    const hLabel = t('common.h');
    const mLabel = t('common.m');

    if (durationHours === Math.floor(durationHours)) {
      return `${durationHours}${hLabel}`;
    }

    const hours = Math.floor(durationHours);
    const minutes = Math.round((durationHours % 1) * 60);

    if (hours === 0) {
      return `${minutes}${mLabel}`;
    }

    return minutes > 0 ? `${hours}${hLabel}${minutes}${mLabel}` : `${hours}${hLabel}`;
  };

  const getDateTimeLabel = () => {
    if (!game.startTime) return '';

    const gameDate = new Date(game.startTime);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const gameDateOnly = new Date(gameDate.getFullYear(), gameDate.getMonth(), gameDate.getDate());
    const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const tomorrowOnly = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());
    const yesterdayOnly = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());

    let datePart: string;
    if (gameDateOnly.getTime() === todayOnly.getTime()) {
      datePart = t('createGame.today');
    } else if (gameDateOnly.getTime() === tomorrowOnly.getTime()) {
      datePart = t('createGame.tomorrow');
    } else if (gameDateOnly.getTime() === yesterdayOnly.getTime()) {
      datePart = t('createGame.yesterday');
    } else {
      const daysDiff = Math.abs(Math.round((gameDateOnly.getTime() - todayOnly.getTime()) / (1000 * 60 * 60 * 24)));
      const dateFormat = daysDiff <= 7 ? 'EEEE • d MMM' : 'd MMM';
      datePart = formatDate(game.startTime, dateFormat);
    }

    const timePart = displaySettings ? formatGameTime(game.startTime, displaySettings) : formatDate(game.startTime, 'HH:mm');
    const durationPart = getDurationLabel();

    return `${datePart} • ${timePart}${durationPart ? ` • ${durationPart}` : ''}`;
  };

  const handleDelete = async () => {
    if (isDeleting) return;
    
    setIsDeleting(true);
    try {
      if (game.children && game.children.length > 0) {
        for (const child of game.children) {
          if (child.resultsStatus === 'NONE') {
            try {
              await gamesApi.delete(child.id);
            } catch (error: any) {
              console.error(`Failed to delete linked game ${child.id}:`, error);
            }
          }
        }
      }
      
      await gamesApi.delete(game.id);
      toast.success(t('gameDetails.gameDeleted') || 'Game deleted successfully');
      if (onDelete) {
        await onDelete();
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    } finally {
      setIsDeleting(false);
      setShowConfirmDelete(false);
    }
  };

  return (
    <div className="relative pl-2 pt-2 pb-6 pr-2 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      {game.leagueGroup && (
        <div
          className="absolute left-0 top-0 bottom-0 w-1"
          style={{
            backgroundColor: groupColor ?? '#4F46E5',
          }}
        />
      )}
      {game.leagueGroup && showGroupTag && (
        <div
          className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-xs font-semibold border"
          style={{
            backgroundColor: groupSoftColor ?? '#EEF2FF',
            color: groupColor ?? '#4F46E5',
            borderColor: groupColor ?? '#4F46E5',
          }}
        >
          {game.leagueGroup.name}
        </div>
      )}

      <div className="flex items-center justify-center w-full gap-3">
        <div className="flex justify-start relative">
          <div
            className={`min-h-[20px] p-2 flex items-center justify-center ${
              winner === 'teamA' 
                ? 'bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-400 dark:border-yellow-500 rounded-lg' 
                : isTie 
                ? 'bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-400 dark:border-blue-500 rounded-lg' 
                : ''
            }`}
          >
            <div className="flex gap-5 justify-center">
              {teamAPlayers.map(player => (
                <div key={player.id}>
                  <PlayerAvatar
                    player={player}
                    draggable={false}
                    showName={true}
                    extrasmall={true}
                    removable={false}
                  />
                </div>
              ))}
            </div>
          </div>
          {isFinal && winner === 'teamA' && (
            <div className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-yellow-400 dark:bg-yellow-500 border-2 border-white dark:border-gray-800 flex items-center justify-center shadow-lg">
              <Award size={14} className="text-white" fill="white" />
            </div>
          )}
          {isFinal && isTie && (
            <div className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-blue-400 dark:bg-blue-500 border-2 border-white dark:border-gray-800 flex items-center justify-center shadow-lg">
              <Award size={14} className="text-white" fill="white" />
            </div>
          )}
        </div>

        {isFinal && allRounds && allRounds.length > 0 && allRounds.some(round => 
          round.matches && round.matches.some(match => 
            match.sets && match.sets.some(set => set.teamAScore > 0 || set.teamBScore > 0)
          )
        ) ? (
          <div className="flex flex-col items-center gap-1 -ml-2 -mr-2 max-h-32 overflow-y-auto">
            {allRounds.flatMap((round, roundIndex) => 
              round.matches?.flatMap((match, matchIndex) => 
                match.sets?.map((set, setIndex) => {
                  if (set.teamAScore === 0 && set.teamBScore === 0) return null;
                  return (
                    <div
                      key={`r${roundIndex}-m${matchIndex}-s${setIndex}`}
                      className="px-2 py-1 rounded text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                    >
                      {set.teamAScore}:{set.teamBScore}
                      {set.isTieBreak && (
                        <span className="ml-1 text-[10px] font-bold text-primary-600 dark:text-primary-400">TB</span>
                      )}
                    </div>
                  );
                }) || []
              ) || []
            )}
          </div>
        ) : (
          <div className="flex items-center">
            <div className="text-sm font-semibold text-gray-500 dark:text-gray-400">
              VS
            </div>
          </div>
        )}

        <div className="flex justify-start relative">
          <div
            className={`min-h-[20px] p-2 flex items-center justify-center ${
              winner === 'teamB' 
                ? 'bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-400 dark:border-yellow-500 rounded-lg' 
                : isTie 
                ? 'bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-400 dark:border-blue-500 rounded-lg' 
                : ''
            }`}
          >
            <div className="flex gap-5 justify-center">
              {teamBPlayers.map(player => (
                <div key={player.id}>
                  <PlayerAvatar
                    player={player}
                    draggable={false}
                    showName={true}
                    extrasmall={true}
                    removable={false}
                  />
                </div>
              ))}
            </div>
          </div>
          {isFinal && winner === 'teamB' && (
            <div className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-yellow-400 dark:bg-yellow-500 border-2 border-white dark:border-gray-800 flex items-center justify-center shadow-lg">
              <Award size={14} className="text-white" fill="white" />
            </div>
          )}
          {isFinal && isTie && (
            <div className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-blue-400 dark:bg-blue-500 border-2 border-white dark:border-gray-800 flex items-center justify-center shadow-lg">
              <Award size={14} className="text-white" fill="white" />
            </div>
          )}
        </div>
      </div>

      {(game.club?.name || game.court?.name || (game.timeIsSet && game.startTime)) && (
        <div className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 flex flex-col gap-1">
          {game.timeIsSet && game.startTime && (
            <div className="flex items-center gap-1">
              <Calendar size={10} />
              <span>{getDateTimeLabel()}</span>
            </div>
          )}
          {(game.club?.name || game.court?.name) && (
            <div className="flex items-center gap-1">
              {game.club?.name && (
                <>
                  <MapPin size={10} />
                  <span>{game.club.name}</span>
                </>
              )}
              {game.court?.name && (
                <>
                  {game.club?.name && <span className="text-gray-500 dark:text-gray-600">•</span>}
                  <span>{game.court.name}</span>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {(onOpen || canEdit || canDelete) && (
        <div className="absolute bottom-2 right-2 flex items-center gap-2 z-10">
          {canDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowConfirmDelete(true);
              }}
              disabled={isDeleting}
              className="w-8 h-8 rounded-full border-2 border-red-500 hover:border-red-600 bg-white dark:bg-gray-800 text-red-500 hover:text-red-600 flex items-center justify-center transition-colors shadow-lg disabled:opacity-50"
            >
              <Trash2 size={16} />
            </button>
          )}
          {canEdit && (
            <button
              onClick={onEdit}
              className="w-8 h-8 rounded-full border-2 border-blue-500 hover:border-blue-600 bg-white dark:bg-gray-800 text-blue-500 hover:text-blue-600 flex items-center justify-center transition-colors shadow-lg"
            >
              <Edit2 size={16} />
            </button>
          )}
          {onOpen && (
            <button
              onClick={onOpen}
              className="w-8 h-8 rounded-full border-2 border-emerald-500 hover:border-emerald-600 bg-white dark:bg-gray-800 text-emerald-500 hover:text-emerald-600 flex items-center justify-center transition-colors shadow-lg"
            >
              <ExternalLink size={16} />
            </button>
          )}
        </div>
      )}

      <ConfirmationModal
        isOpen={showConfirmDelete}
        onClose={() => setShowConfirmDelete(false)}
        onConfirm={handleDelete}
        title={t('gameDetails.deleteGame') || 'Delete Game'}
        message={t('gameDetails.deleteGameConfirmation') || 'Are you sure you want to delete this game? This action cannot be undone.'}
        confirmText={isDeleting ? (t('common.deleting') || 'Deleting...') : (t('common.delete') || 'Delete')}
        cancelText={t('common.cancel') || 'Cancel'}
        confirmVariant="danger"
      />
    </div>
  );
};

