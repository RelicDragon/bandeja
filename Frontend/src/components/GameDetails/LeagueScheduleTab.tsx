import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Card, ConfirmationModal, SegmentedSwitch, type SegmentedSwitchTab } from '@/components';
import { LeaguePlannerTab } from './LeaguePlannerTab';
import { EditLeagueGameTeamsModal } from './EditLeagueGameTeamsModal';
import { GroupCreationModal } from './GroupCreationModal';
import { LeagueGroupEditorModal } from './LeagueGroupEditorModal';
import { PlayoffConfigurationModal } from './PlayoffConfigurationModal';
import { GroupFilterDropdown } from './GroupFilterDropdown';
import { RoundTypeFilterSwitch } from './RoundTypeFilterSwitch';
import { LeagueFixtureMatrix } from './LeagueFixtureMatrix';
import { LeagueFixtureDetailSheet } from './LeagueFixtureDetailSheet';
import { leaguesApi, LeagueRound, LeagueGroup, LeagueStanding } from '@/api/leagues';
import { Loader2, Calendar, Users, Trophy, LayoutGrid } from 'lucide-react';
import { useNavigationStore } from '@/store/navigationStore';
import { standingsTeamsForGroup, roundsInSingleRoundRobinCycle } from '@/utils/leagueFixtureMatrix';
import { Game } from '@/types';
import { LeagueRoundAccordion } from './LeagueRoundAccordion';
import { getGroupFilter, setGroupFilter } from '@/utils/groupFilterStorage';
import { setRoundTypeFilter, type RoundTypeFilterValue } from '@/utils/roundTypeFilterStorage';

interface LeagueScheduleTabProps {
  leagueSeasonId: string;
  canEdit?: boolean;
  hasFixedTeams?: boolean;
  activeTab?: 'general' | 'schedule' | 'standings' | 'faq';
  selectedGameChatId?: string | null;
  onChatGameSelect?: (gameId: string) => void;
}

const ALL_GROUP_ID = 'ALL';

function getScheduleSubView(search: string): 'fixtures' | 'planner' {
  const v = new URLSearchParams(search).get('scheduleView');
  return v === 'planner' ? 'planner' : 'fixtures';
}

