import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Trash2 } from 'lucide-react';
import {
  Card,
  PlayerListModal,
  ManageUsersModal,
  CourtModal,
  ClubModal,
  GameInfo,
  GameResults,
  GameParticipants,
  GameSettings,
  GameSetupModal,
  MultipleCourtsSelector
} from '@/components';
import { DeleteGameConfirmationModal } from '@/components/DeleteGameConfirmationModal';
import { FixedTeamsManagement } from '@/components/GameDetails/FixedTeamsManagement';
import { GameSetup } from '@/components/GameDetails/GameSetup';
import { EditMaxParticipantsModal } from '@/components/EditMaxParticipantsModal';
import { gamesApi, invitesApi, courtsApi, clubsApi } from '@/api';
import { favoritesApi } from '@/api/favorites';
import { useAuthStore } from '@/store/authStore';
import { useNavigationStore } from '@/store/navigationStore';
import { Game, Invite, Court, Club, GenderTeam, GameType } from '@/types';
import { canUserEditResults } from '@/utils/gameResults';
import { socketService } from '@/services/socketService';
import { applyGameTypeTemplate } from '@/utils/gameTypeTemplates';

export const GameDetailsContent = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const { setCurrentPage, setIsAnimating, setGameDetailsCanAccessChat } = useNavigationStore();

  const [game, setGame] = useState<Game | null>(null);
  const [myInvites, setMyInvites] = useState<Invite[]>([]);
  const [gameInvites, setGameInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPlayerList, setShowPlayerList] = useState(false);
  const [showManageUsers, setShowManageUsers] = useState(false);
  const [courts, setCourts] = useState<Court[]>([]);
  const [isCourtModalOpen, setIsCourtModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isClosingEditMode, setIsClosingEditMode] = useState(false);
  const [isClubModalOpen, setIsClubModalOpen] = useState(false);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isGameSetupModalOpen, setIsGameSetupModalOpen] = useState(false);
  const [isEditMaxParticipantsModalOpen, setIsEditMaxParticipantsModalOpen] = useState(false);
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

  useEffect(() => {
    if (!id || !isEditMode || !game) return;
    if (editFormData.gameType === game.gameType) return;
    
    const template = applyGameTypeTemplate(editFormData.gameType);
    gamesApi.update(id, { 
      matchGenerationType: template.matchGenerationType,
      prohibitMatchesEditing: template.prohibitMatchesEditing ?? false,
      pointsPerWin: template.pointsPerWin ?? 0,
      pointsPerLoose: template.pointsPerLoose ?? 0,
      pointsPerTie: template.pointsPerTie ?? 0
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
      await gamesApi.leave(id);
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
  const hasPendingInvite = myInvites.length > 0;
  const isGuest = game?.participants.some(p => p.userId === user?.id && !p.isPlaying && p.role !== 'OWNER' && p.role !== 'ADMIN') || false;
  const isInJoinQueue = game?.joinQueues?.some(q => q.userId === user?.id && q.status === 'PENDING') || false;
  const canAccessChat = isParticipant || hasPendingInvite || isGuest || game?.isPublic || false;
  const isOwner = game?.participants.some(
    (p) => p.userId === user?.id && ['OWNER', 'ADMIN'].includes(p.role)
  ) || false;
  const canEdit = isOwner || user?.isAdmin || false;
  const canViewSettings = game?.resultsStatus === 'NONE' && canEdit && game.status !== 'ARCHIVED';
  const isFull = game ? game.entityType !== 'BAR' && game.participants.filter(p => p.isPlaying).length >= game.maxParticipants : false;

  useEffect(() => {
    setGameDetailsCanAccessChat(canAccessChat);
  }, [canAccessChat, setGameDetailsCanAccessChat]);

  const canEnterResults = () => {
    if (!game || !user) return false;
    
    // Allow viewing results for archived games if results exist
    if (game.status === 'ARCHIVED' && game.resultsStatus !== 'NONE') {
      return true;
    }
    
    return canUserEditResults(game, user);
  };

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

  const handleEnterResults = () => {
    setIsAnimating(true);
    setCurrentPage('gameResultsEntry');
    navigate(`/games/${id}/results`, { replace: true });
    setTimeout(() => setIsAnimating(false), 300);
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
        genderTeams: editFormData.genderTeams,
        gameType: editFormData.gameType,
        description: editFormData.description,
      };

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
    participantLevelUpMode: any;
    matchGenerationType: any;
    prohibitMatchesEditing?: boolean;
    pointsPerWin: number;
    pointsPerLoose: number;
    pointsPerTie: number;
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
    
    if (game.status === 'STARTED' || game.status === 'FINISHED') {
      return false;
    }
    
    const now = new Date();
    const startTime = new Date(game.startTime);
    const twoHoursBeforeStart = new Date(startTime.getTime() - 2 * 60 * 60 * 1000);
    
    return now < twoHoursBeforeStart;
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

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <GameInfo
        game={game}
        isOwner={isOwner}
        isGuest={isGuest}
        courts={courts}
        onToggleFavorite={handleToggleFavorite}
        onEditCourt={() => setIsCourtModalOpen(true)}
      />

      <GameResults
        game={game}
        user={user}
        canEnterResults={canEnterResults()}
        onEnterResults={handleEnterResults}
      />

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
        onShowPlayerList={() => setShowPlayerList(true)}
        onShowManageUsers={() => setShowManageUsers(true)}
        onEditMaxParticipants={() => setIsEditMaxParticipantsModalOpen(true)}
      />

      {canViewSettings && (
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
        />
      )}

      {canViewSettings && (
        <GameSetup
          onOpenSetup={() => setIsGameSetupModalOpen(true)}
          canEdit={canEdit}
        />
      )}

      {game.maxParticipants > 4 && (
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

      {game.hasFixedTeams && (
        <FixedTeamsManagement
          key={`fixed-teams-${game.id}`}
          game={game}
          onGameUpdate={(updatedGame) => {
            // Merge the updated game data instead of replacing entirely
            setGame(prevGame => prevGame ? { ...prevGame, ...updatedGame } : updatedGame);
          }}
        />
      )}

      {showPlayerList && id && (
        <PlayerListModal
          gameId={id}
          onClose={() => setShowPlayerList(false)}
          multiSelect={true}
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

      {canDeleteGame() && (
        <Card>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trash2 size={18} className="text-gray-500 dark:text-gray-400" />
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                {t('gameDetails.deleteGame')}
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

      <DeleteGameConfirmationModal
        isOpen={showDeleteConfirmation}
        onConfirm={handleDeleteGame}
        onClose={() => setShowDeleteConfirmation(false)}
        isDeleting={isDeleting}
      />

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
            participantLevelUpMode: game.participantLevelUpMode,
            matchGenerationType: game.matchGenerationType,
            prohibitMatchesEditing: game.prohibitMatchesEditing,
            pointsPerWin: game.pointsPerWin,
            pointsPerLoose: game.pointsPerLoose,
            pointsPerTie: game.pointsPerTie,
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