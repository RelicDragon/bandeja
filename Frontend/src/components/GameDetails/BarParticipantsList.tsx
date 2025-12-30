import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { usersApi } from '@/api/users';
import { GameParticipant } from '@/types';
import { Loader2, TrendingUp, TrendingDown } from 'lucide-react';

interface BarParticipantsListProps {
  gameId: string;
  participants: GameParticipant[];
}

interface ParticipantWithLevelChange extends GameParticipant {
  levelChange?: {
    levelBefore: number;
    levelAfter: number;
    levelChange: number;
  };
}

export const BarParticipantsList = ({ gameId, participants }: BarParticipantsListProps) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [participantsWithLevels, setParticipantsWithLevels] = useState<ParticipantWithLevelChange[]>([]);

  const getDecimals = (value: number) => {
    if (value === 0) return 2;
    const absValue = Math.abs(value);
    if (absValue < 0.01) {
      return Math.ceil(-Math.log10(absValue)) + 1;
    }
    return 2;
  };

  const formatNumber = (value: number) => {
    const formatted = value.toFixed(getDecimals(value));
    const absValue = Math.abs(value);
    if (absValue < 0.1 && absValue > 0) {
      return formatted.replace(/0+$/, '').replace(/\.$/, '');
    }
    return formatted;
  };

  const formatChange = (change: number) => {
    const formatted = formatNumber(change);
    return change > 0 ? `+${formatted}` : formatted;
  };

  useEffect(() => {
    const fetchLevelChanges = async () => {
      try {
        const response = await usersApi.getGameLevelChanges(gameId);
        const levelChanges = response.data;

        const levelChangeMap = new Map(
          levelChanges.map((lc) => [lc.userId, {
            levelBefore: lc.levelBefore,
            levelAfter: lc.levelAfter,
            levelChange: lc.levelChange,
          }])
        );

        const playingParticipants = participants.filter(p => p.isPlaying);
        const participantsWithChanges: ParticipantWithLevelChange[] = playingParticipants.map((p) => ({
          ...p,
          levelChange: levelChangeMap.get(p.userId),
        }));

        setParticipantsWithLevels(participantsWithChanges);
      } catch (error) {
        console.error('Failed to fetch level changes:', error);
        const playingParticipants = participants.filter(p => p.isPlaying);
        setParticipantsWithLevels(playingParticipants.map(p => ({ ...p })));
      } finally {
        setLoading(false);
      }
    };

    fetchLevelChanges();
  }, [gameId, participants]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin h-8 w-8 text-primary-600" />
      </div>
    );
  }

  if (participantsWithLevels.length === 0) {
    return null;
  }

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="text-left py-2 pl-4 pr-0 text-xs font-semibold text-gray-700 dark:text-gray-300">
                {t('gameDetails.player')}
              </th>
              <th className="text-center py-2 pl-0 pr-2 text-xs font-semibold text-gray-700 dark:text-gray-300">
                {t('gameResults.socialLevelBefore')}
              </th>
            </tr>
          </thead>
          <tbody>
            {participantsWithLevels.map((participant) => {
              const socialLevel = participant.levelChange?.levelAfter ?? participant.user?.socialLevel;
              return (
                <tr
                  key={participant.userId}
                  className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                >
                  <td className="py-2 pl-4 pr-0">
                    {participant.user ? (
                      <div className="flex items-center gap-3">
                        <PlayerAvatar
                          player={{
                            id: participant.user.id,
                            firstName: participant.user.firstName,
                            lastName: participant.user.lastName,
                            avatar: participant.user.avatar,
                            level: participant.user.level,
                            socialLevel: socialLevel,
                            gender: participant.user.gender,
                          }}
                          extrasmall={true}
                          showName={false}
                          fullHideName={true}
                        />
                        <div className="text-sm text-gray-900 dark:text-white">
                          {[participant.user.firstName, participant.user.lastName].filter(Boolean).join(' ')}
                        </div>
                      </div>
                    ) : null}
                  </td>
                  <td className="py-2 pl-0 pr-2 text-center">
                    {participant.levelChange ? (
                      <div className="flex flex-col items-center gap-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm text-gray-700 dark:text-gray-300">
                            {formatNumber(participant.levelChange.levelBefore)}
                          </span>
                          <span className="text-gray-400 dark:text-gray-500">→</span>
                          <span className="text-sm font-semibold text-gray-900 dark:text-white">
                            {formatNumber(participant.levelChange.levelAfter)}
                          </span>
                        </div>
                        {participant.levelChange.levelChange !== 0 && (
                          <div className={`inline-flex items-center gap-0.5 ${participant.levelChange.levelChange > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {participant.levelChange.levelChange > 0 ? (
                              <TrendingUp size={14} />
                            ) : (
                              <TrendingDown size={14} />
                            )}
                            <span className="text-xs font-semibold">
                              {formatChange(participant.levelChange.levelChange)}
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-gray-500 dark:text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

