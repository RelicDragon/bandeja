import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Trash2, LogOut, Copy, HelpCircle } from 'lucide-react';
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
import { DeleteGameConfirmationModal } from '@/components/DeleteGameConfirmationModal';
import { LeaveGameConfirmationModal } from '@/components/LeaveGameConfirmationModal';
import { FixedTeamsManagement } from '@/components/GameDetails/FixedTeamsManagement';
import { LeagueFixedTeamsSection } from '@/components/GameDetails/LeagueFixedTeamsSection';
import { GameSetup } from '@/components/GameDetails/GameSetup';
import { FaqTab } from '@/components/GameDetails/FaqTab';
import { FaqEdit } from '@/components/GameDetails/FaqEdit';
import { EditMaxParticipantsModal } from '@/components/EditMaxParticipantsModal';
import { LocationModal, TimeDurationModal } from '@/components/GameDetails';
import { GameResultsEntryEmbedded } from '@/components/GameDetails/GameResultsEntryEmbedded';
import { gamesApi, invitesApi, courtsApi, clubsApi } from '@/api';
import { favoritesApi } from '@/api/favorites';
import { resultsApi } from '@/api/results';
import { faqApi } from '@/api/faq';
import { useAuthStore } from '@/store/authStore';
import { useNavigationStore } from '@/store/navigationStore';
import { Game, Invite, Court, Club, GenderTeam, GameType } from '@/types';
import { isUserGameAdminOrOwner, canUserEditResults } from '@/utils/gameResults';
import { socketService } from '@/services/socketService';
import { applyGameTypeTemplate } from '@/utils/gameTypeTemplates';
import { GameResultsEngine, useGameResultsStore } from '@/services/gameResultsEngine';

