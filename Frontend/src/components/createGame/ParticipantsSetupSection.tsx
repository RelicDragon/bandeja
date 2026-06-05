import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Users as UsersIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BasicUser, EntityType } from '@/types';
import {
  gameLeagueRosterOptions,
  tournamentParticipantOptions,
  trainingParticipantOptions,
} from '@/utils/userMaxParticipantsInGame';
import { MatchFormatControl } from './MatchFormatControl';
import { GameFormatFixedTeamsToggle } from '@/components/gameFormat/GameFormatTeamsFields';

interface ParticipantsSetupSectionProps {
  entityType: EntityType;
  user: BasicUser | null;
  maxParticipants: number;
  onMaxParticipantsChange: (num: number) => void;
  allowedParticipantOptions?: number[];
  playersPerMatch?: number;
  allowedPlayerCountsPerMatch?: number[];
  onPlayersPerMatchChange?: (count: number) => void;
  hasFixedTeams: boolean;
  onHasFixedTeamsChange: (v: boolean) => void;
}

export const ParticipantsSetupSection = ({
  entityType,
  user,
  maxParticipants,
  onMaxParticipantsChange,
  allowedParticipantOptions,
  playersPerMatch,
  allowedPlayerCountsPerMatch,
  onPlayersPerMatchChange,
  hasFixedTeams,
  onHasFixedTeamsChange,
}: ParticipantsSetupSectionProps) => {
  const { t } = useTranslation();
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
  const shouldShowMatchFormat = showMatchFormat && maxParticipants > 2;

  useEffect(() => {
    if (showMatchFormat && maxParticipants === 2 && playersPerMatch !== 2) {
      onPlayersPerMatchChange(2);
    }
  }, [showMatchFormat, maxParticipants, playersPerMatch, onPlayersPerMatchChange]);

  const handleParticipantsChange = (num: number) => {
    onMaxParticipantsChange(num);
    if (showMatchFormat && num === 2) {
      onPlayersPerMatchChange(2);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
      <div className="flex items-center gap-2 mb-3">
        <UsersIcon size={18} className="text-gray-500 dark:text-gray-400" />
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
          {entityType === 'TOURNAMENT'
            ? t('createGame.participantsTournament')
            : entityType === 'LEAGUE'
              ? t('createGame.participantsLeague')
              : t('createGame.participants')}
        </h2>
      </div>
      <div className="space-y-4">
        {entityType !== 'BAR' && (
          <div>
            <div
              className={`grid gap-2 ${
                entityType === 'TOURNAMENT'
                  ? 'grid-cols-7'
                  : entityType === 'TRAINING'
                    ? 'grid-cols-8'
                    : 'grid-cols-6'
              }`}
            >
              {entityType === 'TOURNAMENT'
                ? tournamentSlots.map((num) => (
                    <button
                      key={num}
                      onClick={() => handleParticipantsChange(num)}
                      className={`h-10 rounded-lg font-semibold text-sm transition-all ${
                        maxParticipants === num
                          ? 'bg-primary-500 text-white'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                    >
                      {num}
                    </button>
                  ))
                : effectiveGameLeagueSlots.map((num) => (
                    <button
                      key={num}
                      onClick={() => handleParticipantsChange(num)}
                      className={`h-10 rounded-lg font-semibold text-sm transition-all ${
                        maxParticipants === num
                          ? 'bg-primary-500 text-white'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                    >
                      {num}
                    </button>
                  ))}
            </div>
          </div>
        )}
        <AnimatePresence initial={false}>
          {shouldShowMatchFormat && (
            <motion.div
              key="match-format-control"
              initial={{ opacity: 0, height: 0, y: -6 }}
              animate={{ opacity: 1, height: 'auto', y: 0 }}
              exit={{ opacity: 0, height: 0, y: -6 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="overflow-hidden border-t border-gray-200 dark:border-gray-800 pt-4"
            >
              <MatchFormatControl
                playersPerMatch={playersPerMatch}
                allowedCounts={allowedPlayerCountsPerMatch}
                onChange={onPlayersPerMatchChange}
                emphasized
                label={t('createGame.teamFormat')}
                labelSingles={t('sport.matchSingles')}
                labelDoubles={t('sport.matchDoubles')}
                hintSingles={t('sport.match1v1')}
                hintDoubles={t('sport.match2v2')}
              />
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence initial={false}>
          {showMatchFormat && shouldShowMatchFormat && playersPerMatch === 4 && (
            <motion.div
              key="fixed-pairs-toggle"
              initial={{ opacity: 0, height: 0, y: -6 }}
              animate={{ opacity: 1, height: 'auto', y: 0 }}
              exit={{ opacity: 0, height: 0, y: -6 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <GameFormatFixedTeamsToggle
                entityType={entityType}
                participantCount={maxParticipants}
                hasFixedTeams={hasFixedTeams}
                onHasFixedTeamsChange={onHasFixedTeamsChange}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
