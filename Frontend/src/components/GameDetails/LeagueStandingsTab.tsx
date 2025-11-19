import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { leaguesApi, LeagueStanding } from '@/api/leagues';
import { Loader2, Trophy, Medal, Award } from 'lucide-react';

interface LeagueStandingsTabProps {
  leagueSeasonId: string;
  hasFixedTeams: boolean;
}

export const LeagueStandingsTab = ({ leagueSeasonId, hasFixedTeams }: LeagueStandingsTabProps) => {
  const { t } = useTranslation();
  const [standings, setStandings] = useState<LeagueStanding[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStandings = async () => {
      try {
        const response = await leaguesApi.getStandings(leagueSeasonId);
        setStandings(response.data);
      } catch (error) {
        console.error('Failed to fetch league standings:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStandings();
  }, [leagueSeasonId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin h-8 w-8 text-primary-600" />
      </div>
    );
  }

  if (standings.length === 0) {
    return (
      <Card>
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          {t('gameDetails.noStandings')}
        </div>
      </Card>
    );
  }

  const getPlaceIcon = (index: number) => {
    if (index === 0) {
      return <Trophy className="h-5 w-5 text-yellow-500" />;
    } else if (index === 1) {
      return <Medal className="h-5 w-5 text-gray-400" />;
    } else if (index === 2) {
      return <Medal className="h-5 w-5 text-amber-600" />;
    }
    return null;
  };

  return (
    <div className="space-y-3">
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {t('gameDetails.place')}
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {hasFixedTeams ? t('gameDetails.team') : t('gameDetails.player')}
                </th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {t('gameDetails.points')}
                </th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {t('gameDetails.wins')}
                </th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {t('gameDetails.ties')}
                </th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {t('gameDetails.losses')}
                </th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {t('gameDetails.scoreDelta')}
                </th>
              </tr>
            </thead>
            <tbody>
              {standings.map((standing, index) => (
                <tr
                  key={standing.id}
                  className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                >
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      {getPlaceIcon(index)}
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {index + 1}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    {hasFixedTeams && standing.leagueTeam ? (
                      <div className="flex items-center gap-2">
                        <div className="flex -space-x-2">
                          {standing.leagueTeam.players?.slice(0, 4).map((player: any) => (
                            <PlayerAvatar
                              key={player.id}
                              player={{
                                id: player.userId,
                                firstName: player.user?.firstName,
                                lastName: player.user?.lastName,
                                avatar: player.user?.avatar,
                                level: player.user?.level,
                                gender: player.user?.gender,
                              }}
                              smallLayout={true}
                              showName={false}
                            />
                          ))}
                        </div>
                        {standing.leagueTeam.players && standing.leagueTeam.players.length > 4 && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            +{standing.leagueTeam.players.length - 4}
                          </span>
                        )}
                      </div>
                    ) : standing.user ? (
                      <PlayerAvatar
                        player={{
                          id: standing.user.id,
                          firstName: standing.user.firstName,
                          lastName: standing.user.lastName,
                          avatar: standing.user.avatar,
                          level: standing.user.level,
                          gender: standing.user.gender,
                        }}
                        smallLayout={true}
                        showName={true}
                      />
                    ) : null}
                  </td>
                  <td className="py-3 px-4 text-center text-sm font-semibold text-gray-900 dark:text-white">
                    {standing.points}
                  </td>
                  <td className="py-3 px-4 text-center text-sm text-gray-700 dark:text-gray-300">
                    {standing.wins}
                  </td>
                  <td className="py-3 px-4 text-center text-sm text-gray-700 dark:text-gray-300">
                    {standing.ties}
                  </td>
                  <td className="py-3 px-4 text-center text-sm text-gray-700 dark:text-gray-300">
                    {standing.losses}
                  </td>
                  <td className="py-3 px-4 text-center text-sm text-gray-700 dark:text-gray-300">
                    {standing.scoreDelta > 0 ? '+' : ''}{standing.scoreDelta}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

