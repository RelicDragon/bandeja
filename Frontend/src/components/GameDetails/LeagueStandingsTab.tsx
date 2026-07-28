import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components';
import {
  leaguesApi,
  LeagueStanding,
  LeagueGroup,
  LeagueRound,
  type BracketPlayoffGroupDto,
  type BracketPlayoffResponse,
  type LeagueStandingsTieCluster,
} from '@/api/leagues';
import { Loader2 } from 'lucide-react';
import { getLeagueGroupColor, getLeagueGroupSoftColor } from '@/utils/leagueGroupColors';
import { GroupFilterDropdown } from './GroupFilterDropdown';
import { RoundTypeFilterSwitch } from './RoundTypeFilterSwitch';
import { getGroupFilter, setGroupFilter } from '@/utils/groupFilterStorage';
import { setRoundTypeFilter, type RoundTypeFilterValue } from '@/utils/roundTypeFilterStorage';
import {
  findBracketRounds,
  defaultBracketRoundId,
  resolveSelectedBracketRound,
} from '@/utils/leagueBracketRound';
import { BracketRoundPicker } from './BracketRoundPicker';
import { enrichBracketGroups } from '@/utils/leagueBracketEnrich';
import { bracketGroupHasPodium } from '@/utils/leagueBracketOutcome';
import { LeagueBracketPodiumCard } from './LeagueBracketPodiumCard';
import { LeagueBracketStandingsCtaCard } from './LeagueBracketStandingsCtaCard';
import {
  buildBracketViewModel,
  getActiveBracketGroup,
  isCrossGroupBracket,
} from '@/features/leagueBracket';
import { resolveLeagueStandingsColumns } from '@/utils/leagueStandingsColumns';
import { standingsTieClusterAnchorId } from '@/utils/leagueStandingsTieExplain';
import { LeagueStandingsTable } from './LeagueStandingsTable';
import { LeagueStandingsTieBreakSection } from './LeagueStandingsTieBreakSection';
import { LeagueStandingsExplanationsSwitch } from './LeagueStandingsExplanationsSwitch';

const ALL_GROUP_ID = 'ALL';
const NO_GROUP_KEY = 'no-group';

function standingGroupKey(standing: {
  currentGroupId?: string | null;
  currentGroup?: { id: string } | null;
}): string {
  return standing.currentGroupId ?? standing.currentGroup?.id ?? NO_GROUP_KEY;
}

function compareStandingsByPoints(a: LeagueStanding, b: LeagueStanding) {
  if (b.points !== a.points) return b.points - a.points;
  if (b.wins !== a.wins) return b.wins - a.wins;
  if (b.scoreDelta !== a.scoreDelta) return b.scoreDelta - a.scoreDelta;
  return 0;
}

interface LeagueStandingsTabProps {
  leagueSeasonId: string;
  hasFixedTeams: boolean;
  playersPerMatch?: number | null;
  ballsInGames?: boolean;
  /** When true (fixed teams or 1v1), keep API order — do not re-sort by points. */
  preserveApiOrder?: boolean;
}

