import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Trash2, LogOut, Copy, HelpCircle } from 'lucide-react';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { RefreshIndicator } from '@/components/RefreshIndicator';
import { clearCachesExceptUnsyncedResults } from '@/utils/cacheUtils';
import {
  Card,
  PlayerListModal,
  ManageUsersModal,
  CourtModal,
  ClubModal,
  GameInfo,
  GameParticipants,
  GameSettings,
  GameSetupModal,
  MultipleCourtsSelector,
  LeagueScheduleTab,
  LeagueStandingsTab,
  ConfirmationModal
} from '@/components';
import { PhotosSection } from '@/components/GameDetails/PhotosSection';
import { BarParticipantsList } from '@/components/GameDetails/BarParticipantsList';
import { LeaveGameConfirmationModal } from '@/components/LeaveGameConfirmationModal';
import { FixedTeamsManagement } from '@/components/GameDetails/FixedTeamsManagement';
import { LeagueFixedTeamsSection } from '@/components/GameDetails/LeagueFixedTeamsSection';
import { GameSetup } from '@/components/GameDetails/GameSetup';
import { FaqTab } from '@/components/GameDetails/FaqTab';
import { FaqEdit } from '@/components/GameDetails/FaqEdit';
import { EditMaxParticipantsModal } from '@/components/EditMaxParticipantsModal';
import { LocationModal, TimeDurationModal } from '@/components/GameDetails';
import { GameResultsEntryEmbedded } from '@/components/GameDetails/GameResultsEntryEmbedded';
import { TrainingResultsSection } from '@/components/GameDetails/TrainingResultsSection';
import { PublicGamePrompt } from '@/components/GameDetails/PublicGamePrompt';
import { BetSection } from '@/components/GameDetails/BetSection';
import { gamesApi, invitesApi, courtsApi, clubsApi } from '@/api';
import { favoritesApi } from '@/api/favorites';
import { resultsApi } from '@/api/results';
import { trainingApi } from '@/api/training';
import { faqApi } from '@/api/faq';
import { useAuthStore } from '@/store/authStore';
import { useNavigationStore } from '@/store/navigationStore';
import { useSocketEventsStore } from '@/store/socketEventsStore';
import { Game, Invite, Court, Club, GenderTeam, GameType } from '@/types';
import { Round } from '@/types/gameResults';
import { isUserGameAdminOrOwner, canUserEditResults } from '@/utils/gameResults';
import { getGameParticipationState } from '@/utils/gameParticipationState';
import { socketService } from '@/services/socketService';
import { applyGameTypeTemplate } from '@/utils/gameTypeTemplates';
import { GameResultsEngine, useGameResultsStore } from '@/services/gameResultsEngine';

type GameWithResults = Game & {
  rounds?: Round[];
};

interface GameDetailsContentProps {
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
}

