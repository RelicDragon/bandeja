import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Trash2, LogOut, Copy, HelpCircle, ChevronRight, Trophy, LayoutDashboard, CalendarDays, LayoutGrid } from 'lucide-react';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useDeclineInvite } from '@/hooks/useDeclineInvite';
import { RefreshIndicator } from '@/components/RefreshIndicator';
import { clearCachesExceptUnsyncedResults } from '@/utils/cacheUtils';
import { runWithProfileName } from '@/utils/runWithProfileName';
import { buildDuplicateGameInitialData } from '@/utils/buildDuplicateGameInitialData';
import {
  Card,
  PlayerListModal,
  ManageUsersModal,
  CourtModal,
  ClubModal,
  GameInfo,
  GameParticipants,
  GameSettings,
  MultipleCourtsSelector,
  LeagueScheduleTab,
  LeaguePlannerTab,
  LeagueStandingsTab,
  ConfirmationModal,
  SegmentedSwitch,
  type SegmentedSwitchTab,
} from '@/components';
import { GameCancelled } from '@/components/GameDetails/GameCancelled';
import { GameDetailsSkeleton } from '@/components/GameDetails/GameDetailsSkeleton';
import { GameActionCard } from '@/components/GameDetails/GameActionCard';
import { PhotosSection } from '@/components/GameDetails/PhotosSection';
import { BarParticipantsList } from '@/components/GameDetails/BarParticipantsList';
import { LeaveGameConfirmationModal } from '@/components/LeaveGameConfirmationModal';
import { LeagueFixedTeamsSection } from '@/components/GameDetails/LeagueFixedTeamsSection';
import { FixedTeamsManagement } from '@/components/GameDetails/FixedTeamsManagement';
import { GameFormatSection } from '@/components/GameDetails/GameFormatSection';
import { fixedTeamsManagementVisible } from '@/components/gameFormat/gameFormatTeamsVisibility';
import { LeagueSeasonPointsSection } from '@/components/GameDetails/LeagueSeasonPointsSection';
import { FaqTab } from '@/components/GameDetails/FaqTab';
import { FaqEdit } from '@/components/GameDetails/FaqEdit';
import { EditMaxParticipantsModal } from '@/components/EditMaxParticipantsModal';
import { EditGameInfoModal, type EditGameInfoInitialTabId } from '@/components/GameDetails/EditGameInfoModal';
import { GameResultsEntryEmbedded } from '@/components/GameDetails/GameResultsEntryEmbedded';
import { ResultsTableView } from '@/components/gameResults/ResultsTableView';
import { HorizontalScoreEntryModal, RoundAddedModal } from '@/components/gameResults';
import { SetResultModal } from '@/components/SetResultModal';
import { useIsLandscape } from '@/hooks/useIsLandscape';
import { TrainingResultsSection } from '@/components/GameDetails/TrainingResultsSection';
import { PublicGamePrompt } from '@/components/GameDetails/PublicGamePrompt';
import { BetSection } from '@/components/GameDetails/BetSection';
import { GameLinkedBookingsSection } from '@/components/GameDetails/GameLinkedBookingsSection';
import { gamesApi, invitesApi, courtsApi, clubsApi, normalizeGameFromApi } from '@/api';
import { favoritesApi } from '@/api/favorites';
import { resultsApi } from '@/api/results';
import { trainingApi } from '@/api/training';
import { faqApi } from '@/api/faq';
import { useAuthStore } from '@/store/authStore';
import { useShellNavStore } from '@/store/shellNavStore';
import { useGameDetailsChromeStore } from '@/components/GameDetails/gameDetailsChromeStore';
import { useHeaderStore } from '@/store/headerStore';
import { useSocketEventsStore } from '@/store/socketEventsStore';
import { Game, Invite, Court, Club, GenderTeam } from '@/types';
import { parseGameSport } from '@/utils/gameSport';
import { playersPerMatchOf } from '@/utils/matchFormat';
import { getViewerPrimarySport, shouldShowGameCardSportGlyph } from '@/utils/findSportFilter';
import { SportLevelProvider } from '@/contexts/SportLevelContext';
import { Round } from '@/types/gameResults';
import { shouldShowRoundAddedModal } from '@/utils/fivePlayerMatchCombinations';
import {
  isUserGameAdminOrOwner,
  canUserEditResults,
  canUserEditGameFormat,
  canViewTournamentTableByAccess,
} from '@/utils/gameResults';
import { isParticipantPlaying } from '@/utils/participantStatus';
import { BasicUser } from '@/types';
import { createPortal } from 'react-dom';
import { getGameParticipationState } from '@/utils/gameParticipationState';
import { mergeGameWithInviteDeletedPayload, isPendingGameInvite } from '@/utils/gameInviteParticipant';
import { socketService } from '@/services/socketService';
import { GameResultsEngine, useGameResultsStore } from '@/services/gameResultsEngine';
import { shouldSyncEngineGameFromShell } from '@/utils/mergeGameFormatForResults';
import {
  mergeGameResultsArtifactsFields,
  shouldMergeSelfGameSocketUpdate,
} from '@/utils/gameResultsArtifacts.util';
import { userIsOnLeagueScheduleGame } from '@/utils/leagueScheduleUserGames';
import { AnimatedPresencePanel } from '@/components/motion/AnimatedPresencePanel';
import { AnimatedChildrenStagger } from '@/components/motion/AnimatedChildrenStagger';

type GameWithResults = Game & {
  rounds?: Round[];
};

type LeagueSeasonShellTab = 'general' | 'schedule' | 'planner' | 'standings' | 'faq';

function leagueTabFromSearch(search: string): LeagueSeasonShellTab {
  const tab = new URLSearchParams(search).get('tab');
  if (tab === 'general' || tab === 'schedule' || tab === 'planner' || tab === 'standings' || tab === 'faq') return tab;
  return 'general';
}

export interface GameDetailsShellProps {
  variant: 'game' | 'league';
  initialGame?: Game | null;
  selectedGameChatId?: string | null;
  onChatGameSelect?: (gameId: string) => void;
  layoutCancelledInfo?: { entityType: string; name: string | null; sport?: import('@/types').Sport; cancelledAt: string; cancelledByUser?: import('@/types').BasicUser | null } | null;
}

