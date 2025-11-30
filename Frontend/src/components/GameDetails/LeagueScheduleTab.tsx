import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Card, ConfirmationModal } from '@/components';
import { EditLeagueGameTeamsModal } from './EditLeagueGameTeamsModal';
import { GroupCreationModal } from './GroupCreationModal';
import { LeagueGroupEditorModal } from './LeagueGroupEditorModal';
import { GroupFilterDropdown } from './GroupFilterDropdown';
import { leaguesApi, LeagueRound, LeagueGroup } from '@/api/leagues';
import { Loader2, Calendar, Users } from 'lucide-react';
import { Game } from '@/types';
import { LeagueRoundAccordion } from './LeagueRoundAccordion';

interface LeagueScheduleTabProps {
  leagueSeasonId: string;
  canEdit?: boolean;
  hasFixedTeams?: boolean;
}

const ALL_GROUP_ID = 'ALL';
const GROUP_FILTER_STORAGE_PREFIX = 'group_filter_league_season_';

export const LeagueScheduleTab = ({ leagueSeasonId, canEdit = false, hasFixedTeams = false }: LeagueScheduleTabProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [rounds, setRounds] = useState<LeagueRound[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isCreatingGame, setIsCreatingGame] = useState(false);
  const [isCreatingGroups, setIsCreatingGroups] = useState(false);
  const [editingGame, setEditingGame] = useState<Game | null>(null);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);
  const [hasGroups, setHasGroups] = useState(false);
  const [showGroupEditor, setShowGroupEditor] = useState(false);
  const [groups, setGroups] = useState<LeagueGroup[]>([]);
  const [roundPendingDeletion, setRoundPendingDeletion] = useState<LeagueRound | null>(null);
  const [roundIdBeingDeleted, setRoundIdBeingDeleted] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [expandedRoundId, setExpandedRoundId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string>(ALL_GROUP_ID);
  const [groupsInitialized, setGroupsInitialized] = useState(false);
  const [loadedRoundIds, setLoadedRoundIds] = useState<Set<string>>(new Set());
  const canManageGroups = canEdit && hasGroups;
  const canAddRound = canEdit && (rounds.length > 0 || (hasGroups && participantCount > 0));
  const storageKey = `${GROUP_FILTER_STORAGE_PREFIX}${leagueSeasonId}`;

  const fetchRounds = useCallback(async () => {
    try {
      const response = await leaguesApi.getRounds(leagueSeasonId);
      setRounds(response.data);
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
      setParticipantCount(standingsResponse.data.length);
      const hasGroupsValue = standingsResponse.data.some((standing) => Boolean(standing.currentGroupId));
      setHasGroups(hasGroupsValue);
      
      if (hasGroupsValue) {
        try {
          const groupsResponse = await leaguesApi.getGroups(leagueSeasonId);
          setGroups(groupsResponse.data.groups);
          setGroupsInitialized(true);
        } catch (error) {
          console.error('Failed to fetch groups:', error);
          setGroups([]);
          setGroupsInitialized(true);
        }
      } else {
        setGroups([]);
        setGroupsInitialized(true);
      }
    } catch (error) {
      console.error('Failed to fetch league rounds:', error);
    } finally {
      setLoading(false);
    }
  }, [leagueSeasonId]);

  useEffect(() => {
    fetchRounds();
  }, [fetchRounds]);

  useEffect(() => {
    setIsClient(true);
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

  useEffect(() => {
    if (!groupsInitialized) return;
    if (selectedGroupId !== ALL_GROUP_ID && !groups.some((group) => group.id === selectedGroupId)) {
      setSelectedGroupId(ALL_GROUP_ID);
      if (typeof window !== 'undefined') {
        localStorage.setItem(storageKey, ALL_GROUP_ID);
      }
    }
  }, [groupsInitialized, groups, selectedGroupId, storageKey]);

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
    navigate(`/games/${game.id}`);
  };

  const handleGameUpdate = async () => {
    await fetchRounds();
    setEditingGame(null);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin h-8 w-8 text-primary-600" />
      </div>
    );
  }

  const displayedGroups = selectedGroupId === ALL_GROUP_ID ? groups : groups.filter((group) => group.id === selectedGroupId);

  return (
    <div className="space-y-6">
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
      {groups.length > 0 && (
        <GroupFilterDropdown
          selectedGroupId={selectedGroupId}
          groups={groups.map((g) => ({ id: g.id, name: g.name, color: g.color ?? undefined }))}
          allGroupsLabel={t('gameDetails.allGroups') || 'All groups'}
          onSelect={setSelectedGroupId}
          allGroupId={ALL_GROUP_ID}
        />
      )}
      {rounds.length === 0 ? (
        <Card>
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            {t('gameDetails.noRounds')}
          </div>
        </Card>
      ) : (
        <div className="space-y-0">
          {rounds.map((round, roundIndex) => {
            const isLastRound = roundIndex === rounds.length - 1;
            const showAddGameButton = canEdit && isLastRound;
            const canDeleteRound =
              canEdit &&
              isLastRound &&
              (round.games.length === 0 || round.games.every((game) => game.resultsStatus === 'NONE'));
            const canEditGames = canEdit && isLastRound;
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
                selectedGroupId={selectedGroupId === ALL_GROUP_ID ? null : selectedGroupId}
                shouldRenderContent={shouldRenderContent}
                onToggle={handleToggle}
                onRequestDelete={() => setRoundPendingDeletion(round)}
                onAddGame={(groupId) => handleCreateGame(round.id, groupId)}
                onEditGame={handleEditGame}
                onOpenGame={handleOpenGame}
                t={t}
              />
            );
          })}
        </div>
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
      {isClient && roundPendingDeletion &&
        createPortal(
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
          />,
          document.body
        )}
    </div>
  );
};