export const GameDetailsContent = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const { setGameDetailsCanAccessChat } = useNavigationStore();

  const [game, setGame] = useState<Game | null>(null);
  const [myInvites, setMyInvites] = useState<Invite[]>([]);
  const [gameInvites, setGameInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPlayerList, setShowPlayerList] = useState(false);
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

      try {
        const response = await gamesApi.getById(id);
        setGame(response.data);

        const myInvitesResponse = await invitesApi.getMyInvites('PENDING');
        const gameMyInvites = myInvitesResponse.data.filter((inv) => inv.gameId === id);
        setMyInvites(gameMyInvites);

        const isParticipant = response.data.participants.some((p) => p.userId === user?.id);
        if (isParticipant) {
          const gameInvitesResponse = await invitesApi.getGameInvites(id);
          setGameInvites(gameInvitesResponse.data);
        }

        if (response.data.entityType === 'LEAGUE_SEASON') {
          try {
            const faqsResponse = await faqApi.getGameFaqs(id);
            setHasFaqs(faqsResponse.data.length > 0);
          } catch (error) {
            console.error('Failed to fetch FAQs:', error);
            setHasFaqs(false);
          }
        }
      } catch (error) {
        console.error('Failed to fetch game:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchGame();
  }, [id, user?.id]);

  useEffect(() => {
    const handleInviteDeleted = (data: { inviteId: string; gameId?: string }) => {
      if (data.gameId === id || !data.gameId) {
        setMyInvites(prev => prev.filter(inv => inv.id !== data.inviteId));
        setGameInvites(prev => prev.filter(inv => inv.id !== data.inviteId));
      }
    };

    const handleGameUpdated = (data: { gameId: string; senderId: string; game: any }) => {
      if (data.gameId === id && data.senderId !== user?.id) {
        const updatedGame = data.game;
        setGame(updatedGame);
      }
    };

    socketService.on('invite-deleted', handleInviteDeleted);
    socketService.on('game-updated', handleGameUpdated);

    return () => {
      socketService.off('invite-deleted', handleInviteDeleted);
      socketService.off('game-updated', handleGameUpdated);
    };
  }, [id, user?.id]);

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
      toast.success(t(message, { defaultValue: message }));
      const gameResponse = await gamesApi.getById(id);
      setGame(gameResponse.data);
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    }
  };

  const handleLeave = async () => {
    if (!id) return;

    try {
      await gamesApi.togglePlayingStatus(id, false);
      const response = await gamesApi.getById(id);
      setGame(response.data);
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    }
  };

  const handleAddToGame = async () => {
    if (!id) return;

    try {
      await gamesApi.togglePlayingStatus(id, true);
      const response = await gamesApi.getById(id);
      setGame(response.data);
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    }
  };

  const handleAcceptInvite = async (inviteId: string) => {
    try {
      await invitesApi.accept(inviteId);
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

  const isParticipant = game?.participants.some((p) => p.userId === user?.id) || false;
  const userParticipant = game?.participants.find((p) => p.userId === user?.id);
  const isUserPlaying = userParticipant?.isPlaying || false;
  const isUserOwner = userParticipant?.role === 'OWNER';
  const hasPendingInvite = myInvites.length > 0;
  const isGuest = game?.participants.some(p => p.userId === user?.id && !p.isPlaying && p.role !== 'OWNER' && p.role !== 'ADMIN') || false;
  const isInJoinQueue = game?.joinQueues?.some(q => q.userId === user?.id && q.status === 'PENDING') || false;
  const canAccessChat = isParticipant || hasPendingInvite || isGuest || game?.isPublic || false;
  
  const isOwner = game && user ? isUserGameAdminOrOwner(game, user.id) : false;
  const canEdit = isOwner || user?.isAdmin || false;
  const canViewSettings = game?.resultsStatus === 'NONE' && canEdit && game.status !== 'ARCHIVED';
  const isFull = game ? game.entityType !== 'BAR' && game.participants.filter(p => p.isPlaying).length >= game.maxParticipants : false;

  useEffect(() => {
    setGameDetailsCanAccessChat(canAccessChat);
  }, [canAccessChat, setGameDetailsCanAccessChat]);


  const canInvitePlayers = Boolean((isOwner || (game?.anyoneCanInvite && isParticipant)) && !isFull);
  const canManageJoinQueue = Boolean(
    isOwner || 
    (game?.participants.some(p => p.userId === user?.id && p.role === 'ADMIN')) ||
    (game?.anyoneCanInvite && game?.participants.some(p => p.userId === user?.id && p.isPlaying))
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


  const handleStartResultsEntry = async () => {
    if (!id || !user?.id || !game) return;
    
    const canEditResults = canUserEditResults(game, user);
    if (!canEditResults) return;

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
        window.location.reload();
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
      settingsElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

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
        courtId: editFormData.courtId || undefined,
        name: editFormData.name || undefined,
        isPublic: editFormData.isPublic,
        affectsRating: editFormData.affectsRating,
        anyoneCanInvite: editFormData.anyoneCanInvite,
        resultsByAnyone: editFormData.resultsByAnyone,
        allowDirectJoin: editFormData.allowDirectJoin,
        hasBookedCourt: editFormData.hasBookedCourt,
        afterGameGoToBar: editFormData.afterGameGoToBar,
        hasFixedTeams: game?.maxParticipants === 2 ? false : editFormData.hasFixedTeams,
        gameType: editFormData.gameType,
        description: editFormData.description,
        pointsPerWin: editFormData.pointsPerWin,
        pointsPerLoose: editFormData.pointsPerLoose,
        pointsPerTie: editFormData.pointsPerTie,
      };

      updateData.genderTeams = editFormData.genderTeams;

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

  const handleLeaveGame = async () => {
    if (!id || isLeaving) return;
    
    setIsLeaving(true);
    try {
      await gamesApi.togglePlayingStatus(id, false);
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
          {isLeague && game.hasFixedTeams && (
            <LeagueFixedTeamsSection game={game} />
          )}

          <div className="overflow-visible pt-10 -mt-10">
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
            />
          </div>

          {!(canEdit && game.resultsStatus !== 'FINAL') && (
            <PhotosSection game={game} onGameUpdate={setGame} />
          )}

          {!isLeagueSeason && game.resultsStatus !== 'NONE' && (
            <GameResultsEntryEmbedded game={game} onGameUpdate={setGame} />
          )}

          {!isLeague && game.resultsStatus === 'NONE' && (
            <>
              <GameParticipants
                game={game}
                myInvites={myInvites}
                gameInvites={gameInvites}
                joinQueues={game.joinQueues}
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
                onLeave={handleLeave}
                onAcceptInvite={handleAcceptInvite}
                onDeclineInvite={handleDeclineInvite}
                onCancelInvite={handleCancelInvite}
                onAcceptJoinQueue={handleAcceptJoinQueue}
                onDeclineJoinQueue={handleDeclineJoinQueue}
                onShowPlayerList={(gender) => {
                  setPlayerListGender(gender);
                  setShowPlayerList(true);
                }}
                onShowManageUsers={() => setShowManageUsers(true)}
                onEditMaxParticipants={() => setIsEditMaxParticipantsModalOpen(true)}
              />
            </>
          )}

          {!isLeague && canViewSettings && (
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

          {!isLeague && canViewSettings && (
            <GameSetup
              onOpenSetup={() => setIsGameSetupModalOpen(true)}
              canEdit={canEdit}
            />
          )}

          {isLeagueSeason && canEdit && (
            <FaqEdit 
              gameId={game.id} 
              onFaqsChange={(hasFaqs) => setHasFaqs(hasFaqs)}
            />
          )}

          {game.maxParticipants > 4 && game.resultsStatus === 'NONE' && (
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

          {!isLeague && game.hasFixedTeams && (
            <FixedTeamsManagement
              key={`fixed-teams-${game.id}`}
              game={game}
              onGameUpdate={(updatedGame) => {
                setGame(prevGame => prevGame ? { ...prevGame, ...updatedGame } : updatedGame);
              }}
            />
          )}

          {game.resultsStatus === 'NONE' && game && user && canUserEditResults(game, user) && (
            <Card className="overflow-hidden">
              <button
                onClick={handleStartResultsEntry}
                className="w-full px-8 py-4 text-base font-semibold rounded-xl transition-all duration-300 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 active:from-green-700 active:to-emerald-800 text-white shadow-lg hover:shadow-2xl hover:shadow-green-500/50 transform hover:scale-[1.01] active:scale-[0.99] relative overflow-hidden group"
              >
                <span className="relative z-10">{t('gameResults.startResultsEntry')}</span>
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
              </button>
            </Card>
          )}

          {isParticipant && !isLeague && (
            <Card>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <LogOut size={18} className="text-gray-500 dark:text-gray-400" />
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                      {t('gameDetails.leaveGame')}
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
                      {isUserPlaying && (
                        <button
                          onClick={handleLeaveGame}
                          disabled={isLeaving}
                          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {t('gameDetails.dontPlayInGame')}
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

          {canEdit && !isLeague && (
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
                    });
                  }}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
                >
                  {t('gameDetails.duplicate')}
                </button>
              </div>
            </Card>
          )}

          {canDeleteGame() && (
            <Card>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Trash2 size={18} className="text-gray-500 dark:text-gray-400" />
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    {t(isLeagueSeason ? 'gameDetails.deleteLeague' : 'gameDetails.deleteGame')}
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

    if (activeTab === 'schedule') {
      return <LeagueScheduleTab leagueSeasonId={game.id} canEdit={canEdit} hasFixedTeams={game.hasFixedTeams || false} />;
    }

    if (activeTab === 'standings') {
      return <LeagueStandingsTab leagueSeasonId={game.id} hasFixedTeams={game.hasFixedTeams || false} />;
    }

    if (activeTab === 'faq') {
      return <FaqTab gameId={game.id} />;
    }

    return null;
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4 overflow-visible">
      {isLeagueSeason && (
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
            setPlayerListGender(undefined);
          }}
          multiSelect={true}
          filterGender={playerListGender}
          onConfirm={async (playerIds) => {
            console.log(`Invited ${playerIds.length} players`);
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

      {isCourtModalOpen && game && courts.length > 1 && (
        <CourtModal
          isOpen={isCourtModalOpen}
          onClose={() => setIsCourtModalOpen(false)}
          courts={courts}
          selectedId={isEditMode ? editFormData.courtId || 'notBooked' : game.courtId || 'notBooked'}
          onSelect={isEditMode ? (courtId) => handleFormDataChange({courtId}) : handleCourtSelect}
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
              handleFormDataChange({clubId, courtId: 'notBooked'});
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

      <DeleteGameConfirmationModal
        isOpen={showDeleteConfirmation}
        onConfirm={handleDeleteGame}
        onClose={() => setShowDeleteConfirmation(false)}
        isDeleting={isDeleting}
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
  );
};