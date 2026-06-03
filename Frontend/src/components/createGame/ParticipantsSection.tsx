import { useState } from 'react';
import { UserPlus, Users2, Plus, Trophy, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, PlayerAvatar, RangeSlider } from '@/components';
import { BasicUser } from '@/types';
import { EntityType } from '@/types';
import {
  gameLeagueRosterOptions,
  tournamentParticipantOptions,
  trainingParticipantOptions,
} from '@/utils/userMaxParticipantsInGame';
import { MatchFormatControl } from './MatchFormatControl';

interface ParticipantsSectionProps {
  participants: Array<string | null>;
  maxParticipants: number;
  invitedPlayerIds: string[];
  invitedPlayers?: BasicUser[];
  user: BasicUser | null;
  entityType: EntityType;
  canInvitePlayers: boolean;
  creatorNonPlaying?: boolean;
  allowedParticipantOptions?: number[];
  playersPerMatch?: number;
  allowedPlayerCountsPerMatch?: number[];
  onPlayersPerMatchChange?: (count: number) => void;
  onMaxParticipantsChange: (num: number) => void;
  onAddUserToGame: () => void;
  onRemoveParticipant: (index: number) => void;
  onRemoveInvitedPlayer?: (playerId: string) => void;
  onOpenInviteModal: () => void;
  onToggleCreatorNonPlaying?: (nonPlaying: boolean) => void;
  showSetupControls?: boolean;
  playerLevelRange?: [number, number];
  onPlayerLevelRangeChange?: (range: [number, number]) => void;
}

