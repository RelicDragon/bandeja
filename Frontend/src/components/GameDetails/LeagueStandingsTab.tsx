import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { leaguesApi, LeagueStanding } from '@/api/leagues';
import { Loader2, Trophy, Medal } from 'lucide-react';
import { getLeagueGroupColor, getLeagueGroupSoftColor } from '@/utils/leagueGroupColors';
import { GroupFilterDropdown } from './GroupFilterDropdown';

const ALL_GROUP_ID = 'ALL';
const GROUP_FILTER_STORAGE_PREFIX = 'group_filter_league_season_';

interface LeagueStandingsTabProps {
  leagueSeasonId: string;
  hasFixedTeams: boolean;
}

export const LeagueStandingsTab = ({ leagueSeasonId, hasFixedTeams }: LeagueStandingsTabProps) => {
  const { t } = useTranslation();
  const [standings, setStandings] = useState<LeagueStanding[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAwardIcons, setShowAwardIcons] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string>(ALL_GROUP_ID);
  const NO_GROUP_KEY = 'no-group';
  const storageKey = `${GROUP_FILTER_STORAGE_PREFIX}${leagueSeasonId}`;

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

  useEffect(() => {
    const interval = setInterval(() => setShowAwardIcons((prev) => !prev), 1500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const savedGroupId = localStorage.getItem(storageKey);
    if (savedGroupId) {
      setSelectedGroupId(savedGroupId);
    }
  }, [storageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(storageKey, selectedGroupId);
  }, [selectedGroupId, storageKey]);

  const compareStandings = (a: LeagueStanding, b: LeagueStanding) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.scoreDelta !== a.scoreDelta) return b.scoreDelta - a.scoreDelta;
    return 0;
  };

  const groupStandingsMap = new Map<string, LeagueStanding[]>();
  const groupMetadata = new Map<
    string,
    NonNullable<LeagueStanding['currentGroup']>
  >();

  standings.forEach((standing) => {
    if (standing.currentGroup) {
      groupMetadata.set(standing.currentGroup.id, standing.currentGroup);
    }

    const key = standing.currentGroup?.id ?? NO_GROUP_KEY;
    if (!groupStandingsMap.has(key)) {
      groupStandingsMap.set(key, []);
    }
    groupStandingsMap.get(key)!.push(standing);
  });

  const getOrderedGroupIds = () => {
    const visited = new Set<string>();
    const order: string[] = [];

    const walkChain = (groupId: string | undefined | null) => {
      let currentId = groupId ?? undefined;
      while (currentId && !visited.has(currentId)) {
        visited.add(currentId);
        if (groupStandingsMap.has(currentId)) {
          order.push(currentId);
        }
        const currentGroup = groupMetadata.get(currentId);
        currentId = currentGroup?.worseGroupId ?? undefined;
      }
    };

    const heads = Array.from(groupMetadata.values()).filter(
      (group) => !group.betterGroupId || !groupMetadata.has(group.betterGroupId)
    );

    heads.sort((a, b) => a.name.localeCompare(b.name)).forEach((head) => walkChain(head.id));

    groupMetadata.forEach((_, groupId) => {
      if (!visited.has(groupId)) {
        walkChain(groupId);
      }
    });

    return order;
  };

  const orderedGroupIds = getOrderedGroupIds();
  const orderedGroups = orderedGroupIds.map((groupId) => ({
    id: groupId,
    name: groupMetadata.get(groupId)?.name || t('gameDetails.group') || 'Group',
    color: groupMetadata.get(groupId)?.color,
    standings: [...(groupStandingsMap.get(groupId) || [])].sort(compareStandings),
  }));

  useEffect(() => {
    if (loading) return;
    if (selectedGroupId !== ALL_GROUP_ID && !orderedGroupIds.includes(selectedGroupId)) {
      setSelectedGroupId(ALL_GROUP_ID);
      if (typeof window !== 'undefined') {
        localStorage.setItem(storageKey, ALL_GROUP_ID);
      }
    }
  }, [loading, orderedGroupIds, selectedGroupId, storageKey]);

  const ungroupedStandings = groupStandingsMap.get(NO_GROUP_KEY);
  const hasGroups = orderedGroups.length > 0;
  const filteredGroups = selectedGroupId === ALL_GROUP_ID ? orderedGroups : orderedGroups.filter((group) => group.id === selectedGroupId);

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

  const renderPlaceDisplay = (index: number) => {
    const icon = getPlaceIcon(index);
    const placeNumber = index + 1;

    if (!icon) {
      return (
        <span className="text-sm font-medium text-gray-900 dark:text-white">
          {placeNumber}
        </span>
      );
    }

    return (
      <div className="relative flex items-center justify-center w-12 h-6 overflow-hidden">
        <span
          className={`text-sm font-semibold text-gray-900 dark:text-white transition-all duration-500 transform ${
            showAwardIcons ? 'opacity-0 -translate-y-2' : 'opacity-100 translate-y-0'
          }`}
        >
          {placeNumber}
        </span>
        <span
          className={`absolute inset-0 flex items-center justify-center transition-all duration-500 transform ${
            showAwardIcons ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
          }`}
        >
          {icon}
        </span>
      </div>
    );
  };

  const renderStandingsTable = (groupStandings: LeagueStanding[], startIndex: number = 0) => (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="w-14" />
            <th className="text-left py-2 pl-0 pr-0 text-xs font-semibold text-gray-700 dark:text-gray-300">
              <div className="-translate-x-2">
                {hasFixedTeams ? t('gameDetails.team') : t('gameDetails.player')}
              </div>
            </th>
            <th className="text-center py-2 pl-0 pr-2 text-xs font-semibold text-gray-700 dark:text-gray-300">
              {t('gameDetails.points')}
            </th>
            <th className="text-center py-2 pl-4 pr-2 text-xs font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">
              {t('gameResults.winsTiesLosses')}
            </th>
            <th className="text-center py-2 px-2 text-xs font-semibold text-gray-700 dark:text-gray-300">
              Δ
            </th>
          </tr>
        </thead>
        <tbody>
          {groupStandings.map((standing, index) => (
            <tr
              key={standing.id}
              className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
            >
              <td className="py-2 pl-0 pr-0">
                <div className="flex items-center justify-center -translate-x-2">
                  {renderPlaceDisplay(startIndex + index)}
                </div>
              </td>
              <td className="py-2 pl-0 pr-0">
                {hasFixedTeams && standing.leagueTeam ? (
                  <div className="flex items-center gap-3 -translate-x-2">
                    <div className="flex -space-x-2">
                      {standing.leagueTeam.players?.slice(0, 3).map((player: any) => (
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
                          extrasmall={true}
                          showName={false}
                          fullHideName={true}
                        />
                      ))}
                    </div>
                    <div className="text-sm text-gray-900 dark:text-white">
                      {standing.leagueTeam.players
                        ?.map((p: any) => `${p.user?.firstName ?? ''} ${p.user?.lastName ?? ''}`.trim())
                        .filter(Boolean)
                        .join(', ')}
                    </div>
                  </div>
                ) : standing.user ? (
                  <div className="flex items-center gap-3 -translate-x-2">
                    <PlayerAvatar
                      player={{
                        id: standing.user.id,
                        firstName: standing.user.firstName,
                        lastName: standing.user.lastName,
                        avatar: standing.user.avatar,
                        level: standing.user.level,
                        gender: standing.user.gender,
                      }}
                      extrasmall={true}
                      showName={false}
                      fullHideName={true}
                    />
                    <div className="text-sm text-gray-900 dark:text-white">
                      {[standing.user.firstName, standing.user.lastName].filter(Boolean).join(' ')}
                    </div>
                  </div>
                ) : null}
              </td>
              <td className="py-2 pl-0 pr-2 text-center text-sm font-semibold text-gray-900 dark:text-white">
                {standing.points}
              </td>
              <td className="py-2 pl-4 pr-2 text-center text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                {standing.wins}-{standing.ties}-{standing.losses}
              </td>
              <td className="py-2 px-2 text-center text-sm text-gray-700 dark:text-gray-300">
                {standing.scoreDelta > 0 ? '+' : ''}{standing.scoreDelta}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-3">
      {orderedGroups.length > 0 && (
        <GroupFilterDropdown
          selectedGroupId={selectedGroupId}
          groups={orderedGroups.map((g) => ({ id: g.id, name: g.name, color: g.color ?? undefined }))}
          allGroupsLabel={t('gameDetails.allGroups') || 'All groups'}
          onSelect={setSelectedGroupId}
          allGroupId={ALL_GROUP_ID}
        />
      )}
      {hasGroups ? (
        <>
          {filteredGroups.map(({ id, name, color, standings: groupStandings }) => {
            const accent = getLeagueGroupColor(color);
            const soft = getLeagueGroupSoftColor(color, '1A');
            
            return (
              <Card key={id}>
                {selectedGroupId === ALL_GROUP_ID && (
                  <div
                    className="px-4 py-3 border-b border-gray-200 dark:border-gray-700"
                    style={{ backgroundColor: soft }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full border"
                        style={{ backgroundColor: accent, borderColor: accent }}
                      />
                      <h3 className="text-lg font-bold" style={{ color: accent }}>
                        {name}
                      </h3>
                    </div>
                  </div>
                )}
                {renderStandingsTable(groupStandings, 0)}
              </Card>
            );
          })}
          {selectedGroupId === ALL_GROUP_ID && ungroupedStandings && ungroupedStandings.length > 0 && (
            <Card key={NO_GROUP_KEY}>
              <div className="px-4 py-3 bg-gradient-to-r from-primary-50 to-primary-100/50 dark:from-primary-900/20 dark:to-primary-800/10 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                  {t('gameDetails.noGroup') || 'No Group'}
                </h3>
              </div>
              {renderStandingsTable(
                [...ungroupedStandings].sort(compareStandings),
                0
              )}
            </Card>
          )}
        </>
      ) : (
        <Card>
          {renderStandingsTable(standings, 0)}
        </Card>
      )}
    </div>
  );
};