export const GameDetailsContent = ({ scrollContainerRef }: GameDetailsContentProps) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const { setGameDetailsCanAccessChat, setBottomTabsVisible } = useNavigationStore();

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
  const [showLeaveConfirmation, setShowLeaveConfirmation] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [isGameSetupModalOpen, setIsGameSetupModalOpen] = useState(false);
  const [isEditMaxParticipantsModalOpen, setIsEditMaxParticipantsModalOpen] = useState(false);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [isTimeDurationModalOpen, setIsTimeDurationModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'schedule' | 'standings' | 'faq'>('general');
  const [hasFaqs, setHasFaqs] = useState(false);
  const [showResetConfirmation, setShowResetConfirmation] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [showAnnouncedConfirm, setShowAnnouncedConfirm] = useState(false);

  const handleFaqsChange = useCallback((hasFaqs: boolean) => {
    setHasFaqs(hasFaqs);
  }, []);
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
    genderTeams: 'ANY' as GenderTeam,
    gameType: 'CLASSIC' as GameType,
    description: '',
    pointsPerWin: 0,
    pointsPerLoose: 0,
    pointsPerTie: 0,
  });

  useEffect(() => {
    const fetchGame = async () => {
      if (!id) return;

      setGame(null);
      setMyInvites([]);
      setGameInvites([]);
      setLoading(true);

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

      } catch (error) {
        console.error('Failed to fetch game:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchGame();
  }, [id, user]);

  const leagueSeasonTab = (location.state as { leagueSeasonTab?: 'general' | 'schedule' | 'standings' | 'faq' })?.leagueSeasonTab;
  useEffect(() => {
    if (leagueSeasonTab && game?.entityType === 'LEAGUE_SEASON') {
      setActiveTab(leagueSeasonTab);
    }
  }, [id, leagueSeasonTab, game?.entityType]);

  const lastInviteDeleted = useSocketEventsStore((state) => state.lastInviteDeleted);
  const lastGameUpdate = useSocketEventsStore((state) => state.lastGameUpdate);

  useEffect(() => {
    if (!id) return;
    socketService.joinGameRoom(id);
    return () => {
      socketService.leaveGameRoom(id);
    };
  }, [id]);

  useEffect(() => {
    if (!lastInviteDeleted) return;
    if (lastInviteDeleted.gameId === id || !lastInviteDeleted.gameId) {
      setMyInvites(prev => prev.filter(inv => inv.id !== lastInviteDeleted.inviteId));
      setGameInvites(prev => prev.filter(inv => inv.id !== lastInviteDeleted.inviteId));
    }
  }, [lastInviteDeleted, id]);

  useEffect(() => {
    if (!lastGameUpdate || lastGameUpdate.gameId !== id || lastGameUpdate.senderId === user?.id) return;
    const updatedGame = lastGameUpdate.game;
    setGame((prevGame) => {
      if (!prevGame) return updatedGame;
      
      if (prevGame.resultsStatus === 'FINAL' && updatedGame.resultsStatus === 'FINAL') {
        const prevGameWithResults = prevGame as GameWithResults;
        const updatedGameWithResults = updatedGame as GameWithResults;
        return {
          ...updatedGame,
          rounds: (updatedGameWithResults.rounds && updatedGameWithResults.rounds.length > 0) 
            ? updatedGameWithResults.rounds 
            : (prevGameWithResults.rounds || updatedGameWithResults.rounds),
          outcomes: (updatedGame.outcomes && updatedGame.outcomes.length > 0)
            ? updatedGame.outcomes
            : (prevGame.outcomes || updatedGame.outcomes),
        };
      }
      
      if (prevGame.hasFixedTeams && prevGame.fixedTeams && prevGame.fixedTeams.length > 0) {
        if (!updatedGame.fixedTeams || updatedGame.fixedTeams.length === 0) {
          return {
            ...updatedGame,
            fixedTeams: prevGame.fixedTeams,
          };
        }
      }
      
      return updatedGame;
    });
  }, [lastGameUpdate, id, user?.id]);

  // Update GameResultsEngine when game state changes (e.g., after finishing)
  useEffect(() => {
    if (game && user?.id) {
      const engineState = GameResultsEngine.getState();
      // Only update if engine is initialized for this game
      if (engineState.initialized && engineState.gameId === game.id && engineState.userId === user.id) {
        // Check if game status has changed
        const engineGame = engineState.game;
        if (!engineGame || 
            engineGame.resultsStatus !== game.resultsStatus ||
            engineGame.status !== game.status) {
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
    if (scrollContainerRef?.current) {
      scrollContainerRef.current.scrollTop = 0;
    } else {
      window.scrollTo(0, 0);
    }
  }, [id, scrollContainerRef]);

  useEffect(() => {
    if (!id || !isEditMode || !game) return;
    if (editFormData.gameType === game.gameType) return;
    
    const template = applyGameTypeTemplate(editFormData.gameType);
    gamesApi.update(id, { 
      winnerOfMatch: template.winnerOfMatch,
      winnerOfGame: template.winnerOfGame,
      matchGenerationType: template.matchGenerationType,
      pointsPerWin: template.pointsPerWin ?? 0,
      pointsPerLoose: template.pointsPerLoose ?? 0,
      pointsPerTie: template.pointsPerTie ?? 0,
      ballsInGames: template.ballsInGames ?? false,
      fixedNumberOfSets: template.fixedNumberOfSets ?? 0
    }).catch(error => {
      console.error('Failed to update game template settings:', error);
    });
  }, [editFormData.gameType, isEditMode, id, game]);

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
        genderTeams: (game.genderTeams || 'ANY') as 'ANY' | 'MEN' | 'WOMEN' | 'MIX_PAIRS',
        gameType: (game.gameType || 'CLASSIC') as GameType,
        description: game.description || '',
        pointsPerWin: game.pointsPerWin ?? 0,
        pointsPerLoose: game.pointsPerLoose ?? 0,
        pointsPerTie: game.pointsPerTie ?? 0,
      });
    }
  }, [game]);

  const handleJoin = async () => {
    if (!id) return;

    try {
      const response = await gamesApi.join(id);
      const message = (response as any).message || 'Successfully joined the game';
      
      if (message === 'games.addedToJoinQueue') {
        toast.success(t('games.addedToJoinQueue', { defaultValue: 'Added to join queue' }));
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

    try {
      await gamesApi.togglePlayingStatus(id, 'PLAYING');
      const response = await gamesApi.getById(id);
      setGame(response.data);
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    }
  };

  const handleAcceptInvite = async (inviteId: string) => {
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

  const handleDeclineInvite = async (inviteId: string) => {
    try {
      await invitesApi.decline(inviteId);
      setMyInvites(myInvites.filter((inv) => inv.id !== inviteId));
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    }
  };

  const handleCancelInvite = async (inviteId: string) => {
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
  const { isGuest, isParticipantNonGuest: isParticipant, isPlaying: isUserPlaying, isOwner: isUserOwner, isInJoinQueue, hasPendingInvite, isAdminOrOwner: isOwner, isFull } = participation;
  const canAccessChat = true;
  const canEdit = isOwner || user?.isAdmin || false;
  const canViewSettings = game?.resultsStatus === 'NONE' && canEdit && game.status !== 'ARCHIVED';

  useEffect(() => {
    setGameDetailsCanAccessChat(canAccessChat);
  }, [canAccessChat, setGameDetailsCanAccessChat]);


  const pendingTrainerParticipant = game?.entityType === 'TRAINING' && !game.trainerId
    ? game.participants?.find(p => p.status === 'INVITED' && p.role === 'ADMIN')
    : undefined;
  const pendingTrainerInvite = pendingTrainerParticipant
    ? gameInvites.find(inv => inv.receiverId === pendingTrainerParticipant.userId && inv.status === 'PENDING')
    : undefined;

  const canInvitePlayers = Boolean((isOwner || (game?.anyoneCanInvite && isParticipant)) && !isFull);
  const canManageJoinQueue = Boolean(
    isOwner ||
    participation.userParticipant?.role === 'ADMIN' ||
    (game?.anyoneCanInvite && participation.isPlaying)
  );

  const handleAcceptJoinQueue = async (queueUserId: string) => {
    if (!id) return;

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
    
    // Scroll to top immediately
    window.scrollTo({ top: 0, behavior: 'smooth' });

    try {
      console.log('handleStartResultsEntry');
      await gamesApi.update(id, { resultsStatus: 'IN_PROGRESS' });
      const response = await gamesApi.getById(id);
      const updatedGame = response.data;
      setGame(updatedGame);
      
      // Initialize engine if needed
      const engineState = GameResultsEngine.getState();
      const needsInit = !engineState.initialized || engineState.gameId !== id || engineState.userId !== user.id;
      
      if (needsInit) {
        await GameResultsEngine.initialize(id, user.id, t);
      }
      
      // Update engine with latest game data
      GameResultsEngine.updateGame(updatedGame);
      
      // Get current state after update
      const currentState = GameResultsEngine.getState();
      
      console.log('currentState', currentState);

      // Ensure gameId and userId are set before calling addRound
      if (!currentState.gameId || !currentState.userId) {
        useGameResultsStore.setState({
          gameId: id,
          userId: user.id,
        });
      }

      // If no rounds exist, add the first round (same as "Add Round" button)
      if (currentState.rounds.length === 0 && currentState.canEdit && currentState.game) {
        console.log('adding round');
        await GameResultsEngine.addRound();
        
        // Ensure the engine is marked as initialized so the embedded component
        // won't re-initialize and overwrite our newly added round
        const finalState = GameResultsEngine.getState();
        if (!finalState.initialized || finalState.gameId !== id || finalState.userId !== user.id) {
          useGameResultsStore.setState({
            initialized: true,
            gameId: id,
            userId: user.id,
          });
        }
      }
      
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
        toast.success(t('game.ownershipTransferred') || 'Ownership transferred successfully');
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

  const handleLocationSave = async (data: { clubId: string; courtId: string; hasBookedCourt: boolean }) => {
    if (!id) return;

    try {
      const updateData: Partial<Game> = {
        clubId: data.clubId || undefined,
        courtId: data.courtId || undefined,
        hasBookedCourt: data.hasBookedCourt,
      };

      await gamesApi.update(id, updateData);
      
      if (data.clubId && data.clubId !== game?.clubId) {
        const response = await courtsApi.getByClubId(data.clubId);
        setCourts(response.data);
      }
      
      const response = await gamesApi.getById(id);
      setGame(response.data);
      
      toast.success(game?.entityType === 'BAR' ? t('gameDetails.hallUpdated') : t('gameDetails.courtUpdated'));
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
      throw error;
    }
  };

  const handleTimeDurationSave = async (data: { startTime: Date; endTime: Date }) => {
    if (!id) return;

    try {
      const updateData: Partial<Game> = {
        startTime: data.startTime.toISOString(),
        endTime: data.endTime.toISOString(),
        timeIsSet: true,
      };

      await gamesApi.update(id, updateData);
      
      const response = await gamesApi.getById(id);
      setGame(response.data);
      
      toast.success(t('gameDetails.timeUpdated'));
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
      throw error;
    }
  };

  const handleCourtsChange = useCallback((newCourts: Court[]) => {
    setCourts(newCourts);
  }, []);

  const handleScrollToSettings = () => {
    const settingsElement = document.getElementById('game-settings');
    if (settingsElement) {
      const elementTop = settingsElement.getBoundingClientRect().top + window.pageYOffset;
      const offset = 60;
      window.scrollTo({ top: elementTop - offset, behavior: 'smooth' });
    }
  };

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
    } catch (error) {
      console.error('Failed to refresh game:', error);
    }
  }, [id, user]);

  const { isRefreshing, pullDistance, pullProgress } = usePullToRefresh({
    onRefresh: handleRefresh,
    disabled: loading,
  });

  const handleCourtSelect = async (courtId: string) => {
    if (!id) return;

    try {
      const updateData: Partial<Game> = {};
      
      if (courtId === 'notBooked') {
        updateData.courtId = undefined;
      } else {
        updateData.courtId = courtId;
      }

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
          genderTeams: (game.genderTeams || 'ANY') as GenderTeam,
          gameType: (game.gameType || 'CLASSIC') as GameType,
          description: game.description || '',
          pointsPerWin: game.pointsPerWin ?? 0,
          pointsPerLoose: game.pointsPerLoose ?? 0,
          pointsPerTie: game.pointsPerTie ?? 0,
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
        updateData.gameType = editFormData.gameType;
        updateData.pointsPerWin = editFormData.pointsPerWin;
        updateData.pointsPerLoose = editFormData.pointsPerLoose;
        updateData.pointsPerTie = editFormData.pointsPerTie;
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
    setEditFormData({...editFormData, ...data});
  };

  const handleGameSetupConfirm = async (params: {
    fixedNumberOfSets: number;
    maxTotalPointsPerSet: number;
    maxPointsPerTeam: number;
    winnerOfGame: any;
    winnerOfMatch: any;
    matchGenerationType: any;
    prohibitMatchesEditing?: boolean;
    pointsPerWin: number;
    pointsPerLoose: number;
    pointsPerTie: number;
    ballsInGames: boolean;
  }) => {
    if (!id) return;

    try {
      await gamesApi.update(id, params);
      const response = await gamesApi.getById(id);
      setGame(response.data);
      toast.success(t('gameResults.setupUpdated'));
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    }
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-60px)]">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">{t('app.loading')}</p>
        </div>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-60px)] p-4">
        <Card className="text-center py-12">
          <p className="text-gray-600 dark:text-gray-400">{t('errors.notFound')}</p>
        </Card>
      </div>
    );
  }

  const isLeague = game.entityType === 'LEAGUE';
  const isLeagueSeason = game.entityType === 'LEAGUE_SEASON';

  const renderTabContent = () => {
    if (!isLeagueSeason || activeTab === 'general') {
      return (
        <>
          {user && isLeague && game.hasFixedTeams && (
            <LeagueFixedTeamsSection game={game} />
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
              onOpenLocationModal={() => setIsLocationModalOpen(true)}
              onOpenTimeDurationModal={() => setIsTimeDurationModalOpen(true)}
              onScrollToSettings={handleScrollToSettings}
              onGameUpdate={setGame}
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

          {!(canEdit && game.resultsStatus !== 'FINAL') && (
            <PhotosSection game={game} onGameUpdate={setGame} />
          )}

          {!user && (
            <PublicGamePrompt />
          )}

          {!isLeagueSeason && game.resultsStatus !== 'NONE' && game.entityType !== 'BAR' && game.entityType !== 'TRAINING' && (
            <GameResultsEntryEmbedded game={game} onGameUpdate={setGame} />
          )}

          {!isLeague && game.resultsStatus === 'NONE' && (
            <>
              <GameParticipants
                game={game}
                myInvites={myInvites}
                gameInvites={gameInvites}
                isParticipant={isParticipant}
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

          {user && game.entityType === 'TRAINING' && game.resultsStatus === 'FINAL' && (
            <TrainingResultsSection
              game={game}
              user={user}
              onUpdateParticipantLevel={handleUpdateParticipantLevel}
              onUndoTraining={handleUndoTraining}
            />
          )}

          {user && game.entityType === 'BAR' && game.resultsStatus === 'FINAL' && (
            <BarParticipantsList gameId={game.id} participants={game.participants} />
          )}

          {user && <BetSection game={game} onGameUpdate={setGame} />}

          {user && !isLeague && canViewSettings && (
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

          {user && !isLeague && canViewSettings && game.entityType !== 'BAR' && game.entityType !== 'TRAINING' && (
            <GameSetup
              onOpenSetup={() => setIsGameSetupModalOpen(true)}
              canEdit={canEdit}
            />
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

          {user && !isLeague && game.hasFixedTeams && (
            <FixedTeamsManagement
              key={`fixed-teams-${game.id}`}
              game={game}
              onGameUpdate={(updatedGame) => {
                setGame(prevGame => prevGame ? { ...prevGame, ...updatedGame } : updatedGame);
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

          {user && isParticipant && !isLeague && game.resultsStatus !== 'IN_PROGRESS' && game.resultsStatus !== 'FINAL' && !isGuest && !hasPendingInvite && !isInJoinQueue && (
            <Card>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <LogOut size={18} className="text-gray-500 dark:text-gray-400" />
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                      {t(getLeaveGameText(game?.entityType || 'GAME'))}
                    </h2>
                  </div>
                  {!isUserOwner ? (
                    <>
                      {isUserPlaying ? (
                        <button
                          onClick={() => setShowLeaveConfirmation(true)}
                          disabled={isLeaving}
                          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {t('common.leave')}
                        </button>
                      ) : (
                        <button
                          onClick={handleLeaveChat}
                          disabled={isLeaving}
                          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {t('gameDetails.leaveChat')}
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      {isUserPlaying ? (
                        <button
                          onClick={handleLeaveGame}
                          disabled={isLeaving}
                          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {t('gameDetails.dontPlayInGame')}
                        </button>
                      ) : game.status !== 'ARCHIVED' && !isFull && (
                        <button
                          onClick={handleAddToGame}
                          disabled={isLeaving}
                          className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {t('games.playInGame')}
                        </button>
                      )}
                    </>
                  )}
                </div>
                {!isUserOwner && !isUserPlaying && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 whitespace-pre-line">
                    {game && t(getNotPlayingHintText(game.entityType))}
                  </p>
                )}
                {isUserOwner && !isUserPlaying && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 whitespace-pre-line">
                    {game && t(getOwnerCannotLeaveText(game.entityType))}
                  </p>
                )}
              </div>
            </Card>
          )}

          {user && canEdit && !isLeague && game.resultsStatus !== 'IN_PROGRESS' && (
            <Card>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Copy size={18} className="text-gray-500 dark:text-gray-400" />
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    {t(getDuplicateGameText(game?.entityType || 'GAME'))}
                  </h2>
                </div>
                <button
                  onClick={() => {
                    const gameData: Partial<Game> = {
                      entityType: game.entityType,
                      gameType: game.gameType,
                      name: game.name,
                      description: game.description,
                      clubId: game.clubId,
                      courtId: game.courtId,
                      startTime: game.startTime,
                      endTime: game.endTime,
                      maxParticipants: game.maxParticipants,
                      minParticipants: game.minParticipants,
                      minLevel: game.minLevel,
                      maxLevel: game.maxLevel,
                      isPublic: game.isPublic,
                      affectsRating: game.affectsRating,
                      anyoneCanInvite: game.anyoneCanInvite,
                      resultsByAnyone: game.resultsByAnyone,
                      allowDirectJoin: game.allowDirectJoin,
                      hasBookedCourt: game.hasBookedCourt,
                      afterGameGoToBar: game.afterGameGoToBar,
                      hasFixedTeams: game.hasFixedTeams,
                      genderTeams: game.genderTeams,
                      priceTotal: game.priceTotal,
                      priceType: game.priceType,
                      priceCurrency: game.priceCurrency,
                      fixedNumberOfSets: game.fixedNumberOfSets,
                      maxTotalPointsPerSet: game.maxTotalPointsPerSet,
                      maxPointsPerTeam: game.maxPointsPerTeam,
                      winnerOfGame: game.winnerOfGame,
                      winnerOfMatch: game.winnerOfMatch,
                      matchGenerationType: game.matchGenerationType,
                      prohibitMatchesEditing: game.prohibitMatchesEditing,
                      pointsPerWin: game.pointsPerWin,
                      pointsPerLoose: game.pointsPerLoose,
                      pointsPerTie: game.pointsPerTie,
                      ballsInGames: game.ballsInGames,
                      gameCourts: game.gameCourts,
                    };
                    
                    if (game.entityType === 'LEAGUE_SEASON') {
                      if (game.parentId) {
                        gameData.parentId = game.parentId;
                      } else if (game.leagueSeason?.league?.id) {
                        gameData.parentId = game.leagueSeason?.league?.id;
                      }
                    }
                    
                    navigate('/create-game', {
                      state: {
                        entityType: game.entityType,
                        initialGameData: gameData,
                      },
                      replace: true,
                    });
                  }}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
                >
                  {t('gameDetails.duplicate')}
                </button>
              </div>
            </Card>
          )}

          {user && canDeleteGame() && (
            <Card>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Trash2 size={18} className="text-gray-500 dark:text-gray-400" />
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    {t(getDeleteGameText(game?.entityType || 'GAME'))}
                  </h2>
                </div>
                <button
                  onClick={() => setShowDeleteConfirmation(true)}
                  disabled={isDeleting}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('common.delete')}
                </button>
              </div>
            </Card>
          )}
        </>
      );
    }

    if (user && activeTab === 'schedule') {
      return <LeagueScheduleTab leagueSeasonId={game.id} canEdit={canEdit} hasFixedTeams={game.hasFixedTeams || false} activeTab={activeTab} />;
    }

    if (user && activeTab === 'standings') {
      return <LeagueStandingsTab leagueSeasonId={game.id} hasFixedTeams={game.hasFixedTeams || false} />;
    }

    if (user && activeTab === 'faq') {
      return <FaqTab gameId={game.id} />;
    }

    return null;
  };

  return (
    <>
      <RefreshIndicator
        isRefreshing={isRefreshing}
        pullDistance={pullDistance}
        pullProgress={pullProgress}
      />
      <div
        style={{
          transform: `translateY(${pullDistance}px)`,
          transition: pullDistance > 0 && !isRefreshing ? 'none' : 'transform 0.3s ease-out',
        }}
      >
      <div className="max-w-2xl mx-auto space-y-4 overflow-visible">
        {user && isLeagueSeason && (
        <div className="flex border-b border-gray-200 dark:border-gray-700 rounded-xl">
          <button
            onClick={() => setActiveTab('general')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'general'
                ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-600 dark:border-primary-400'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            {t('gameDetails.general')}
          </button>
          <button
            onClick={() => setActiveTab('schedule')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'schedule'
                ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-600 dark:border-primary-400'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            {t('gameDetails.schedule')}
          </button>
          <button
            onClick={() => setActiveTab('standings')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'standings'
                ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-600 dark:border-primary-400'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            {t('gameDetails.standings')}
          </button>
          {hasFaqs && (
            <button
              onClick={() => setActiveTab('faq')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                activeTab === 'faq'
                  ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-600 dark:border-primary-400'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <HelpCircle size={16} />
              {t('gameDetails.faq', { defaultValue: 'FAQ' })}
            </button>
          )}
        </div>
      )}

      {renderTabContent()}

      {showPlayerList && id && (
        <PlayerListModal
          gameId={id}
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

      {isLocationModalOpen && game && (
        <LocationModal
          isOpen={isLocationModalOpen}
          onClose={() => setIsLocationModalOpen(false)}
          game={game}
          clubs={clubs}
          courts={courts}
          onSave={handleLocationSave}
          onCourtsChange={handleCourtsChange}
        />
      )}

      {isTimeDurationModalOpen && game && (
        <TimeDurationModal
          isOpen={isTimeDurationModalOpen}
          onClose={() => setIsTimeDurationModalOpen(false)}
          game={game}
          clubs={clubs}
          onSave={handleTimeDurationSave}
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

      {isGameSetupModalOpen && (
        <GameSetupModal
          isOpen={isGameSetupModalOpen}
          entityType={game.entityType}
          isEditing={canEdit}
          confirmButtonText={canEdit ? t('common.save') : undefined}
          initialValues={{
            fixedNumberOfSets: game.fixedNumberOfSets,
            maxTotalPointsPerSet: game.maxTotalPointsPerSet,
            maxPointsPerTeam: game.maxPointsPerTeam,
            winnerOfGame: game.winnerOfGame,
            winnerOfMatch: game.winnerOfMatch,
            matchGenerationType: game.matchGenerationType,
            prohibitMatchesEditing: game.prohibitMatchesEditing,
            pointsPerWin: game.pointsPerWin,
            pointsPerLoose: game.pointsPerLoose,
            pointsPerTie: game.pointsPerTie,
            ballsInGames: game.ballsInGames,
          }}
          onClose={() => setIsGameSetupModalOpen(false)}
          onConfirm={handleGameSetupConfirm}
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
            await gamesApi.kickUser(id, userId);
          }}
        />
      )}
      </div>
      </div>
    </>
  );
};