export const ParticipantsSection = ({
  participants,
  maxParticipants,
  invitedPlayerIds,
  invitedPlayers = [],
  user,
  entityType,
  canInvitePlayers,
  creatorNonPlaying = false,
  allowedParticipantOptions,
  playersPerMatch,
  allowedPlayerCountsPerMatch,
  onPlayersPerMatchChange,
  onMaxParticipantsChange,
  onAddUserToGame,
  onRemoveParticipant,
  onRemoveInvitedPlayer,
  onOpenInviteModal,
  onToggleCreatorNonPlaying,
  showSetupControls = true,
  playerLevelRange,
  onPlayerLevelRangeChange,
}: ParticipantsSectionProps) => {
  const { t } = useTranslation();
  const [isLevelExpanded, setIsLevelExpanded] = useState(false);
  const tournamentSlots = tournamentParticipantOptions(user);
  const gameLeagueSlots = gameLeagueRosterOptions(user);
  const trainingSlots = trainingParticipantOptions();
  const effectiveGameLeagueSlots =
    entityType === 'TRAINING'
      ? trainingSlots
      : allowedParticipantOptions && allowedParticipantOptions.length > 0
        ? allowedParticipantOptions
        : gameLeagueSlots;
  const showMatchFormat =
    (entityType === 'GAME' || entityType === 'LEAGUE') &&
    playersPerMatch != null &&
    allowedPlayerCountsPerMatch != null &&
    allowedPlayerCountsPerMatch.length > 1 &&
    onPlayersPerMatchChange != null;

  const renderParticipants = () => {
    const result = [];
    for (let i = 0; i < participants.length; i++) {
      const participantId = participants[i];
      if (participantId && participantId === user?.id && user) {
        result.push(
          <PlayerAvatar
            key={i}
            player={user}
            isCurrentUser={true}
            removable={entityType !== 'TRAINING'}
            onRemoveClick={entityType !== 'TRAINING' ? () => onRemoveParticipant(i) : undefined}
            smallLayout={true}
          />
        );
      } else {
        result.push(
          <PlayerAvatar
            key={i}
            player={null}
            smallLayout={true}
          />
        );
      }
    }
    if (entityType !== 'BAR' && entityType !== 'TOURNAMENT' && entityType !== 'LEAGUE') {
      for (let i = participants.length; i < maxParticipants; i++) {
        if (canInvitePlayers) {
          result.push(
            <button
              key={i}
              onClick={onOpenInviteModal}
              className="flex flex-col items-center"
            >
              <div className="w-12 h-12 rounded-full border-2 border-dashed border-primary-400 dark:border-primary-600 bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center hover:bg-primary-100 dark:hover:bg-primary-800/30 transition-colors">
                <Plus className="w-6 h-6 text-primary-600 dark:text-primary-400" />
              </div>
            </button>
          );
        } else {
          result.push(
            <PlayerAvatar
              key={i}
              player={null}
              smallLayout={true}
            />
          );
        }
      }
    }
    return result;
  };

  const isUserInGame = user && participants.includes(user.id);
  const canAddUser = entityType === 'BAR' || participants.length < maxParticipants;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
      <div className="space-y-4">
        {entityType !== 'BAR' &&
          entityType !== 'TRAINING' &&
          playerLevelRange &&
          onPlayerLevelRangeChange && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900/50 p-3">
              <button
                type="button"
                onClick={() => setIsLevelExpanded((prev) => !prev)}
                className="w-full flex items-center justify-between gap-3"
                aria-expanded={isLevelExpanded}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Trophy size={16} className="text-gray-500 dark:text-gray-400" />
                  <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                    {entityType === 'TOURNAMENT'
                      ? t('createGame.playerLevelTournament')
                      : entityType === 'LEAGUE'
                        ? t('createGame.playerLevelLeague')
                        : t('createGame.playerLevel')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold px-2 py-1 rounded-full bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                    {playerLevelRange[0].toFixed(1)} - {playerLevelRange[1].toFixed(1)}
                  </span>
                  <ChevronDown
                    size={16}
                    className={`text-gray-500 transition-transform ${isLevelExpanded ? 'rotate-180' : ''}`}
                  />
                </div>
              </button>
              {isLevelExpanded && (
                <div className="mt-3">
                  <RangeSlider
                    min={1.0}
                    max={7.0}
                    value={playerLevelRange}
                    onChange={onPlayerLevelRangeChange}
                    step={0.1}
                  />
                </div>
              )}
            </div>
          )}
        {showSetupControls && entityType !== 'BAR' && (
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
              {entityType === 'TOURNAMENT' ? t('createGame.numberOfParticipantsTournament') :
               entityType === 'LEAGUE' ? t('createGame.numberOfParticipantsLeague') :
               t('createGame.numberOfParticipants')}
            </label>
            <div
              className={`grid gap-2 ${
                entityType === 'TOURNAMENT'
                  ? 'grid-cols-7'
                  : entityType === 'TRAINING'
                    ? 'grid-cols-8'
                    : 'grid-cols-6'
              }`}
            >
              {entityType === 'TOURNAMENT' ? (
                tournamentSlots.map((num) => (
                  <button
                    key={num}
                    onClick={() => onMaxParticipantsChange(num)}
                    className={`h-10 rounded-lg font-semibold text-sm transition-all ${
                      maxParticipants === num
                        ? 'bg-primary-500 text-white'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {num}
                  </button>
                ))
              ) : (
                effectiveGameLeagueSlots.map((num) => (
                  <button
                    key={num}
                    onClick={() => onMaxParticipantsChange(num)}
                    className={`h-10 rounded-lg font-semibold text-sm transition-all ${
                      maxParticipants === num
                        ? 'bg-primary-500 text-white'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {num}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
        {showSetupControls && showMatchFormat && (
          <MatchFormatControl
            playersPerMatch={playersPerMatch}
            allowedCounts={allowedPlayerCountsPerMatch}
            onChange={onPlayersPerMatchChange}
            disabled={maxParticipants === 2}
            label={t('sport.matchFormat')}
            labelSingles={t('sport.matchSingles')}
            labelDoubles={t('sport.matchDoubles')}
            hintSingles={t('sport.match1v1')}
            hintDoubles={t('sport.match2v2')}
          />
        )}
        {entityType === 'TRAINING' && onToggleCreatorNonPlaying && (
          <div className="flex items-center justify-between py-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('createGame.iWantToPlay', { defaultValue: 'I want to play' })}
            </label>
            <button
              type="button"
              onClick={() => onToggleCreatorNonPlaying(!creatorNonPlaying)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${!creatorNonPlaying ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${!creatorNonPlaying ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        )}
        {entityType !== 'TRAINING' && !isUserInGame && !creatorNonPlaying && (
          <Button
            onClick={onAddUserToGame}
            disabled={!canAddUser}
            variant="outline"
            size="sm"
            className="w-full flex items-center justify-center"
          >
            <UserPlus size={16} className="mr-2" />
            {t('createGame.addMeToGame')}
          </Button>
        )}
        <div className="space-y-2">
        <div className="flex flex-wrap gap-3">
          {renderParticipants()}
        </div>
        {invitedPlayers.length > 0 && (
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-2 text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
              <Users2 size={16} />
              <span>{t('createGame.invitesWillBeSent', { count: invitedPlayers.length })}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {invitedPlayers.map((player) => (
                <PlayerAvatar
                  key={player.id}
                  player={player}
                  showName={false}
                  smallLayout={true}
                  removable={true}
                  onRemoveClick={onRemoveInvitedPlayer ? () => onRemoveInvitedPlayer(player.id) : undefined}
                />
              ))}
            </div>
          </div>
        )}
        <Button
          onClick={onOpenInviteModal}
          variant="outline"
          size="sm"
          className="w-full flex items-center justify-center"
        >
          <Users2 size={16} className="mr-2" />
          {invitedPlayerIds.length > 0 
            ? t('createGame.manageInvites', { count: invitedPlayerIds.length })
            : t('games.invitePlayers')
          }
        </Button>
        </div>
      </div>
    </div>
  );
};