export const LeagueScheduleTab = ({ leagueSeasonId, canEdit = false, hasFixedTeams = false, activeTab = 'schedule', selectedGameChatId, onChatGameSelect }: LeagueScheduleTabProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const scheduleSubView = useMemo(() => getScheduleSubView(location.search), [location.search]);

  const setScheduleSubView = useCallback(
    (id: 'fixtures' | 'planner') => {
      const sp = new URLSearchParams(location.search);
      sp.set('tab', 'schedule');
      if (id === 'planner') sp.set('scheduleView', 'planner');
      else sp.delete('scheduleView');
      navigate({ pathname: location.pathname, search: sp.toString() }, { replace: true });
    },
    [location.pathname, location.search, navigate]
  );

  const scheduleSubTabs = useMemo<SegmentedSwitchTab[]>(
    () => [
      { id: 'fixtures', label: t('gameDetails.scheduleSubtabRounds') },
      { id: 'planner', label: t('gameDetails.plannerTab') },
    ],
    [t]
  );

  const scheduleSubtabBar = useMemo(
    () => (
      <SegmentedSwitch
        tabs={scheduleSubTabs}
        activeId={scheduleSubView}
        onChange={(id) => setScheduleSubView(id as 'fixtures' | 'planner')}
        showOnlyActiveTabText={false}
        layoutId={`leagueScheduleSub-${leagueSeasonId}`}
      />
    ),
    [leagueSeasonId, scheduleSubTabs, scheduleSubView, setScheduleSubView]
  );
  const leagueSeasonTableViewOverride = useNavigationStore((s) => s.leagueSeasonTableViewOverride);
  const setLeagueSeasonFixtureTableEligible = useNavigationStore((s) => s.setLeagueSeasonFixtureTableEligible);
  const effectiveFixtureTableView = leagueSeasonTableViewOverride === true;
  const [rounds, setRounds] = useState<LeagueRound[]>([]);
  const [standings, setStandings] = useState<LeagueStanding[]>([]);
  const [sheetGames, setSheetGames] = useState<Game[] | null>(null);
  const [isCreatingFullRr, setIsCreatingFullRr] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isCreatingGame, setIsCreatingGame] = useState(false);
  const [isCreatingGroups, setIsCreatingGroups] = useState(false);
  const [editingGame, setEditingGame] = useState<Game | null>(null);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);
  const [hasGroups, setHasGroups] = useState(false);
  const [showGroupEditor, setShowGroupEditor] = useState(false);
  const [showPlayoffModal, setShowPlayoffModal] = useState(false);
  const [groups, setGroups] = useState<LeagueGroup[]>([]);
  const [roundPendingDeletion, setRoundPendingDeletion] = useState<LeagueRound | null>(null);
  const [roundIdBeingDeleted, setRoundIdBeingDeleted] = useState<string | null>(null);
  const [roundIdSendingMessage, setRoundIdSendingMessage] = useState<string | null>(null);
  const [roundPendingStartMessage, setRoundPendingStartMessage] = useState<LeagueRound | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [expandedRoundId, setExpandedRoundId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string>(ALL_GROUP_ID);
  const [selectedRoundType, setSelectedRoundType] = useState<RoundTypeFilterValue>('REGULAR');
  const [groupsInitialized, setGroupsInitialized] = useState(false);
  const [loadedRoundIds, setLoadedRoundIds] = useState<Set<string>>(new Set());
  const canManageGroups = canEdit && hasGroups;
  const canAddRound = canEdit && (rounds.length > 0 || (hasGroups && participantCount > 0));

  const fetchRounds = useCallback(async () => {
    try {
      const response = await leaguesApi.getRounds(leagueSeasonId);
      setRounds(response.data);
      setSelectedRoundType(
        response.data.some((r) => (r.roundType ?? 'REGULAR') === 'PLAYOFF') ? 'PLAYOFF' : 'REGULAR'
      );
      const lastRoundId = response.data[response.data.length - 1]?.id;
      
      setExpandedRoundId((prev) => {
        if (response.data.some((round) => round.id === prev)) {
          return prev;
        }
        return lastRoundId ?? null;
      });
      
      if (lastRoundId) {
        setLoadedRoundIds((prev) => new Set([...prev, lastRoundId]));
      }
      
      const standingsResponse = await leaguesApi.getStandings(leagueSeasonId);
      setStandings(standingsResponse.data);
      setParticipantCount(standingsResponse.data.length);

      try {
        const groupsResponse = await leaguesApi.getGroups(leagueSeasonId);
        const fetchedGroups = groupsResponse.data.groups;
        setGroups(fetchedGroups);
        setHasGroups(fetchedGroups.length > 0);
        setGroupsInitialized(true);
      } catch (error) {
        console.error('Failed to fetch groups:', error);
        setGroups([]);
        setHasGroups(false);
        setGroupsInitialized(true);
      }
    } catch (error) {
      console.error('Failed to fetch league rounds:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [leagueSeasonId]);

  useEffect(() => {
    fetchRounds().catch((error) => {
      console.error('Failed to fetch rounds on initial load:', error);
    });
  }, [fetchRounds]);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    const loadSavedFilter = async () => {
      const savedGroupId = await getGroupFilter(leagueSeasonId);
      if (savedGroupId) setSelectedGroupId(savedGroupId);
    };
    loadSavedFilter();
  }, [leagueSeasonId]);

  useEffect(() => {
    setGroupFilter(leagueSeasonId, selectedGroupId);
  }, [selectedGroupId, leagueSeasonId]);

  useEffect(() => {
    setRoundTypeFilter(leagueSeasonId, selectedRoundType);
  }, [selectedRoundType, leagueSeasonId]);

  const fixtureTableReadiness = useMemo(() => {
    if (!hasFixedTeams || groups.length === 0 || standings.length === 0) {
      return { allGroupsValidTeams: false, sameTeamCountAcrossGroups: false };
    }
    const counts: number[] = [];
    for (const g of groups) {
      const inGroup = standings.filter((s) => s.currentGroupId === g.id);
      if (inGroup.length < 2) return { allGroupsValidTeams: false, sameTeamCountAcrossGroups: false };
      const allValid = inGroup.every((s) => {
        if (s.participantType !== 'TEAM') return false;
        const ids = (s.leagueTeam?.players ?? [])
          .map((p) => p.userId)
          .filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
        return ids.length === 2;
      });
      if (!allValid) return { allGroupsValidTeams: false, sameTeamCountAcrossGroups: false };
      counts.push(inGroup.length);
    }
    const sameTeamCountAcrossGroups = counts.length > 0 && counts.every((c) => c === counts[0]);
    return { allGroupsValidTeams: true, sameTeamCountAcrossGroups };
  }, [hasFixedTeams, groups, standings]);

  const fixtureTableEligible =
    fixtureTableReadiness.allGroupsValidTeams && fixtureTableReadiness.sameTeamCountAcrossGroups;

  useEffect(() => {
    const on = activeTab === 'schedule' && scheduleSubView === 'fixtures' && fixtureTableEligible;
    setLeagueSeasonFixtureTableEligible(on);
  }, [activeTab, scheduleSubView, fixtureTableEligible, setLeagueSeasonFixtureTableEligible]);

  const fullRrBlockReason = useMemo(() => {
    if (!hasFixedTeams) return 'requiresFixed' as const;
    if (groups.length === 0) return 'noGroups' as const;
    if (!fixtureTableReadiness.allGroupsValidTeams) return 'teams' as const;
    if (!fixtureTableReadiness.sameTeamCountAcrossGroups) return 'mixedSizes' as const;
    const hasAnyRegularRound = rounds.some((r) => (r.roundType ?? 'REGULAR') === 'REGULAR');
    if (hasAnyRegularRound) return 'existing' as const;
    return null;
  }, [hasFixedTeams, groups.length, fixtureTableReadiness, rounds]);

  const matrixGroupId = selectedGroupId === ALL_GROUP_ID ? groups[0]?.id : selectedGroupId;
  const matrixGroupName = groups.find((g) => g.id === matrixGroupId)?.name ?? '';

  useEffect(() => {
    if (!groupsInitialized) return;
    if (selectedGroupId !== ALL_GROUP_ID && !groups.some((group) => group.id === selectedGroupId)) {
      setSelectedGroupId(ALL_GROUP_ID);
      setGroupFilter(leagueSeasonId, ALL_GROUP_ID);
    }
  }, [groupsInitialized, groups, selectedGroupId, leagueSeasonId]);

  const handleCreateRound = async () => {
    if (isCreating) return;
    
    setIsCreating(true);
    try {
      await leaguesApi.createRound(leagueSeasonId, 'TEAM_FOR_ROUND');
      toast.success(t('gameDetails.roundCreated'));
      await fetchRounds();
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateFullRoundRobin = async () => {
    if (isCreatingFullRr || fullRrBlockReason) return;
    setIsCreatingFullRr(true);
    try {
      const res = await leaguesApi.createFullRoundRobin(leagueSeasonId);
      const n = res.data.roundsCreated ?? 0;
      toast.success(t('gameDetails.fixtureFullRrCreated', { count: n }));
      await fetchRounds();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      const errorMessage = err.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    } finally {
      setIsCreatingFullRr(false);
    }
  };

  const handleCreateGame = async (roundId: string, leagueGroupId?: string) => {
    if (isCreatingGame) return;
    
    setIsCreatingGame(true);
    try {
      await leaguesApi.createGameForRound(roundId, leagueGroupId);
      toast.success(t('gameDetails.gameCreated'));
      await fetchRounds();
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    } finally {
      setIsCreatingGame(false);
    }
  };

  const handleEditGame = (game: Game) => {
    setEditingGame(game);
  };

  const handleOpenGame = (game: Game) => {
    const sp = new URLSearchParams();
    sp.set('tab', 'schedule');
    if (scheduleSubView === 'planner') sp.set('scheduleView', 'planner');
    navigate(`/games/${leagueSeasonId}?${sp.toString()}`, { replace: true });
    navigate(`/games/${game.id}`);
  };

  const handleGameUpdate = async () => {
    setEditingGame(null);
    try {
      await fetchRounds();
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    }
  };

  const handleDeleteGame = async () => {
    try {
      await fetchRounds();
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    }
  };

  const handleOpenGroupModal = async () => {
    setIsCreatingGroups(true);
    try {
      const response = await leaguesApi.syncParticipants(leagueSeasonId);
      setParticipantCount(response.data.length);
      setShowGroupModal(true);
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    } finally {
      setIsCreatingGroups(false);
    }
  };

  const handleCreateGroups = async (numberOfGroups: number) => {
    setIsCreatingGroups(true);
    try {
      await leaguesApi.createGroups(leagueSeasonId, numberOfGroups);
      toast.success(t('gameDetails.groupsCreated'));
      setHasGroups(true);
      await fetchRounds();
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    } finally {
      setIsCreatingGroups(false);
    }
  };

  const handleDeleteRound = async (leagueRoundId: string) => {
    setRoundIdBeingDeleted(leagueRoundId);
    try {
      await leaguesApi.deleteRound(leagueRoundId);
      toast.success(t('gameDetails.roundDeleted'));
      await fetchRounds();
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    } finally {
      setRoundIdBeingDeleted(null);
      setRoundPendingDeletion(null);
    }
  };

  const handleSendStartMessage = async (leagueRoundId: string) => {
    const round = rounds.find((r) => r.id === leagueRoundId);
    if (round) {
      setRoundPendingStartMessage(round);
    }
  };

  const confirmSendStartMessage = async () => {
    if (!roundPendingStartMessage) return;
    
    const leagueRoundId = roundPendingStartMessage.id;
    try {
      setRoundIdSendingMessage(leagueRoundId);
      const response = await leaguesApi.sendRoundStartMessage(leagueRoundId);
      toast.success(t('gameDetails.startMessageSent', { count: response.data.notifiedUsers }));
      await fetchRounds();
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    } finally {
      setRoundIdSendingMessage(null);
      setRoundPendingStartMessage(null);
    }
  };

  if (loading) {
    if (scheduleSubView === 'planner') {
      return (
        <div className="space-y-6">
          {scheduleSubtabBar}
          <LeaguePlannerTab leagueSeasonId={leagueSeasonId} hasFixedTeams={hasFixedTeams} isVisible />
        </div>
      );
    }
    return (
      <div className="space-y-6">
        {scheduleSubtabBar}
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
        </div>
      </div>
    );
  }

  const displayedGroups = selectedGroupId === ALL_GROUP_ID ? groups : groups.filter((group) => group.id === selectedGroupId);
  const filteredRounds = rounds.filter((r) => (r.roundType ?? 'REGULAR') === selectedRoundType);
  const firstGroupTeamCount = groups[0] ? standingsTeamsForGroup(groups[0].id, standings).length : 0;
  const fullRrRoundCount = roundsInSingleRoundRobinCycle(firstGroupTeamCount);
  const showMatrix =
    effectiveFixtureTableView && hasFixedTeams && fixtureTableEligible && selectedRoundType === 'REGULAR';
  const matrixTeams = matrixGroupId ? standingsTeamsForGroup(matrixGroupId, standings) : [];

  const fullRrHintKey =
    fullRrBlockReason === 'noGroups'
      ? 'gameDetails.fixtureFullRrDisabledNoGroups'
      : fullRrBlockReason === 'teams'
        ? 'gameDetails.fixtureFullRrDisabledTeams'
        : fullRrBlockReason === 'mixedSizes'
          ? 'gameDetails.fixtureFullRrDisabledMixedSizes'
          : fullRrBlockReason === 'existing'
            ? 'gameDetails.fixtureFullRrDisabledExisting'
            : null;

  return (
    <div className="space-y-6">
      {scheduleSubtabBar}

      {scheduleSubView === 'planner' ? (
        <LeaguePlannerTab leagueSeasonId={leagueSeasonId} hasFixedTeams={hasFixedTeams} isVisible />
      ) : (
        <>
      {canEdit && rounds.length === 0 && !hasGroups && (
        <Card className="bg-gradient-to-r from-primary-50 to-primary-100/50 dark:from-primary-900/20 dark:to-primary-800/10 border-primary-200 dark:border-primary-800">
          <button
            onClick={handleOpenGroupModal}
            disabled={isCreatingGroups}
            className="w-full group relative overflow-hidden rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold py-4 px-6 transition-all duration-300 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
            {isCreatingGroups ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                <span>{t('gameDetails.syncingParticipants')}</span>
              </>
            ) : (
              <>
                <Users size={20} className="relative z-10" />
                <span className="relative z-10">{t('gameDetails.createGroups')}</span>
              </>
            )}
          </button>
        </Card>
      )}
      {(canManageGroups || canAddRound) && (
        <Card className="bg-gradient-to-r from-primary-50 to-primary-100/50 dark:from-primary-900/20 dark:to-primary-800/10 border-primary-200 dark:border-primary-800">
          <div className="flex flex-col gap-3 md:flex-row">
            {canManageGroups && (
              <button
                onClick={() => setShowGroupEditor(true)}
                className="flex-1 group relative overflow-hidden rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold py-4 px-6 transition-all duration-300 shadow-lg hover:shadow-xl flex items-center justify-center gap-3"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                <Users size={20} className="relative z-10" />
                <span className="relative z-10">{t('gameDetails.manageGroups')}</span>
              </button>
            )}
            {canAddRound && (
              <button
                onClick={handleCreateRound}
                disabled={isCreating}
                className="flex-1 group relative overflow-hidden rounded-lg bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white font-semibold py-4 px-6 transition-all duration-300 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                {isCreating ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    <span>{t('common.loading')}</span>
                  </>
                ) : (
                  <>
                    <Calendar size={20} className="relative z-10" />
                    <span className="relative z-10">{t('gameDetails.createRound')}</span>
                  </>
                )}
              </button>
            )}
          </div>
        </Card>
      )}
      {canEdit && hasFixedTeams && groups.length > 0 && (
        <Card className="border border-teal-200/80 bg-gradient-to-br from-teal-50/95 to-cyan-50/60 dark:border-teal-900/40 dark:from-teal-950/40 dark:to-cyan-950/25">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <h3 className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
                <LayoutGrid className="h-5 w-5 shrink-0 text-teal-600 dark:text-teal-400" />
                <span>{t('gameDetails.fixtureCreateFullRr')}</span>
              </h3>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                {t('gameDetails.fixtureCreateFullRrSubtitle', { count: fullRrRoundCount })}
              </p>
              {fullRrHintKey && (
                <p className="mt-2 text-xs text-amber-800 dark:text-amber-200/90">{t(fullRrHintKey)}</p>
              )}
            </div>
            <button
              type="button"
              onClick={handleCreateFullRoundRobin}
              disabled={Boolean(fullRrBlockReason) || isCreatingFullRr}
              className="shrink-0 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:from-teal-700 hover:to-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isCreatingFullRr ? <Loader2 className="h-5 w-5 animate-spin" /> : t('gameDetails.fixtureCreateFullRr')}
            </button>
          </div>
        </Card>
      )}
      <RoundTypeFilterSwitch
        value={selectedRoundType}
        regularLabel={t('gameDetails.roundTypeRegular') || 'Regular season'}
        playoffLabel={t('gameDetails.roundTypePlayoff') || 'Play-off'}
        onSelect={setSelectedRoundType}
      />
      {effectiveFixtureTableView && hasFixedTeams && fixtureTableEligible && selectedRoundType === 'PLAYOFF' && (
        <p className="rounded-lg border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          {t('gameDetails.fixtureTableModeRegularOnly')}
        </p>
      )}
      {groups.length > 0 && (
        <GroupFilterDropdown
          selectedGroupId={selectedGroupId}
          groups={groups.map((g) => ({ id: g.id, name: g.name, color: g.color ?? undefined }))}
          allGroupsLabel={t('gameDetails.allGroups') || 'All groups'}
          onSelect={setSelectedGroupId}
          allGroupId={ALL_GROUP_ID}
        />
      )}
      {showMatrix && matrixGroupId ? (
        <div className="space-y-2">
          {selectedGroupId === ALL_GROUP_ID && groups.length > 1 && (
            <p className="rounded-lg border border-gray-200/80 bg-gray-50/90 px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-200">
              {t('gameDetails.fixtureMatrixAllGroupsNote', { groupName: matrixGroupName })}
            </p>
          )}
          <LeagueFixtureMatrix
            groupId={matrixGroupId}
            groupName={matrixGroupName}
            teams={matrixTeams}
            rounds={rounds}
            onOpenGames={(g) => setSheetGames(g)}
          />
        </div>
      ) : filteredRounds.length === 0 ? (
        <Card>
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            {selectedRoundType === 'PLAYOFF' ? t('gameDetails.noPlayoffRounds', { defaultValue: 'No playoff rounds yet.' }) : t('gameDetails.noRounds')}
            {canEdit && selectedRoundType === 'PLAYOFF' && (
              <button
                type="button"
                onClick={() => setShowPlayoffModal(true)}
                className="mt-4 w-full max-w-xs mx-auto group relative overflow-hidden rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-semibold py-3 px-4 transition-all duration-300 shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
              >
                <Trophy size={18} className="relative z-10" />
                <span className="relative z-10">{t('gameDetails.createPlayoff', { defaultValue: 'Create Playoff' })}</span>
              </button>
            )}
          </div>
        </Card>
      ) : (
        <div className="space-y-0">
          {filteredRounds.map((round, roundIndex) => {
            const isLastRound = roundIndex === filteredRounds.length - 1;
            const showAddGameButton = canEdit && isLastRound;
            const canDeleteRound =
              canEdit &&
              isLastRound &&
              (round.games.length === 0 || round.games.every((game) => game.resultsStatus === 'NONE'));
            const canEditGames = canEdit && round.games.some((game) => game.resultsStatus === 'NONE');
            const isExpanded = expandedRoundId === round.id;
            const shouldRenderContent = loadedRoundIds.has(round.id);
            
            const handleToggle = () => {
              const willExpand = expandedRoundId !== round.id;
              setExpandedRoundId((prev) => (prev === round.id ? null : round.id));
              if (willExpand) {
                setLoadedRoundIds((prev) => new Set([...prev, round.id]));
              }
            };
            
            return (
              <LeagueRoundAccordion
                key={round.id}
                round={round}
                groups={displayedGroups}
                canEdit={canEdit}
                canEditGames={canEditGames}
                canDeleteRound={canDeleteRound}
                showAddGameButton={showAddGameButton}
                isExpanded={isExpanded}
                isCreatingGame={isCreatingGame}
                roundIdBeingDeleted={roundIdBeingDeleted}
                roundIdSendingMessage={roundIdSendingMessage}
                selectedGroupId={selectedGroupId === ALL_GROUP_ID ? null : selectedGroupId}
                shouldRenderContent={shouldRenderContent}
                onToggle={handleToggle}
                onRequestDelete={() => setRoundPendingDeletion(round)}
                onAddGame={(groupId) => handleCreateGame(round.id, groupId)}
                onEditGame={handleEditGame}
                onOpenGame={handleOpenGame}
                onDeleteGame={handleDeleteGame}
                onSendStartMessage={() => handleSendStartMessage(round.id)}
                onNoteSaved={fetchRounds}
                selectedGameChatId={selectedGameChatId}
                onChatGameSelect={onChatGameSelect}
                t={t}
              />
            );
          })}
        </div>
      )}
        </>
      )}

      {editingGame && (
        <EditLeagueGameTeamsModal
          isOpen={!!editingGame}
          game={editingGame}
          leagueSeasonId={leagueSeasonId}
          hasFixedTeams={hasFixedTeams}
          onClose={() => setEditingGame(null)}
          onUpdate={handleGameUpdate}
        />
      )}

      {showGroupModal && (
        <GroupCreationModal
          isOpen={showGroupModal}
          participantCount={participantCount}
          onSelect={handleCreateGroups}
          onClose={() => setShowGroupModal(false)}
        />
      )}
      {showGroupEditor && (
        <LeagueGroupEditorModal
          isOpen={showGroupEditor}
          leagueSeasonId={leagueSeasonId}
          onClose={() => setShowGroupEditor(false)}
          onUpdated={fetchRounds}
        />
      )}
      {showPlayoffModal && (
        <PlayoffConfigurationModal
          isOpen={showPlayoffModal}
          onClose={() => setShowPlayoffModal(false)}
          leagueSeasonId={leagueSeasonId}
          hasFixedTeams={hasFixedTeams ?? false}
          onCreated={fetchRounds}
        />
      )}
      {isClient && roundPendingDeletion && (
        <ConfirmationModal
          isOpen={!!roundPendingDeletion}
          title={t('gameDetails.deleteRound')}
          message={t('gameDetails.deleteRoundConfirmation')}
          highlightedText={`${t('gameDetails.round')} ${roundPendingDeletion.orderIndex + 1}`}
          confirmText={t('common.delete')}
          cancelText={t('common.cancel')}
          confirmVariant="danger"
          onConfirm={() => handleDeleteRound(roundPendingDeletion.id)}
          onClose={() => setRoundPendingDeletion(null)}
        />
      )}
      {isClient && roundPendingStartMessage && (
        <ConfirmationModal
          isOpen={!!roundPendingStartMessage}
          title={t('gameDetails.sendStartMessage')}
          message={t('gameDetails.sendStartMessageConfirmation')}
          highlightedText={`${t('gameDetails.round')} ${roundPendingStartMessage.orderIndex + 1}`}
          confirmText={t('gameDetails.sendStartMessage')}
          cancelText={t('common.cancel')}
          confirmVariant="primary"
          onConfirm={confirmSendStartMessage}
          onClose={() => setRoundPendingStartMessage(null)}
        />
      )}
      {sheetGames && sheetGames.length > 0 && (
        <LeagueFixtureDetailSheet games={sheetGames} onClose={() => setSheetGames(null)} />
      )}
    </div>
  );
};