export const GameDetailsShell = ({ variant, initialGame, selectedGameChatId, onChatGameSelect, layoutCancelledInfo }: GameDetailsShellProps) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const { setBottomTabsVisible } = useShellNavStore();
  const {
    setGameDetailsCanAccessChat,
    setGameDetailsSportTag,
    gameDetailsTableViewOverride,
    setGameDetailsTableViewOverride,
    setGameDetailsTableAddRound,
  } = useGameDetailsChromeStore();

  const [game, setGame] = useState<Game | null>(null);
  const [myInvites, setMyInvites] = useState<Invite[]>([]);
  const [gameInvites, setGameInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPlayerList, setShowPlayerList] = useState(false);
  const [playerListMode, setPlayerListMode] = useState<'players' | 'trainer'>('players');
  const [playerListGender, setPlayerListGender] = useState<'MALE' | 'FEMALE' | undefined>(undefined);
  const [showManageUsers, setShowManageUsers] = useState(false);
  const [courts, setCourts] = useState<Court[]>([]);
  const [isCourtModalOpen, setIsCourtModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isClosingEditMode, setIsClosingEditMode] = useState(false);
  const [isClubModalOpen, setIsClubModalOpen] = useState(false);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [cancelledGameInfo, setCancelledGameInfo] = useState<{
    entityType: string;
    name: string | null;
    sport?: import('@/types').Sport;
    cancelledAt: string;
    cancelledByUser?: import('@/types').BasicUser | null;
  } | null>(null);
  const [showLeaveConfirmation, setShowLeaveConfirmation] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [isEditMaxParticipantsModalOpen, setIsEditMaxParticipantsModalOpen] = useState(false);
  const [isEditGameInfoModalOpen, setIsEditGameInfoModalOpen] = useState(false);
  const [editGameInfoInitialTab, setEditGameInfoInitialTab] = useState<EditGameInfoInitialTabId>('general');
  const [activeTab, setActiveTab] = useState<LeagueSeasonShellTab>(() => leagueTabFromSearch(location.search));

  const persistLeagueSeasonTabInUrl = useCallback(
    (tab: LeagueSeasonShellTab) => {
      if (game?.entityType !== 'LEAGUE_SEASON') return;
      const sp = new URLSearchParams(location.search);
      sp.set('tab', tab);
      if (tab !== 'schedule') {
        sp.delete('scheduleView');
        sp.delete('subtab');
      }
      const next = sp.toString();
      const cur = new URLSearchParams(location.search).toString();
      if (next === cur) return;
      navigate({ pathname: location.pathname, search: next }, { replace: true });
    },
    [game?.entityType, location.pathname, location.search, navigate]
  );
  const persistLeagueSeasonTabRef = useRef(persistLeagueSeasonTabInUrl);
  persistLeagueSeasonTabRef.current = persistLeagueSeasonTabInUrl;
  const [hasFaqs, setHasFaqs] = useState(false);
  const [showResetConfirmation, setShowResetConfirmation] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [showAnnouncedConfirm, setShowAnnouncedConfirm] = useState(false);
  const [tableSetModal, setTableSetModal] = useState<{ roundId: string; matchId: string } | null>(null);
  const [roundAddedForModal, setRoundAddedForModal] = useState<Round | null>(null);
  const [roundAddedModalRoundNumber, setRoundAddedModalRoundNumber] = useState<number | undefined>(undefined);
  const hasRenderedContentRef = useRef(false);

  const engineRounds = useGameResultsStore((s) => s.rounds);
  const engineCanEdit = useGameResultsStore((s) => s.canEdit);
  const isLandscape = useIsLandscape();
  const effectiveTableView = gameDetailsTableViewOverride ?? isLandscape;
  const prevLandscapeRef = useRef(isLandscape);

  useEffect(() => {
    if (prevLandscapeRef.current !== isLandscape) {
      prevLandscapeRef.current = isLandscape;
      setGameDetailsTableViewOverride(null);
    }
  }, [isLandscape, setGameDetailsTableViewOverride]);

  const tablePlayers = useMemo<BasicUser[]>(
    () => (game?.participants?.filter(isParticipantPlaying).map(p => p.user) || []) as BasicUser[],
    [game?.participants]
  );

  const handleFaqsChange = useCallback((hasFaqs: boolean) => {
    setHasFaqs(hasFaqs);
  }, []);

  useEffect(() => {
    if (activeTab === 'faq' && !hasFaqs) {
      setActiveTab('general');
      persistLeagueSeasonTabRef.current('general');
    }
  }, [activeTab, hasFaqs]);

  const isLeagueSeasonParticipant = useMemo(
    () => game?.entityType === 'LEAGUE_SEASON' && !!user?.id && userIsOnLeagueScheduleGame(game, user.id),
    [game, user?.id]
  );

  useEffect(() => {
    if (game?.entityType !== 'LEAGUE_SEASON') return;
    if (activeTab === 'planner' && !isLeagueSeasonParticipant) {
      setActiveTab('general');
      persistLeagueSeasonTabRef.current('general');
    }
  }, [activeTab, game?.entityType, isLeagueSeasonParticipant]);

  const leagueSeasonTabs = useMemo<SegmentedSwitchTab[]>(() => {
    if (game?.entityType !== 'LEAGUE_SEASON') return [];
    const tabs: SegmentedSwitchTab[] = [
      { id: 'general', label: t('gameDetails.general'), icon: LayoutDashboard },
      { id: 'schedule', label: t('gameDetails.schedule'), icon: CalendarDays },
    ];
    if (isLeagueSeasonParticipant) {
      tabs.push({ id: 'planner', label: t('gameDetails.plannerTab'), icon: LayoutGrid });
    }
    tabs.push({ id: 'standings', label: t('gameDetails.standings'), icon: Trophy });
    if (hasFaqs) {
      tabs.push({ id: 'faq', label: t('gameDetails.faq', { defaultValue: 'FAQ' }), icon: HelpCircle });
    }
    return tabs;
  }, [game?.entityType, hasFaqs, isLeagueSeasonParticipant, t]);
  const [editFormData, setEditFormData] = useState({
    clubId: '',
    courtId: '',
    name: '',
    isPublic: true,
    affectsRating: true,
    anyoneCanInvite: false,
    resultsByAnyone: false,
    allowDirectJoin: false,
    hasBookedCourt: false,
    afterGameGoToBar: false,
    hasFixedTeams: false,
    allowUserInMultipleTeams: false,
    genderTeams: 'ANY' as GenderTeam,
    description: '',
  });

  useEffect(() => {
    const fetchGame = async () => {
      if (!id) return;

      setMyInvites([]);
      setGameInvites([]);
      setCancelledGameInfo(null);

      const seed = initialGame && initialGame.id === id ? initialGame : null;
      if (seed) {
        setGame(seed);
        setLoading(false);
      } else {
        setLoading(true);
      }

      try {
        const response = await gamesApi.getById(id);
        setGame(response.data);

        if (user?.id) {
          const myInvitesResponse = await invitesApi.getMyInvites('PENDING');
          const gameMyInvites = myInvitesResponse.data.filter((inv) => inv.gameId === id);
          setMyInvites(gameMyInvites);

          const isParticipant = response.data.participants.some((p) => p.userId === user.id);
          if (isParticipant) {
            const gameInvitesResponse = await invitesApi.getGameInvites(id);
            setGameInvites(gameInvitesResponse.data);
          }
        }

      } catch (error: unknown) {
        const err = error as { response?: { status?: number; data?: { cancelled?: boolean; entityType?: string; name?: string | null; sport?: import('@/types').Sport; cancelledAt?: string; cancelledByUser?: import('@/types').BasicUser } } };
        if (err.response?.status === 410 && err.response?.data?.cancelled) {
          const d = err.response.data;
          setCancelledGameInfo({
            entityType: d.entityType ?? 'GAME',
            name: d.name ?? null,
            sport: d.sport,
            cancelledAt: d.cancelledAt ?? new Date().toISOString(),
            cancelledByUser: d.cancelledByUser ?? null,
          });
        } else {
          console.error('Failed to fetch game:', error);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchGame();
  }, [id, user?.id, initialGame]);

  useEffect(() => {
    if (game?.entityType !== 'LEAGUE_SEASON') return;
    const sp = new URLSearchParams(location.search);
    const tab = sp.get('tab');
    const scheduleView = sp.get('scheduleView');
    if (tab === 'schedule' && scheduleView === 'planner' && isLeagueSeasonParticipant) {
      const next = new URLSearchParams(location.search);
      next.set('tab', 'planner');
      next.delete('scheduleView');
      navigate({ pathname: location.pathname, search: next.toString() }, { replace: true });
      setActiveTab('planner');
      return;
    }
    if (tab === 'planner' && !isLeagueSeasonParticipant) {
      setActiveTab('general');
      return;
    }
    if (tab === 'general' || tab === 'schedule' || tab === 'planner' || tab === 'standings' || tab === 'faq') {
      setActiveTab((prev) => (prev === tab ? prev : tab));
    }
  }, [game?.entityType, id, isLeagueSeasonParticipant, location.pathname, location.search, navigate]);

  const lastInviteDeleted = useSocketEventsStore((state) => state.lastInviteDeleted);
  const lastGameUpdate = useSocketEventsStore((state) => state.lastGameUpdate);
  const lastGameCancelled = useSocketEventsStore((state) => state.lastGameCancelled);
  const clearLastGameCancelled = useSocketEventsStore((state) => state.clearLastGameCancelled);

  useEffect(() => {
    if (!id) return;
    socketService.joinGameRoom(id);
    return () => {
      socketService.leaveGameRoom(id);
    };
  }, [id]);

  useEffect(() => {
    if (layoutCancelledInfo && id) {
      setCancelledGameInfo(layoutCancelledInfo);
      setGame(null);
      setLoading(false);
    }
  }, [layoutCancelledInfo, id]);

  useEffect(() => {
    if (!lastInviteDeleted) return;
    if (lastInviteDeleted.gameId === id || !lastInviteDeleted.gameId) {
      setMyInvites((prev) => prev.filter((inv) => inv.id !== lastInviteDeleted.inviteId));
      setGameInvites((prev) => prev.filter((inv) => inv.id !== lastInviteDeleted.inviteId));
      setGame((prev) => {
        if (!prev) return prev;
        return mergeGameWithInviteDeletedPayload(prev, lastInviteDeleted);
      });
    }
  }, [lastInviteDeleted, id]);

  useEffect(() => {
    if (!lastGameUpdate || lastGameUpdate.gameId !== id) return;
    const updatedGame = normalizeGameFromApi(lastGameUpdate.game);
    const fromSelf = lastGameUpdate.senderId === user?.id;

    setGame((prevGame) => {
      if (!prevGame) return updatedGame;

      const mergeArtifactsOnSelf = () =>
        mergeGameResultsArtifactsFields(prevGame, {
          ...prevGame,
          resultsArtifacts: updatedGame.resultsArtifacts ?? prevGame.resultsArtifacts,
          resultsSummaryText: updatedGame.resultsSummaryText ?? prevGame.resultsSummaryText,
          photosCount: updatedGame.photosCount ?? prevGame.photosCount,
          mainPhotoId: updatedGame.mainPhotoId ?? prevGame.mainPhotoId,
          mainPhoto: updatedGame.mainPhoto ?? prevGame.mainPhoto,
        });

      if (fromSelf) {
        if (
          lastGameUpdate.forceUpdate ||
          shouldMergeSelfGameSocketUpdate(prevGame, updatedGame)
        ) {
          return mergeArtifactsOnSelf();
        }
        return prevGame;
      }

      let merged: Game = updatedGame;

      if (prevGame.resultsStatus === 'FINAL' && updatedGame.resultsStatus === 'FINAL') {
        const prevGameWithResults = prevGame as GameWithResults;
        const updatedGameWithResults = updatedGame as GameWithResults;
        merged = {
          ...updatedGame,
          rounds:
            updatedGameWithResults.rounds && updatedGameWithResults.rounds.length > 0
              ? updatedGameWithResults.rounds
              : prevGameWithResults.rounds || updatedGameWithResults.rounds,
          outcomes:
            updatedGame.outcomes && updatedGame.outcomes.length > 0
              ? updatedGame.outcomes
              : prevGame.outcomes || updatedGame.outcomes,
        };
      }

      if (prevGame.hasFixedTeams && prevGame.fixedTeams && prevGame.fixedTeams.length > 0) {
        if (!updatedGame.fixedTeams || updatedGame.fixedTeams.length === 0) {
          merged = {
            ...merged,
            fixedTeams: prevGame.fixedTeams,
          };
        }
      }

      return mergeGameResultsArtifactsFields(prevGame, merged);
    });
  }, [lastGameUpdate, id, user?.id]);

  useEffect(() => {
    if (!lastGameCancelled || lastGameCancelled.gameId !== id) return;
    setCancelledGameInfo({
      entityType: lastGameCancelled.entityType,
      name: lastGameCancelled.name ?? null,
      sport: lastGameCancelled.sport,
      cancelledAt: lastGameCancelled.cancelledAt,
      cancelledByUser: lastGameCancelled.cancelledByUser ?? null,
    });
    setGame(null);
    clearLastGameCancelled();
  }, [lastGameCancelled, id, clearLastGameCancelled]);

  // Update GameResultsEngine when game state changes (e.g., after finishing)
  useEffect(() => {
    if (game && user?.id) {
      const engineState = GameResultsEngine.getState();
      // Only update if engine is initialized for this game
      if (engineState.initialized && engineState.gameId === game.id && engineState.userId === user.id) {
        // Check if game status has changed
        if (shouldSyncEngineGameFromShell(game, engineState.game)) {
          GameResultsEngine.updateGame(game);
        }
      }
    }
  }, [game, user?.id]);

  useEffect(() => {
    setBottomTabsVisible(false);
    return () => {
      setBottomTabsVisible(true);
    };
  }, [setBottomTabsVisible]);

  useEffect(() => {
    const fetchCourts = async () => {
      if (!game?.clubId) return;
      
      try {
        const response = await courtsApi.getByClubId(game.clubId);
        setCourts(response.data);
      } catch (error) {
        console.error('Failed to fetch courts:', error);
      }
    };

    fetchCourts();
  }, [game?.clubId]);

  useEffect(() => {
    const fetchClubs = async () => {
      if (!user?.currentCity) return;
      
      try {
        const response = await clubsApi.getByCityId(user.currentCity.id, game?.entityType || 'GAME');
        setClubs(response.data);
      } catch (error) {
        console.error('Failed to fetch clubs:', error);
      }
    };

    fetchClubs();
  }, [user?.currentCity, game?.entityType]);

  useEffect(() => {
    const checkFaqs = async () => {
      if (!game || game.entityType !== 'LEAGUE_SEASON') return;
      
      const isOwner = game && user ? isUserGameAdminOrOwner(game, user.id) : false;
      const canEdit = isOwner || user?.isAdmin || false;
      
      if (canEdit) return;
      
      try {
        const response = await faqApi.getGameFaqs(game.id);
        setHasFaqs(response.data.length > 0);
      } catch (error) {
        console.error('Failed to fetch FAQs:', error);
        setHasFaqs(false);
      }
    };

    checkFaqs();
  }, [game, user]);

  useEffect(() => {
    if (game && !isEditMode) {
      setEditFormData({
        clubId: game.clubId || '',
        courtId: game.courtId || '',
        name: game.name || '',
        isPublic: game.isPublic,
        affectsRating: game.affectsRating,
        anyoneCanInvite: game.anyoneCanInvite || false,
        resultsByAnyone: game.resultsByAnyone || false,
        allowDirectJoin: game.allowDirectJoin,
        hasBookedCourt: game.hasBookedCourt || false,
        afterGameGoToBar: game.afterGameGoToBar || false,
        hasFixedTeams: game.maxParticipants === 2 ? false : (game.hasFixedTeams || false),
        allowUserInMultipleTeams:
          game.maxParticipants === 2 || !(game.hasFixedTeams || false)
            ? false
            : (game.allowUserInMultipleTeams ?? false),
        genderTeams: (game.genderTeams || 'ANY') as 'ANY' | 'MEN' | 'WOMEN' | 'MIX_PAIRS',
        description: game.description || '',
      });
    }
  }, [game, isEditMode]);

  const handleJoin = async () => {
    if (!id) return;

    const authUser = useAuthStore.getState().user;
    if (authUser && authUser.nameIsSet !== true) {
      runWithProfileName(() => void handleJoin());
      return;
    }

    try {
      const response = await gamesApi.join(id);
      const message = (response as any).message || 'Successfully joined the game';
      
      if (message === 'games.addedToJoinQueue') {
        toast.success(t('games.addedToJoinQueue', { defaultValue: 'Added to join queue' }));
      } else if (message === 'games.addedToQueueLevelOutOfRange') {
        toast.error(t('games.addedToQueueLevelOutOfRange', { defaultValue: 'Your level is outside the range set by the owner. You have been added to the queue.' }));
      } else {
        toast.success(t(message, { defaultValue: message }));
      }
      
      const gameResponse = await gamesApi.getById(id);
      setGame(gameResponse.data);
    } catch (error: any) {
      console.error('Failed to join game:', error);
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    }
  };

  const handleAddToGame = async () => {
    if (!id) return;

    const authUser = useAuthStore.getState().user;
    if (authUser && authUser.nameIsSet !== true) {
      runWithProfileName(() => void handleAddToGame());
      return;
    }

    try {
      const result = await gamesApi.togglePlayingStatus(id, 'PLAYING') as { message?: string };
      const response = await gamesApi.getById(id);
      setGame(response.data);
      if (result?.message === 'games.addedToJoinQueue') {
        toast.success(t('games.addedToJoinQueue', { defaultValue: 'Added to join queue' }));
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    }
  };

  const handleAcceptInvite = async (inviteId: string) => {
    const authUser = useAuthStore.getState().user;
    if (authUser && authUser.nameIsSet !== true) {
      runWithProfileName(() => void handleAcceptInvite(inviteId));
      return;
    }
    try {
      const response = await invitesApi.accept(inviteId);
      const message = (response as any).message || 'Invite accepted successfully';
      
      if (message === 'games.addedToJoinQueue') {
        toast.success(t('games.addedToJoinQueue', { defaultValue: 'Added to join queue' }));
      } else {
        toast.success(t(message, { defaultValue: message }));
      }
      
      setMyInvites(myInvites.filter((inv) => inv.id !== inviteId));
      if (id) {
        const response = await gamesApi.getById(id);
        setGame(response.data);
        const gameInvitesResponse = await invitesApi.getGameInvites(id);
        setGameInvites(gameInvitesResponse.data);
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    }
  };

  const { handleDeclineInvite, declineInviteModal } = useDeclineInvite({
    onDeclined: async (inviteId) => {
      setMyInvites((prev) => prev.filter((inv) => inv.id !== inviteId));
      const { setPendingInvites } = useHeaderStore.getState();
      const currentCount = useHeaderStore.getState().pendingInvites;
      setPendingInvites(Math.max(0, currentCount - 1));
      if (id) {
        const response = await gamesApi.getById(id);
        setGame(response.data);
        const gameInvitesResponse = await invitesApi.getGameInvites(id);
        setGameInvites(gameInvitesResponse.data);
      }
    },
  });

  const handleCancelInvite = async (inviteId: string) => {
    const authUser = useAuthStore.getState().user;
    if (authUser && authUser.nameIsSet !== true) {
      runWithProfileName(() => void handleCancelInvite(inviteId));
      return;
    }
    try {
      await invitesApi.cancel(inviteId);
      setGameInvites(gameInvites.filter((inv) => inv.id !== inviteId));
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    }
  };

  const handleCancelTrainerInvite = async () => {
    if (!pendingTrainerInvite) return;
    await handleCancelInvite(pendingTrainerInvite.id);
  };

  const participation = getGameParticipationState(game?.participants ?? [], user?.id, game ?? undefined);
  const { isGuest, isParticipantNonGuest: isParticipant, isRealParticipant, isPlaying: isUserPlaying, isOwner: isUserOwner, isInJoinQueue, hasPendingInvite, isAdminOrOwner: isOwner, isFull } = participation;
  const canAccessChat = true;
  const canEdit = isOwner || user?.isAdmin || false;
  const canEditGameFormat = game ? canUserEditGameFormat(game, user) : false;
  const canViewSettings = game?.resultsStatus === 'NONE' && canEdit && game.status !== 'ARCHIVED';

  useEffect(() => {
    setGameDetailsCanAccessChat(canAccessChat);
  }, [canAccessChat, setGameDetailsCanAccessChat]);

  useEffect(() => {
    if (!game) {
      setGameDetailsSportTag(null);
      return;
    }
    const viewerPrimarySport = getViewerPrimarySport(user);
    setGameDetailsSportTag({
      sport: parseGameSport(game.sport),
      showSport: shouldShowGameCardSportGlyph(game.sport, viewerPrimarySport, undefined),
      playersPerMatch: playersPerMatchOf(game),
      showMatchFormat: game.entityType !== 'TRAINING',
    });
    return () => setGameDetailsSportTag(null);
  }, [game, user, setGameDetailsSportTag]);


  const pendingTrainerParticipant = game?.entityType === 'TRAINING' && !game.trainerId
    ? game.participants?.find((p) => isPendingGameInvite(p) && p.role === 'ADMIN')
    : undefined;
  const pendingTrainerInvite = pendingTrainerParticipant
    ? gameInvites.find(inv => inv.receiverId === pendingTrainerParticipant.userId && inv.status === 'PENDING')
    : undefined;

  const canInvitePlayers = Boolean((isOwner || (game?.anyoneCanInvite && isParticipant)) && isRealParticipant && !isFull && game?.status !== 'FINISHED' && game?.status !== 'ARCHIVED');
  const canManageJoinQueue = Boolean(
    isOwner ||
    participation.userParticipant?.role === 'ADMIN' ||
    (game?.anyoneCanInvite && participation.isPlaying)
  );

  const handleAcceptJoinQueue = async (queueUserId: string) => {
    if (!id) return;

    const authUser = useAuthStore.getState().user;
    if (authUser && authUser.nameIsSet !== true) {
      runWithProfileName(() => void handleAcceptJoinQueue(queueUserId));
      return;
    }

    try {
      await gamesApi.acceptJoinQueue(id, queueUserId);
      const response = await gamesApi.getById(id);
      setGame(response.data);
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    }
  };

  const handleDeclineJoinQueue = async (queueUserId: string) => {
    if (!id) return;

    const authUser = useAuthStore.getState().user;
    if (authUser && authUser.nameIsSet !== true) {
      runWithProfileName(() => void handleDeclineJoinQueue(queueUserId));
      return;
    }

    try {
      await gamesApi.declineJoinQueue(id, queueUserId);
      const response = await gamesApi.getById(id);
      setGame(response.data);
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    }
  };

  const handleCancelJoinQueue = async () => {
    if (!id) return;

    try {
      await gamesApi.cancelJoinQueue(id);
      const response = await gamesApi.getById(id);
      setGame(response.data);
      toast.success(t('games.joinRequestCanceled', { defaultValue: 'Join request canceled' }));
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    }
  };


  const handleFinishTraining = async () => {
    if (!id || !user?.id || !game) return;
    
    const canEditResults = canUserEditResults(game, user);
    if (!canEditResults) return;

    try {
      await trainingApi.finishTraining(id);
      toast.success(t('training.finishTrainingSuccess', { defaultValue: 'Training finished successfully' }));
      const response = await gamesApi.getById(id);
      const updatedGame = response.data;
      setGame(updatedGame);
    } catch (error: any) {
      console.error('Failed to finish training:', error);
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    }
  };

  const handleUpdateParticipantLevel = async (
    gameId: string,
    userId: string,
    level: number,
    reliability: number
  ) => {
    try {
      await trainingApi.updateParticipantLevel(gameId, userId, level, reliability);
      toast.success(t('training.levelUpdated', { defaultValue: 'Level updated successfully' }));
      const response = await gamesApi.getById(gameId);
      const updatedGame = response.data;
      setGame(updatedGame);
    } catch (error: any) {
      console.error('Failed to update participant level:', error);
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
      throw error;
    }
  };

  const handleUndoTraining = async (gameId: string) => {
    try {
      await trainingApi.undoTraining(gameId);
      toast.success(t('training.undoSuccess', { defaultValue: 'Training changes undone successfully' }));
      const response = await gamesApi.getById(gameId);
      const updatedGame = response.data;
      setGame(updatedGame);
    } catch (error: any) {
      console.error('Failed to undo training:', error);
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
      throw error;
    }
  };

  const proceedWithResultsEntry = async () => {
    if (!id || !user?.id || !game) return;
    
    setShowAnnouncedConfirm(false);

    try {
      const startRes = await resultsApi.startResultsEntryWithGeneratedRound(id);
      const updatedGame = startRes.data.game;
      setGame(updatedGame);

      await GameResultsEngine.cleanup();
      await GameResultsEngine.initialize(id, user.id, t);
      GameResultsEngine.updateGame(updatedGame);

      toast.success(t('gameResults.resultsEntryStarted') || 'Results entry started');
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    }
  };

  const handleStartResultsEntry = async () => {
    if (!id || !user?.id || !game) return;
    
    const canEditResults = canUserEditResults(game, user);
    if (!canEditResults) return;

    // Show confirmation if game is ANNOUNCED
    if (game.status === 'ANNOUNCED') {
      setShowAnnouncedConfirm(true);
      return;
    }

    await proceedWithResultsEntry();
  };

  const handleResetGame = async () => {
    if (!id || isResetting) return;
    
    setIsResetting(true);
    try {
      await resultsApi.resetGameResults(id);
      const response = await gamesApi.getById(id);
      setGame(response.data);
      toast.success(t('gameResults.gameReset') || 'Game reset successfully');
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    } finally {
      setIsResetting(false);
      setShowResetConfirmation(false);
    }
  };

  const handleUserAction = async (action: string, userId: string) => {
    if (!id) return;

    const authUser = useAuthStore.getState().user;
    if (authUser && authUser.nameIsSet !== true) {
      runWithProfileName(() => void handleUserAction(action, userId));
      return;
    }
    
    try {
      switch (action) {
        case 'promote-admin':
          await gamesApi.promoteToAdmin(id, userId);
          break;
        case 'revoke-admin':
          await gamesApi.revokeAdmin(id, userId);
          break;
        case 'set-trainer':
          await gamesApi.setTrainer(id, userId, true);
          toast.success(t('games.trainerSet', { defaultValue: 'Trainer set successfully' }));
          break;
        case 'remove-trainer':
          await gamesApi.setTrainer(id, userId, false);
          toast.success(t('games.trainerRemoved', { defaultValue: 'Trainer removed successfully' }));
          break;
        case 'kick-user':
        case 'kick-admin':
          await gamesApi.kickUser(id, userId);
          break;
        case 'transfer-ownership':
          await gamesApi.transferOwnership(id, userId);
          setShowManageUsers(false);
          break;
        default:
          throw new Error('Unknown action');
      }
      
      const response = await gamesApi.getById(id);
      setGame(response.data);
      
      if (action === 'transfer-ownership') {
        toast.success(t('games.ownershipTransferred'));
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('errors.generic'));
      throw error;
    }
  };

  const handleToggleFavorite = async () => {
    if (!game) return;
    
    const clubId = game.court?.club?.id || game.club?.id;
    if (!clubId) return;

    try {
      if (game.isClubFavorite) {
        await favoritesApi.removeFromFavorites(clubId);
        setGame({ ...game, isClubFavorite: false });
      } else {
        await favoritesApi.addToFavorites(clubId);
        setGame({ ...game, isClubFavorite: true });
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    }
  };

  const handleCourtsChange = useCallback((newCourts: Court[]) => {
    setCourts(newCourts);
  }, []);

  const handleRefresh = useCallback(async () => {
    if (!id) return;
    await clearCachesExceptUnsyncedResults();
    try {
      const response = await gamesApi.getById(id);
      setGame(response.data);
      if (user) {
        const myInvitesResponse = await invitesApi.getMyInvites('PENDING');
        const gameMyInvites = myInvitesResponse.data.filter((inv) => inv.gameId === id);
        setMyInvites(gameMyInvites);
        const isParticipant = response.data.participants.some((p) => p.userId === user?.id);
        if (isParticipant) {
          const gameInvitesResponse = await invitesApi.getGameInvites(id);
          setGameInvites(gameInvitesResponse.data);
        }
      }
    } catch (error: unknown) {
      const err = error as { response?: { status?: number; data?: { cancelled?: boolean; entityType?: string; name?: string | null; sport?: import('@/types').Sport; cancelledAt?: string; cancelledByUser?: import('@/types').BasicUser } } };
      if (err.response?.status === 410 && err.response?.data?.cancelled) {
        const d = err.response.data;
        setCancelledGameInfo({
          entityType: d.entityType ?? 'GAME',
          name: d.name ?? null,
          sport: d.sport,
          cancelledAt: d.cancelledAt ?? new Date().toISOString(),
          cancelledByUser: d.cancelledByUser ?? null,
        });
        setGame(null);
      } else {
        console.error('Failed to refresh game:', error);
      }
    }
  }, [id, user]);

  const { isRefreshing, pullDistance, pullProgress } = usePullToRefresh({
    onRefresh: handleRefresh,
    disabled: loading,
  });

  const handleCourtSelect = async (courtId: string) => {
    if (!id) return;

    try {
      const updateData: Partial<Game> = {
        courtId: courtId === 'notBooked' ? '' : courtId,
      };

      await gamesApi.update(id, updateData);
      
      const response = await gamesApi.getById(id);
      setGame(response.data);
      
      toast.success(game?.entityType === 'BAR' ? t('gameDetails.hallUpdated') : t('gameDetails.courtUpdated'));
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    }
  };

  const handleEditModeToggle = () => {
    if (isEditMode) {
      if (game) {
        setEditFormData({
          clubId: game.clubId || '',
          courtId: game.courtId || '',
          name: game.name || '',
          isPublic: game.isPublic,
          affectsRating: game.affectsRating,
          anyoneCanInvite: game.anyoneCanInvite || false,
          resultsByAnyone: game.resultsByAnyone || false,
          allowDirectJoin: game.allowDirectJoin,
          hasBookedCourt: game.hasBookedCourt || false,
          afterGameGoToBar: game.afterGameGoToBar || false,
          hasFixedTeams: game.maxParticipants === 2 ? false : (game.hasFixedTeams || false),
          allowUserInMultipleTeams:
            game.maxParticipants === 2 || !(game.hasFixedTeams || false)
              ? false
              : (game.allowUserInMultipleTeams ?? false),
          genderTeams: (game.genderTeams || 'ANY') as GenderTeam,
          description: game.description || '',
        });
      }
      setIsClosingEditMode(true);
      setTimeout(() => {
        setIsEditMode(false);
        setIsClosingEditMode(false);
      }, 400);
    } else {
      setIsEditMode(true);
    }
  };

  const handleSaveChanges = async () => {
    if (!id) return;

    try {
      const updateData: Partial<Game> = {
        clubId: editFormData.clubId || undefined,
        courtId: editFormData.courtId ? editFormData.courtId : '',
        name: editFormData.name || undefined,
        isPublic: editFormData.isPublic,
        anyoneCanInvite: editFormData.anyoneCanInvite,
        allowDirectJoin: editFormData.allowDirectJoin,
        hasBookedCourt: editFormData.hasBookedCourt,
        afterGameGoToBar: editFormData.afterGameGoToBar,
        description: editFormData.description,
      };

      if (game?.entityType !== 'TRAINING') {
        updateData.affectsRating = editFormData.affectsRating;
        updateData.resultsByAnyone = editFormData.resultsByAnyone;
        updateData.hasFixedTeams = game?.maxParticipants === 2 ? false : editFormData.hasFixedTeams;
        const allowMulti =
          game?.maxParticipants === 2 || !editFormData.hasFixedTeams
            ? false
            : editFormData.allowUserInMultipleTeams;
        updateData.allowUserInMultipleTeams = allowMulti;
      }

      if (game?.entityType === 'GAME' || game?.entityType === 'TOURNAMENT' || game?.entityType === 'LEAGUE') {
        updateData.genderTeams = editFormData.genderTeams;
      }

      await gamesApi.update(id, updateData);
      
      const response = await gamesApi.getById(id);
      setGame(response.data);
      
      setIsClosingEditMode(true);
      setTimeout(() => {
        setIsEditMode(false);
        setIsClosingEditMode(false);
      }, 400);
      toast.success(t('gameDetails.settingsUpdated'));
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    }
  };

  const handleFormDataChange = (data: Partial<typeof editFormData>) => {
    const next = { ...editFormData, ...data };
    if (data.hasFixedTeams === false) {
      next.allowUserInMultipleTeams = false;
    }
    setEditFormData(next);
  };

  const canDeleteGame = () => {
    if (!game || !user) return false;
    
    const isOwner = game.participants.some(
      (p) => p.userId === user.id && p.role === 'OWNER'
    );
    
    if (!isOwner) return false;
    
    return game.resultsStatus === 'NONE';
  };

  const handleDeleteGame = async () => {
    if (!id || isDeleting) return;
    
    setIsDeleting(true);
    try {
      await gamesApi.delete(id);
      toast.success(t('gameDetails.gameDeleted'));
      navigate('/');
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirmation(false);
    }
  };

  const getLeftGameText = (entityType: string) => {
    const keyMap: Record<string, string> = {
      'GAME': 'gameDetails.leftGameGame',
      'TOURNAMENT': 'gameDetails.leftGameTournament',
      'LEAGUE': 'gameDetails.leftGameLeague',
      'LEAGUE_SEASON': 'gameDetails.leftGameLeagueSeason',
      'BAR': 'gameDetails.leftGameBar',
      'TRAINING': 'gameDetails.leftGameTraining',
    };
    return keyMap[entityType] || 'gameDetails.leftGame';
  };

  const getOwnerCannotLeaveText = (entityType: string) => {
    const keyMap: Record<string, string> = {
      'GAME': 'gameDetails.ownerCannotLeaveGame',
      'TOURNAMENT': 'gameDetails.ownerCannotLeaveTournament',
      'LEAGUE': 'gameDetails.ownerCannotLeaveLeague',
      'LEAGUE_SEASON': 'gameDetails.ownerCannotLeaveLeagueSeason',
      'BAR': 'gameDetails.ownerCannotLeaveBar',
      'TRAINING': 'gameDetails.ownerCannotLeaveTraining',
    };
    return keyMap[entityType] || 'gameDetails.ownerCannotLeave';
  };

  const getNotPlayingHintText = (entityType: string) => {
    const keyMap: Record<string, string> = {
      'GAME': 'gameDetails.notPlayingHintGame',
      'TOURNAMENT': 'gameDetails.notPlayingHintTournament',
      'LEAGUE': 'gameDetails.notPlayingHintLeague',
      'LEAGUE_SEASON': 'gameDetails.notPlayingHintLeagueSeason',
      'BAR': 'gameDetails.notPlayingHintBar',
      'TRAINING': 'gameDetails.notPlayingHintTraining',
    };
    return keyMap[entityType] || 'gameDetails.notPlayingHint';
  };

  const getDuplicateGameText = (entityType: string) => {
    const keyMap: Record<string, string> = {
      'GAME': 'gameDetails.duplicateGameGame',
      'TOURNAMENT': 'gameDetails.duplicateGameTournament',
      'LEAGUE': 'gameDetails.duplicateGameLeague',
      'LEAGUE_SEASON': 'gameDetails.duplicateGameLeagueSeason',
      'BAR': 'gameDetails.duplicateGameBar',
      'TRAINING': 'gameDetails.duplicateGameTraining',
    };
    return keyMap[entityType] || 'gameDetails.duplicateGame';
  };

  const getLeaveGameText = (entityType: string) => {
    const keyMap: Record<string, string> = {
      'GAME': 'gameDetails.leaveGameGame',
      'TOURNAMENT': 'gameDetails.leaveGameTournament',
      'LEAGUE': 'gameDetails.leaveGameLeague',
      'LEAGUE_SEASON': 'gameDetails.leaveGameLeagueSeason',
      'BAR': 'gameDetails.leaveGameBar',
      'TRAINING': 'gameDetails.leaveGameTraining',
    };
    return keyMap[entityType] || 'gameDetails.leaveGame';
  };

  const getDeleteGameText = (entityType: string) => {
    const keyMap: Record<string, string> = {
      'GAME': 'gameDetails.deleteGameGame',
      'TOURNAMENT': 'gameDetails.deleteGameTournament',
      'LEAGUE': 'gameDetails.deleteGameLeague',
      'LEAGUE_SEASON': 'gameDetails.deleteGameLeagueSeason',
      'BAR': 'gameDetails.deleteGameBar',
      'TRAINING': 'gameDetails.deleteGameTraining',
    };
    return keyMap[entityType] || 'gameDetails.deleteGame';
  };

  const handleLeaveGame = async () => {
    if (!id || isLeaving) return;

    const authUser = useAuthStore.getState().user;
    if (authUser && authUser.nameIsSet !== true) {
      runWithProfileName(() => void handleLeaveGame());
      return;
    }

    setIsLeaving(true);
    try {
      await gamesApi.leave(id);
      const response = await gamesApi.getById(id);
      setGame(response.data);
      toast.success(t(getLeftGameText(game?.entityType || 'GAME')));
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    } finally {
      setIsLeaving(false);
      setShowLeaveConfirmation(false);
    }
  };

  const handleLeaveChat = async () => {
    if (!id || isLeaving) return;

    const authUser = useAuthStore.getState().user;
    if (authUser && authUser.nameIsSet !== true) {
      runWithProfileName(() => void handleLeaveChat());
      return;
    }
    
    setIsLeaving(true);
    try {
      await gamesApi.leave(id);
      const response = await gamesApi.getById(id);
      setGame(response.data);
      toast.success(t('gameDetails.leftChat'));
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    } finally {
      setIsLeaving(false);
    }
  };

  const tableIsEditing = game ? (engineCanEdit && game.resultsStatus === 'IN_PROGRESS') : false;
  const isTableViewActive = !!(game && effectiveTableView && canViewTournamentTableByAccess(game, user));
  const handleTableAddRound = useCallback(async () => {
    await GameResultsEngine.addRound();
    const rounds = useGameResultsStore.getState().rounds;
    const newRound = rounds[rounds.length - 1] ?? null;
    if (shouldShowRoundAddedModal(newRound)) {
      setRoundAddedForModal(newRound);
      setRoundAddedModalRoundNumber(undefined);
    }
  }, []);
  const handleTableDeleteRound = useCallback(
    (roundId: string) => {
      GameResultsEngine.removeRound(roundId, t);
    },
    [t]
  );
  useEffect(() => {
    if (isTableViewActive) {
      setGameDetailsTableAddRound(handleTableAddRound, tableIsEditing);
    }
    return () => setGameDetailsTableAddRound(null, false);
  }, [isTableViewActive, tableIsEditing, handleTableAddRound, setGameDetailsTableAddRound]);

  if (loading && !game) {
    return (
      <AnimatedPresencePanel panelKey="game-details-loading">
        <GameDetailsSkeleton />
      </AnimatedPresencePanel>
    );
  }

  if (!game) {
    if (cancelledGameInfo) {
      return (
        <AnimatedPresencePanel panelKey="game-details-cancelled">
          <GameCancelled
            entityType={cancelledGameInfo.entityType as import('@/types').EntityType}
            name={cancelledGameInfo.name}
            cancelledAt={cancelledGameInfo.cancelledAt}
            cancelledByUser={cancelledGameInfo.cancelledByUser ?? undefined}
            levelSport={cancelledGameInfo.sport ? parseGameSport(cancelledGameInfo.sport) : undefined}
          />
        </AnimatedPresencePanel>
      );
    }
    return (
      <AnimatedPresencePanel panelKey="game-details-not-found">
        <div className="flex items-center justify-center min-h-[calc(100vh-60px)] p-4">
          <Card className="text-center py-12">
            <p className="text-gray-600 dark:text-gray-400">{t('errors.notFound')}</p>
          </Card>
        </div>
      </AnimatedPresencePanel>
    );
  }

  if (variant === 'game' && (game.entityType === 'LEAGUE' || game.entityType === 'LEAGUE_SEASON')) {
    return null;
  }
  if (variant === 'league' && game.entityType !== 'LEAGUE' && game.entityType !== 'LEAGUE_SEASON') {
    return null;
  }

  const isLeague = game.entityType === 'LEAGUE';
  const isLeagueSeason = game.entityType === 'LEAGUE_SEASON';

  const handleTableCellClick = (roundId: string, matchId: string) => {
    if (!tableIsEditing) return;
    setTableSetModal({ roundId, matchId });
  };

  const handleTableScoreSave = async (matchId: string, setIndex: number, teamAScore: number, teamBScore: number, isTieBreak?: boolean) => {
    if (!tableSetModal) return;
    const round = engineRounds.find(r => r.id === tableSetModal.roundId);
    const match = round?.matches.find(m => m.id === matchId);
    if (!match) return;

    const newSets = [...match.sets];
    const fixedNumberOfSets = game.fixedNumberOfSets || 0;
    if (fixedNumberOfSets > 0) {
      while (newSets.length < fixedNumberOfSets && newSets.length <= setIndex) {
        newSets.push({ teamA: 0, teamB: 0, isTieBreak: false, role: 'OFFICIAL' });
      }
    } else {
      while (newSets.length <= setIndex) {
        newSets.push({ teamA: 0, teamB: 0, isTieBreak: false, role: 'OFFICIAL' });
      }
    }
    newSets[setIndex] = {
      ...newSets[setIndex],
      teamA: teamAScore,
      teamB: teamBScore,
      isTieBreak: isTieBreak || false,
    };

    await GameResultsEngine.updateMatch(tableSetModal.roundId, matchId, {
      teamA: match.teamA,
      teamB: match.teamB,
      sets: newSets,
      courtId: match.courtId,
    });
    setTableSetModal(null);
  };

  const renderTableSetModal = () => {
    if (!tableSetModal) return null;
    const round = engineRounds.find(r => r.id === tableSetModal.roundId);
    const match = round?.matches.find(m => m.id === tableSetModal.matchId);
    if (!match) return null;

    const courts = game.gameCourts?.map(gc => gc.court) || [];
    const court = courts.find((c: { id: string }) => c.id === match.courtId);
    const courtSideLabel = court?.name;
    const roundNumber = engineRounds.findIndex((r) => r.id === tableSetModal.roundId) + 1;

    const commonProps = {
      isOpen: true,
      match,
      setIndex: 0,
      players: tablePlayers,
      roundNumber,
      maxTotalPointsPerSet: game.maxTotalPointsPerSet,
      maxPointsPerTeam: game.maxPointsPerTeam,
      fixedNumberOfSets: game.fixedNumberOfSets,
      onSave: handleTableScoreSave,
      onClose: () => setTableSetModal(null),
      canRemove: false,
    };

    const modal = isLandscape ? (
      <SetResultModal
        {...commonProps}
        courtLabel={courtSideLabel}
        ballsInGames={game.ballsInGames || false}
        game={game}
        onRemove={() => {}}
      />
    ) : (
      <HorizontalScoreEntryModal
        {...commonProps}
        ballsInGames={game.ballsInGames || false}
        game={game}
        onRemove={() => {}}
      />
    );

    return createPortal(modal, document.body);
  };

  const renderTabContent = () => {
    if (!isLeagueSeason || activeTab === 'general') {
      return (
        <>
          {user && isLeague && game.hasFixedTeams && (
            <LeagueFixedTeamsSection game={game} />
          )}

          {game.entityType === 'LEAGUE' && game.parentId && (
            <button
              type="button"
              onClick={() => navigate(`/games/${game.parentId}`)}
              className="group mb-3 flex w-full items-center justify-between gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-left text-gray-900 dark:text-white shadow-xs transition-all duration-200 hover:border-primary-300 dark:hover:border-primary-700 hover:bg-primary-50/50 dark:hover:bg-primary-950/30 hover:shadow-md active:scale-[0.99]"
            >
              <span className="flex items-center gap-3 font-normal">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-500 dark:bg-blue-950/40 dark:text-blue-400 transition-transform duration-200 group-hover:scale-105">
                  <Trophy className="h-5 w-5" />
                </span>
                {t('gameDetails.openLeagueSeason')}
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-gray-500 dark:text-gray-400 transition-transform duration-200 group-hover:translate-x-1" />
            </button>
          )}

          <div className="overflow-visible">
            <GameInfo
              game={game}
              isOwner={isOwner}
              isGuest={isGuest}
              courts={courts}
              canEdit={canEdit}
              isEditMode={isEditMode}
              onToggleFavorite={handleToggleFavorite}
              onEditCourt={() => setIsCourtModalOpen(true)}
              onOpenEditGameInfo={(tab) => {
                setEditGameInfoInitialTab(tab ?? 'general');
                setIsEditGameInfoModalOpen(true);
              }}
              collapsedByDefault={game.resultsStatus !== 'NONE'}
              onInviteTrainer={() => {
                setPlayerListMode('trainer');
                setShowPlayerList(true);
              }}
              canInviteTrainer={game.entityType === 'TRAINING' && (isOwner || (game.participants?.some(p => p.userId === user?.id && p.role === 'ADMIN'))) && !game.trainerId && !pendingTrainerParticipant}
              pendingTrainerParticipant={pendingTrainerParticipant}
              onCancelTrainerInvite={isOwner ? handleCancelTrainerInvite : undefined}
            />
          </div>

          <GameLinkedBookingsSection game={game} courts={courts} clubs={clubs} onGameUpdate={setGame} />

          {!(canEdit && game.resultsStatus !== 'FINAL') && (
            <PhotosSection game={game} onGameUpdate={setGame} />
          )}

          {!user && (
            <PublicGamePrompt />
          )}

          {!isLeagueSeason && game.resultsStatus !== 'NONE' && game.entityType !== 'BAR' && game.entityType !== 'TRAINING' && (
            <GameResultsEntryEmbedded game={game} onGameUpdate={setGame} onRoundAdded={(r) => { if (shouldShowRoundAddedModal(r)) { setRoundAddedForModal(r); setRoundAddedModalRoundNumber(undefined); } }} />
          )}

          {!isLeague && game.resultsStatus === 'NONE' && (
            <>
              <GameParticipants
                game={game}
                myInvites={myInvites}
                gameInvites={gameInvites}
                isGuest={isGuest}
                isFull={isFull}
                isOwner={isOwner}
                userId={user?.id}
                isInJoinQueue={isInJoinQueue}
                isUserPlaying={isUserPlaying}
                canInvitePlayers={canInvitePlayers}
                canManageJoinQueue={canManageJoinQueue}
                canViewSettings={canViewSettings}
                onJoin={handleJoin}
                onAddToGame={handleAddToGame}
                onLeave={() => setShowLeaveConfirmation(true)}
                onAcceptInvite={handleAcceptInvite}
                onDeclineInvite={handleDeclineInvite}
                onCancelInvite={handleCancelInvite}
                onAcceptJoinQueue={handleAcceptJoinQueue}
                onDeclineJoinQueue={handleDeclineJoinQueue}
                onCancelJoinQueue={isOwner ? undefined : handleCancelJoinQueue}
                onShowPlayerList={(gender) => {
                  setPlayerListMode('players');
                  setPlayerListGender(gender);
                  setShowPlayerList(true);
                }}
                onShowManageUsers={() => setShowManageUsers(true)}
                onEditMaxParticipants={() => setIsEditMaxParticipantsModalOpen(true)}
              />
            </>
          )}

          {user &&
            game.status !== 'ARCHIVED' &&
            game.resultsStatus === 'NONE' &&
            game.entityType !== 'BAR' &&
            game.entityType !== 'TRAINING' && (
            <GameFormatSection
              key={game.id}
              game={game}
              canEdit={canEditGameFormat}
              onGameUpdate={setGame}
              suppressAllowMultiToggle={isEditMode && canViewSettings}
            />
          )}

          {fixedTeamsManagementVisible(game, user) && (
            <FixedTeamsManagement game={game} onGameUpdate={setGame} />
          )}

          {user && game.entityType === 'LEAGUE_SEASON' && (
            <LeagueSeasonPointsSection game={game} canEdit={canEdit} onGameUpdate={setGame} />
          )}

          {user && game.entityType === 'TRAINING' && game.resultsStatus === 'FINAL' && (
            <TrainingResultsSection
              game={game}
              user={user}
              onUpdateParticipantLevel={handleUpdateParticipantLevel}
              onUndoTraining={handleUndoTraining}
              onReviewSubmitted={async () => {
                const response = await gamesApi.getById(game.id);
                setGame(response.data);
              }}
            />
          )}

          {user && game.entityType === 'BAR' && game.resultsStatus === 'FINAL' && (
            <BarParticipantsList gameId={game.id} participants={game.participants} />
          )}

          {user && <BetSection game={game} onGameUpdate={setGame} />}

          {user && <UserGameNotes gameId={game.id} initialContent={game.userNote} />}

          {user && canViewSettings && !isLeague && (
            <div id="game-settings">
              <GameSettings
                game={game}
                clubs={clubs}
                courts={courts}
                isEditMode={isEditMode}
                isClosingEditMode={isClosingEditMode}
                canEdit={canEdit}
                editFormData={editFormData}
                onEditModeToggle={handleEditModeToggle}
                onSaveChanges={handleSaveChanges}
                onFormDataChange={handleFormDataChange}
                onOpenClubModal={() => setIsClubModalOpen(true)}
                onOpenCourtModal={() => setIsCourtModalOpen(true)}
                onGameUpdate={(updatedGame) => setGame(updatedGame)}
              />
            </div>
          )}

          {user && isLeagueSeason && canEdit && (
            <FaqEdit 
              gameId={game.id} 
              onFaqsChange={handleFaqsChange}
            />
          )}

          {user && game.maxParticipants > 4 && game.resultsStatus === 'NONE' && game.entityType !== 'BAR' && (
            <MultipleCourtsSelector
              gameId={game.id}
              courts={courts}
              selectedClub={game.clubId || ''}
              entityType={game.entityType}
              isEditing={canEdit}
              initialGameCourts={game.gameCourts || []}
              onSave={async () => {
                if (id) {
                  const response = await gamesApi.getById(id);
                  setGame(response.data);
                }
              }}
            />
          )}

          {game.resultsStatus === 'NONE' && game && user && canUserEditResults(game, user) && game.entityType !== 'BAR' && !isLeagueSeason && (
            <Card className="overflow-hidden">
              <button
                onClick={game.entityType === 'TRAINING' ? handleFinishTraining : handleStartResultsEntry}
                className="w-full px-8 py-4 text-base font-semibold rounded-xl transition-all duration-300 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 active:from-green-700 active:to-emerald-800 text-white shadow-lg hover:shadow-2xl hover:shadow-green-500/50 transform hover:scale-[1.01] active:scale-[0.99] relative overflow-hidden group"
              >
                <span className="relative z-10">
                  {game.entityType === 'TRAINING' ? t('training.finishTraining') : t('gameResults.startResultsEntry')}
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
              </button>
            </Card>
          )}

          {user && isParticipant && !isLeague && game.resultsStatus !== 'IN_PROGRESS' && game.resultsStatus !== 'FINAL' && !isGuest && !hasPendingInvite && !isInJoinQueue && (() => {
            const leaveAction = !isUserOwner
              ? isUserPlaying
                ? { tone: 'danger' as const, buttonLabel: t('common.leave'), onClick: () => setShowLeaveConfirmation(true), hint: undefined }
                : { tone: 'danger' as const, buttonLabel: t('gameDetails.leaveChat'), onClick: handleLeaveChat, hint: t(getNotPlayingHintText(game.entityType)) }
              : isUserPlaying
                ? { tone: 'danger' as const, buttonLabel: t('gameDetails.dontPlayInGame'), onClick: handleLeaveGame, hint: undefined }
                : {
                    tone: 'success' as const,
                    buttonLabel: game.status !== 'ARCHIVED' && !isFull ? t('games.playInGame') : undefined,
                    onClick: game.status !== 'ARCHIVED' && !isFull ? handleAddToGame : undefined,
                    hint: t(getOwnerCannotLeaveText(game.entityType)),
                  };
            return (
              <GameActionCard
                icon={LogOut}
                title={t(getLeaveGameText(game?.entityType || 'GAME'))}
                tone={leaveAction.tone}
                buttonLabel={leaveAction.buttonLabel}
                onClick={leaveAction.onClick}
                disabled={isLeaving}
                hint={leaveAction.hint}
              />
            );
          })()}

          {user && canEdit && !isLeague && game.resultsStatus !== 'IN_PROGRESS' && (
            <GameActionCard
              icon={Copy}
              title={t(getDuplicateGameText(game?.entityType || 'GAME'))}
              tone="primary"
              buttonLabel={t('gameDetails.duplicate')}
              onClick={() => {
                const doDuplicate = () => {
                  const gameData = buildDuplicateGameInitialData(game);

                  navigate('/create-game', {
                    state: {
                      entityType: game.entityType,
                      initialGameData: gameData,
                    },
                    replace: true,
                  });
                };
                const authUser = useAuthStore.getState().user;
                if (authUser && authUser.nameIsSet !== true) {
                  runWithProfileName(doDuplicate);
                  return;
                }
                doDuplicate();
              }}
            />
          )}

          {user && canDeleteGame() && (
            <GameActionCard
              icon={Trash2}
              title={t(getDeleteGameText(game?.entityType || 'GAME'))}
              tone="danger"
              buttonLabel={t('common.delete')}
              onClick={() => setShowDeleteConfirmation(true)}
              disabled={isDeleting}
            />
          )}
        </>
      );
    }

    if (user && activeTab === 'schedule') {
      return <LeagueScheduleTab leagueSeasonId={game.id} canEdit={canEdit} hasFixedTeams={game.hasFixedTeams || false} selectedGameChatId={selectedGameChatId} onChatGameSelect={onChatGameSelect} />;
    }

    if (user && isLeagueSeasonParticipant && activeTab === 'planner') {
      return <LeaguePlannerTab leagueSeasonId={game.id} hasFixedTeams={game.hasFixedTeams || false} isVisible />;
    }

    if (user && activeTab === 'standings') {
      return <LeagueStandingsTab leagueSeasonId={game.id} hasFixedTeams={game.hasFixedTeams || false} />;
    }

    if (user && activeTab === 'faq') {
      return <FaqTab gameId={game.id} />;
    }

    return null;
  };

  const shellLevelSport = parseGameSport(game.sport);

  const tabViewKey = isLeagueSeason ? `tab-${activeTab}` : 'tab-general';
  const shellViewKey = effectiveTableView && canViewTournamentTableByAccess(game, user) ? 'table-view' : `content-view-${tabViewKey}`;
  const shouldAnimateStagger = !hasRenderedContentRef.current;
  if (!hasRenderedContentRef.current) {
    hasRenderedContentRef.current = true;
  }

  if (effectiveTableView && canViewTournamentTableByAccess(game, user)) {
    return (
      <SportLevelProvider sport={shellLevelSport}>
      <AnimatedPresencePanel panelKey={shellViewKey}>
      <>
          <ResultsTableView
            game={game}
            rounds={engineRounds}
            players={tablePlayers}
            isEditing={tableIsEditing}
            onAddRound={handleTableAddRound}
            onCellClick={handleTableCellClick}
            onDeleteRound={handleTableDeleteRound}
            onRoundHeaderClick={(round, roundNumber) => {
              if (!shouldShowRoundAddedModal(round)) return;
              setRoundAddedForModal(round);
              setRoundAddedModalRoundNumber(roundNumber);
            }}
          />
        {renderTableSetModal()}
        <RoundAddedModal
          isOpen={!!roundAddedForModal}
          onClose={() => {
            setRoundAddedForModal(null);
            setRoundAddedModalRoundNumber(undefined);
          }}
          round={roundAddedForModal}
          game={game}
          roundNumber={roundAddedModalRoundNumber}
        />
        <div className="hidden" aria-hidden="true">
          <GameResultsEntryEmbedded game={game} onGameUpdate={setGame} onRoundAdded={(r) => { if (shouldShowRoundAddedModal(r)) { setRoundAddedForModal(r); setRoundAddedModalRoundNumber(undefined); } }} />
        </div>
        {declineInviteModal}
      </>
      </AnimatedPresencePanel>
      </SportLevelProvider>
    );
  }

  return (
    <SportLevelProvider sport={shellLevelSport}>
    <>
      <RefreshIndicator
        isRefreshing={isRefreshing}
        pullDistance={pullDistance}
        pullProgress={pullProgress}
      />
      <div
        style={
          pullDistance > 0 || isRefreshing
            ? {
                transform: `translateY(${pullDistance}px)`,
                transition: pullDistance > 0 && !isRefreshing ? 'none' : 'transform 0.3s ease-out',
              }
            : undefined
        }
      >
      <div className="max-w-2xl mx-auto space-y-4 overflow-visible">
        {user && isLeagueSeason && leagueSeasonTabs.length > 0 && (
          <div className="flex justify-center">
            <SegmentedSwitch
              tabs={leagueSeasonTabs}
              activeId={activeTab}
              onChange={(id) => {
                if (id === 'general' || id === 'schedule' || id === 'planner' || id === 'standings' || id === 'faq') {
                  setActiveTab(id);
                  persistLeagueSeasonTabInUrl(id);
                }
              }}
              showOnlyActiveTabText
              layoutId={`leagueSeasonTabs-${game.id}`}
            />
          </div>
        )}

      <AnimatedPresencePanel panelKey={shellViewKey} className="space-y-4">
        {shouldAnimateStagger ? (
          <AnimatedChildrenStagger contentKey={tabViewKey} className="space-y-4">
            {renderTabContent()}
          </AnimatedChildrenStagger>
        ) : (
          <div className="space-y-4">{renderTabContent()}</div>
        )}
      </AnimatedPresencePanel>

      {showPlayerList && id && (
        <PlayerListModal
          gameId={id}
          gameSport={parseGameSport(game?.sport)}
          onClose={() => {
            setShowPlayerList(false);
            setPlayerListMode('players');
            setPlayerListGender(undefined);
          }}
          multiSelect={playerListMode !== 'trainer'}
          inviteAsTrainerOnly={playerListMode === 'trainer'}
          filterGender={playerListMode === 'players' ? playerListGender : undefined}
          onConfirm={async (_playerIds) => {
            if (id) {
              const response = await gamesApi.getById(id);
              setGame(response.data);
              const gameInvitesResponse = await invitesApi.getGameInvites(id);
              setGameInvites(gameInvitesResponse.data);
            }
          }}
        />
      )}

      {showManageUsers && game && (
        <ManageUsersModal
          game={game}
          onClose={() => setShowManageUsers(false)}
          onUserAction={handleUserAction}
        />
      )}

      {isCourtModalOpen && game && courts.length >= 1 && (
        <CourtModal
          isOpen={isCourtModalOpen}
          onClose={() => setIsCourtModalOpen(false)}
          courts={courts}
          selectedId={isEditMode ? editFormData.courtId || 'notBooked' : game.courtId || 'notBooked'}
          onSelect={isEditMode ? (courtId) => handleFormDataChange({courtId: courtId === 'notBooked' ? '' : courtId}) : handleCourtSelect}
          entityType={game.entityType}
        />
      )}

      {isClubModalOpen && (
        <ClubModal
          isOpen={isClubModalOpen}
          onClose={() => setIsClubModalOpen(false)}
          clubs={clubs}
          selectedId={isEditMode ? editFormData.clubId : game?.clubId || ''}
          onSelect={(clubId) => {
            if (isEditMode) {
              handleFormDataChange({clubId, courtId: ''});
              if (clubId) {
                courtsApi.getByClubId(clubId).then(response => {
                  setCourts(response.data);
                }).catch(error => {
                  console.error('Failed to fetch courts:', error);
                });
              }
            }
          }}
        />
      )}

      {isEditGameInfoModalOpen && game && (
        <EditGameInfoModal
          isOpen={isEditGameInfoModalOpen}
          onClose={() => setIsEditGameInfoModalOpen(false)}
          game={game}
          clubs={clubs}
          courts={courts}
          initialTab={editGameInfoInitialTab}
          onGameUpdate={setGame}
          onCourtsChange={handleCourtsChange}
        />
      )}

      <LeaveGameConfirmationModal
        isOpen={showLeaveConfirmation}
        onConfirm={handleLeaveGame}
        onClose={() => setShowLeaveConfirmation(false)}
        isLeaving={isLeaving}
        entityType={game?.entityType || 'GAME'}
      />

      <ConfirmationModal
        isOpen={showDeleteConfirmation}
        title={t('gameDetails.deleteGame')}
        message={t('gameDetails.deleteGameConfirmation')}
        confirmText={t('common.delete')}
        confirmVariant="danger"
        isLoading={isDeleting}
        loadingText={t('common.deleting')}
        closeOnConfirm={false}
        onConfirm={handleDeleteGame}
        onClose={() => setShowDeleteConfirmation(false)}
      />

      {showResetConfirmation && (
        <ConfirmationModal
          isOpen={showResetConfirmation}
          title={t('gameResults.resetGameTitle') || 'Reset Game Results'}
          message={t('gameResults.resetConfirmationMessage') || 'Are you sure you want to reset all game results? This action cannot be undone.'}
          confirmText={t('common.confirm')}
          cancelText={t('common.cancel')}
          confirmVariant="danger"
          onConfirm={handleResetGame}
          onClose={() => setShowResetConfirmation(false)}
        />
      )}

      {showAnnouncedConfirm && (
        <ConfirmationModal
          isOpen={showAnnouncedConfirm}
          title={t('gameResults.confirmAnnouncedGame.title', { defaultValue: 'Game Not Started Yet' })}
          message={t('gameResults.confirmAnnouncedGame.message', { 
            defaultValue: 'This game is still in ANNOUNCED status. Are you sure you want to start entering results now?' 
          })}
          confirmText={t('gameResults.confirmAnnouncedGame.confirm', { defaultValue: 'Yes, Continue' })}
          cancelText={t('common.cancel')}
          confirmVariant="primary"
          onConfirm={proceedWithResultsEntry}
          onClose={() => setShowAnnouncedConfirm(false)}
        />
      )}

      {isEditMaxParticipantsModalOpen && game && (
        <EditMaxParticipantsModal
          isOpen={isEditMaxParticipantsModalOpen}
          game={game}
          onClose={() => setIsEditMaxParticipantsModalOpen(false)}
          onUpdate={(updatedGame) => setGame(updatedGame)}
          onKickUser={async (userId) => {
            if (!id) return;
            const run = async () => {
              await gamesApi.kickUser(id, userId);
            };
            const authUser = useAuthStore.getState().user;
            if (authUser && authUser.nameIsSet !== true) {
              runWithProfileName(() => void run());
              return;
            }
            await run();
          }}
        />
      )}

      <RoundAddedModal
        isOpen={!!roundAddedForModal}
        onClose={() => {
          setRoundAddedForModal(null);
          setRoundAddedModalRoundNumber(undefined);
        }}
        round={roundAddedForModal}
        game={game}
        roundNumber={roundAddedModalRoundNumber}
      />

      </div>
      </div>

      {declineInviteModal}
    </>
    </SportLevelProvider>
  );
};