export const LeagueStandingsTab = ({
  leagueSeasonId,
  hasFixedTeams,
  playersPerMatch = null,
  ballsInGames = false,
  preserveApiOrder = false,
}: LeagueStandingsTabProps) => {
  const { t, i18n } = useTranslation();
  const columns = useMemo(
    () => resolveLeagueStandingsColumns({ hasFixedTeams, playersPerMatch, ballsInGames }),
    [hasFixedTeams, playersPerMatch, ballsInGames]
  );
  const [standings, setStandings] = useState<LeagueStanding[]>([]);
  const [tieClusters, setTieClusters] = useState<LeagueStandingsTieCluster[]>([]);
  const [groups, setGroups] = useState<LeagueGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGroupId, setSelectedGroupId] = useState<string>(ALL_GROUP_ID);
  const [selectedRoundType, setSelectedRoundType] = useState<RoundTypeFilterValue>('REGULAR');
  const [bracketPayload, setBracketPayload] = useState<BracketPlayoffResponse | null>(null);
  const [bracketRounds, setBracketRounds] = useState<LeagueRound[]>([]);
  const [selectedBracketRoundId, setSelectedBracketRoundId] = useState<string | null>(null);
  const [showExplanations, setShowExplanations] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const fetchData = async () => {
      try {
        const [standingsResponse, groupsResponse, roundsResponse] = await Promise.all([
          leaguesApi.getStandings(leagueSeasonId),
          leaguesApi.getGroups(leagueSeasonId).catch(() => ({ data: { groups: [] } })),
          leaguesApi.getRounds(leagueSeasonId).catch(() => ({ data: [] })),
        ]);
        if (cancelled) return;
        setStandings(standingsResponse.data);
        setTieClusters(standingsResponse.meta?.tieClusters ?? []);
        setGroups(groupsResponse.data.groups);
        const rounds = roundsResponse.data ?? [];
        setSelectedRoundType(findBracketRounds(rounds).length > 0 ? 'PLAYOFF' : 'REGULAR');
      } catch (error) {
        if (!cancelled) console.error('Failed to fetch league data:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void fetchData();
    return () => {
      cancelled = true;
    };
  }, [leagueSeasonId]);

  const loadBracketPodium = useCallback(async () => {
    if (selectedRoundType !== 'PLAYOFF') {
      setBracketPayload(null);
      setBracketRounds([]);
      return;
    }
    try {
      const roundsRes = await leaguesApi.getRounds(leagueSeasonId);
      const playoffs = findBracketRounds(roundsRes.data);
      setBracketRounds(playoffs);
      const round = resolveSelectedBracketRound(playoffs, selectedBracketRoundId);
      if (!round) {
        setBracketPayload(null);
        return;
      }
      const bracketRes = await leaguesApi.getBracketPlayoff(leagueSeasonId, { roundId: round.id });
      const games = round.games ?? [];
      setBracketPayload({
        ...bracketRes.data,
        groups: enrichBracketGroups(bracketRes.data.groups, games),
      });
    } catch {
      setBracketPayload(null);
    }
  }, [leagueSeasonId, selectedRoundType, selectedBracketRoundId]);

  useEffect(() => {
    if (bracketRounds.length === 0) {
      setSelectedBracketRoundId(null);
      return;
    }
    setSelectedBracketRoundId((prev) => {
      if (prev && bracketRounds.some((r) => r.id === prev)) return prev;
      return defaultBracketRoundId(bracketRounds);
    });
  }, [bracketRounds]);

  useEffect(() => {
    void loadBracketPodium();
  }, [loadBracketPodium]);

  useEffect(() => {
    let cancelled = false;
    void getGroupFilter(leagueSeasonId).then((savedGroupId) => {
      if (!cancelled && savedGroupId) setSelectedGroupId(savedGroupId);
    });
    return () => {
      cancelled = true;
    };
  }, [leagueSeasonId]);

  useEffect(() => {
    void setGroupFilter(leagueSeasonId, selectedGroupId);
  }, [selectedGroupId, leagueSeasonId]);

  useEffect(() => {
    setRoundTypeFilter(leagueSeasonId, selectedRoundType);
  }, [selectedRoundType, leagueSeasonId]);

  const displayStandings = useMemo(
    () =>
      standings.filter((s) =>
        hasFixedTeams ? s.participantType === 'TEAM' : s.participantType === 'USER'
      ),
    [standings, hasFixedTeams]
  );

  const standingsById = useMemo(() => {
    const map = new Map<string, LeagueStanding>();
    for (const s of displayStandings) map.set(s.id, s);
    return map;
  }, [displayStandings]);

  const tieClustersByGroupId = useMemo(() => {
    if (!preserveApiOrder) return new Map<string, LeagueStandingsTieCluster[]>();
    const map = new Map<string, LeagueStandingsTieCluster[]>();
    for (const cluster of tieClusters) {
      const key = cluster.groupId ?? NO_GROUP_KEY;
      const list = map.get(key);
      if (list) list.push(cluster);
      else map.set(key, [cluster]);
    }
    return map;
  }, [tieClusters, preserveApiOrder]);

  const tieMetaByGroupKey = useMemo(() => {
    const map = new Map<
      string,
      { ids: Set<string>; anchorById: Map<string, string> }
    >();
    for (const [groupKey, clusters] of tieClustersByGroupId) {
      const ids = new Set<string>();
      const anchorById = new Map<string, string>();
      for (const cluster of clusters) {
        const anchor = standingsTieClusterAnchorId(groupKey, cluster.seasonWins);
        for (const row of cluster.rows) {
          ids.add(row.participantId);
          anchorById.set(row.participantId, anchor);
        }
      }
      map.set(groupKey, { ids, anchorById });
    }
    return map;
  }, [tieClustersByGroupId]);

  const orderedGroups = useMemo(() => {
    const byGroup = new Map<string, LeagueStanding[]>();
    for (const standing of displayStandings) {
      const key = standingGroupKey(standing);
      if (key === NO_GROUP_KEY) continue;
      const list = byGroup.get(key);
      if (list) list.push(standing);
      else byGroup.set(key, [standing]);
    }
    return groups.map((group) => {
      const rows = byGroup.get(group.id) ?? [];
      return {
        id: group.id,
        name: group.name || t('gameDetails.group') || 'Group',
        color: group.color,
        standings: preserveApiOrder ? rows : [...rows].sort(compareStandingsByPoints),
      };
    });
  }, [displayStandings, groups, preserveApiOrder, t]);

  const groupIdKey = useMemo(() => groups.map((g) => g.id).join(','), [groups]);

  useEffect(() => {
    if (loading) return;
    if (selectedGroupId === ALL_GROUP_ID) return;
    if (!groupIdKey.split(',').filter(Boolean).includes(selectedGroupId)) {
      setSelectedGroupId(ALL_GROUP_ID);
      void setGroupFilter(leagueSeasonId, ALL_GROUP_ID);
    }
  }, [loading, groupIdKey, selectedGroupId, leagueSeasonId]);

  const ungroupedStandings = useMemo(() => {
    const rows = displayStandings.filter((s) => standingGroupKey(s) === NO_GROUP_KEY);
    return preserveApiOrder ? rows : [...rows].sort(compareStandingsByPoints);
  }, [displayStandings, preserveApiOrder]);

  const filteredGroups = useMemo(
    () =>
      selectedGroupId === ALL_GROUP_ID
        ? orderedGroups
        : orderedGroups.filter((group) => group.id === selectedGroupId),
    [orderedGroups, selectedGroupId]
  );

  const visibleTieClusters = useMemo(() => {
    if (!preserveApiOrder) return [] as LeagueStandingsTieCluster[];
    if (orderedGroups.length === 0) {
      return tieClustersByGroupId.get(NO_GROUP_KEY) ?? [];
    }
    if (selectedGroupId === ALL_GROUP_ID) {
      const all: LeagueStandingsTieCluster[] = [];
      for (const group of orderedGroups) {
        all.push(...(tieClustersByGroupId.get(group.id) ?? []));
      }
      if (ungroupedStandings.length > 0) {
        all.push(...(tieClustersByGroupId.get(NO_GROUP_KEY) ?? []));
      }
      return all;
    }
    return tieClustersByGroupId.get(selectedGroupId) ?? [];
  }, [
    preserveApiOrder,
    orderedGroups,
    selectedGroupId,
    tieClustersByGroupId,
    ungroupedStandings.length,
  ]);

  const showExplanationsSwitch = preserveApiOrder && visibleTieClusters.length > 0;
  const explanationsActive = showExplanationsSwitch && showExplanations;

  useEffect(() => {
    if (!showExplanationsSwitch && showExplanations) {
      setShowExplanations(false);
    }
  }, [showExplanationsSwitch, showExplanations]);

  const crossGroupBracket = isCrossGroupBracket(bracketPayload);
  const seasonBracketGroup = getActiveBracketGroup(bracketPayload);

  const bracketGroupsById = useMemo(() => {
    const map = new Map<string, BracketPlayoffGroupDto>();
    for (const g of bracketPayload?.groups ?? []) {
      if (g.leagueGroupId) map.set(g.leagueGroupId, g);
    }
    return map;
  }, [bracketPayload]);

  const showBracketSection = selectedRoundType === 'PLAYOFF' && bracketPayload != null;

  const anyBracketPodiumVisible = useMemo(() => {
    if (!bracketPayload) return false;
    if (crossGroupBracket && seasonBracketGroup) {
      return bracketGroupHasPodium(seasonBracketGroup);
    }
    return filteredGroups.some(({ id }) => {
      const g = bracketGroupsById.get(id);
      return g ? bracketGroupHasPodium(g) : false;
    });
  }, [bracketPayload, crossGroupBracket, seasonBracketGroup, filteredGroups, bracketGroupsById]);

  const showBracketPodium = showBracketSection && anyBracketPodiumVisible;

  const podiumVmForGroup = useCallback(
    (group: BracketPlayoffGroupDto) =>
      buildBracketViewModel({
        group,
        locale: i18n.language,
        translate: t,
        leagueSeasonId,
        bracketRoundId: selectedBracketRoundId ?? undefined,
        crossGroupBracket,
        options: { showPodium: true, shareMode: true },
      }),
    [i18n.language, t, leagueSeasonId, selectedBracketRoundId, crossGroupBracket]
  );
  const showBracketCta = showBracketSection && !anyBracketPodiumVisible;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin h-8 w-8 text-primary-600" />
      </div>
    );
  }

  if (displayStandings.length === 0) {
    return (
      <Card>
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          {t('gameDetails.noStandings')}
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <RoundTypeFilterSwitch
        value={selectedRoundType}
        regularLabel={t('gameDetails.roundTypeRegular') || 'Regular season'}
        playoffLabel={t('gameDetails.roundTypePlayoff') || 'Play-off'}
        onSelect={setSelectedRoundType}
      />
      {orderedGroups.length > 0 && (
        <GroupFilterDropdown
          selectedGroupId={selectedGroupId}
          groups={orderedGroups.map((g) => ({
            id: g.id,
            name: g.name,
            color: g.color ?? undefined,
          }))}
          allGroupsLabel={t('gameDetails.allGroups') || 'All groups'}
          onSelect={setSelectedGroupId}
          allGroupId={ALL_GROUP_ID}
        />
      )}
      {showBracketCta && (
        <LeagueBracketStandingsCtaCard
          leagueSeasonId={leagueSeasonId}
          bracketRoundId={selectedBracketRoundId ?? undefined}
          bracketScope={bracketPayload?.round.bracketScope}
          crossGroupBracket={crossGroupBracket}
          groupId={
            crossGroupBracket
              ? undefined
              : filteredGroups.find(({ id }) => bracketGroupsById.has(id))?.id
          }
        />
      )}
      {showBracketPodium && bracketRounds.length > 1 && selectedBracketRoundId && (
        <BracketRoundPicker
          rounds={bracketRounds}
          selectedRoundId={selectedBracketRoundId}
          onSelect={setSelectedBracketRoundId}
          layoutIdPrefix={`${leagueSeasonId}-standings`}
        />
      )}
      {showBracketPodium &&
        crossGroupBracket &&
        seasonBracketGroup &&
        (() => {
          const vm = podiumVmForGroup(seasonBracketGroup);
          return (
            <LeagueBracketPodiumCard
              key="podium-season"
              group={seasonBracketGroup}
              rows={vm.podiumRows}
              crossGroupBracket
              fullscreenPath={vm.sharePaths?.fullscreenPath}
            />
          );
        })()}
      {showBracketPodium &&
        !crossGroupBracket &&
        filteredGroups.map(({ id }) => {
          const bracketGroup = bracketGroupsById.get(id);
          if (!bracketGroup) return null;
          const groupMeta = groups.find((g) => g.id === id);
          const vm = podiumVmForGroup(bracketGroup);
          return (
            <LeagueBracketPodiumCard
              key={`podium-${id}`}
              group={bracketGroup}
              rows={vm.podiumRows}
              groupMeta={groupMeta}
              fullscreenPath={vm.sharePaths?.fullscreenPath}
            />
          );
        })}
      {showExplanationsSwitch && (
        <LeagueStandingsExplanationsSwitch
          checked={showExplanations}
          onChange={setShowExplanations}
        />
      )}
      {orderedGroups.length > 0 ? (
        <>
          {filteredGroups.map(({ id, name, color, standings: groupStandings }) => {
            const accent = getLeagueGroupColor(color);
            const soft = getLeagueGroupSoftColor(color, '1A');
            const groupClusters = tieClustersByGroupId.get(id) ?? [];
            const tieMeta = tieMetaByGroupKey.get(id);
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
                      <h3 className="text-sm font-bold" style={{ color: accent }}>
                        {name}
                      </h3>
                    </div>
                  </div>
                )}
                <LeagueStandingsTable
                  rows={groupStandings}
                  hasFixedTeams={hasFixedTeams}
                  columns={columns}
                  tieParticipantIds={explanationsActive ? tieMeta?.ids : undefined}
                  tieAnchorByParticipantId={
                    explanationsActive ? tieMeta?.anchorById : undefined
                  }
                />
                {explanationsActive ? (
                  <LeagueStandingsTieBreakSection
                    groupKey={id}
                    clusters={groupClusters}
                    standingsById={standingsById}
                    hasFixedTeams={hasFixedTeams}
                    columns={columns}
                  />
                ) : null}
              </Card>
            );
          })}
          {selectedGroupId === ALL_GROUP_ID && ungroupedStandings.length > 0 && (
            <Card key={NO_GROUP_KEY}>
              <div className="px-4 py-3 bg-gradient-to-r from-primary-50 to-primary-100/50 dark:from-primary-900/20 dark:to-primary-800/10 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                  {t('gameDetails.noGroup') || 'No Group'}
                </h3>
              </div>
              <LeagueStandingsTable
                rows={ungroupedStandings}
                hasFixedTeams={hasFixedTeams}
                columns={columns}
                tieParticipantIds={
                  explanationsActive
                    ? tieMetaByGroupKey.get(NO_GROUP_KEY)?.ids
                    : undefined
                }
                tieAnchorByParticipantId={
                  explanationsActive
                    ? tieMetaByGroupKey.get(NO_GROUP_KEY)?.anchorById
                    : undefined
                }
              />
              {explanationsActive ? (
                <LeagueStandingsTieBreakSection
                  groupKey={NO_GROUP_KEY}
                  clusters={tieClustersByGroupId.get(NO_GROUP_KEY) ?? []}
                  standingsById={standingsById}
                  hasFixedTeams={hasFixedTeams}
                  columns={columns}
                />
              ) : null}
            </Card>
          )}
        </>
      ) : (
        <Card>
          <LeagueStandingsTable
            rows={
              preserveApiOrder
                ? displayStandings
                : [...displayStandings].sort(compareStandingsByPoints)
            }
            hasFixedTeams={hasFixedTeams}
            columns={columns}
            tieParticipantIds={
              explanationsActive
                ? tieMetaByGroupKey.get(NO_GROUP_KEY)?.ids
                : undefined
            }
            tieAnchorByParticipantId={
              explanationsActive
                ? tieMetaByGroupKey.get(NO_GROUP_KEY)?.anchorById
                : undefined
            }
          />
          {explanationsActive ? (
            <LeagueStandingsTieBreakSection
              groupKey={NO_GROUP_KEY}
              clusters={tieClustersByGroupId.get(NO_GROUP_KEY) ?? tieClusters}
              standingsById={standingsById}
              hasFixedTeams={hasFixedTeams}
              columns={columns}
            />
          ) : null}
        </Card>
      )}
    </div>
  );
};
