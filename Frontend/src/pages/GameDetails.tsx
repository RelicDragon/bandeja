import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  Card,
  PlayerListModal,
  ManageUsersModal,
  CourtModal,
  ClubModal,
  GameInfo,
  GameResults,
  GameParticipants,
  GameSettings
} from '@/components';
import { FixedTeamsManagement } from '@/components/GameDetails/FixedTeamsManagement';
import { gamesApi, invitesApi, courtsApi, clubsApi } from '@/api';
import { favoritesApi } from '@/api/favorites';
import { useAuthStore } from '@/store/authStore';
import { useNavigationStore } from '@/store/navigationStore';
import { Game, Invite, Court, Club } from '@/types';
import { canUserEditResults } from '@/utils/gameResults';
import { socketService } from '@/services/socketService';

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
  const [editFormData, setEditFormData] = useState({
    clubId: '',
    courtId: '',
    name: '',
    isPublic: true,
    affectsRating: true,
    anyoneCanInvite: false,
    resultsByAnyone: false,
    hasBookedCourt: false,
    afterGameGoToBar: false,
    hasFixedTeams: false,
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

    socketService.on('invite-deleted', handleInviteDeleted);

    return () => {
      socketService.off('invite-deleted', handleInviteDeleted);
    };
  }, [id]);

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
        hasBookedCourt: game.hasBookedCourt || false,
        afterGameGoToBar: game.afterGameGoToBar || false,
        hasFixedTeams: game.hasFixedTeams || false,
        description: game.description || '',
      });
    }
  }, [game]);

  const handleJoin = async () => {
    if (!id) return;

    try {
      await gamesApi.join(id);
      const response = await gamesApi.getById(id);
      setGame(response.data);
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
  const isGuest = game?.participants.some(p => p.userId === user?.id && !p.isPlaying) || false;
  const canAccessChat = isParticipant || hasPendingInvite || isGuest || game?.isPublic || false;
  const isOwner = game?.participants.some(
    (p) => p.userId === user?.id && ['OWNER', 'ADMIN'].includes(p.role)
  ) || false;
  const canEdit = isOwner || user?.isAdmin || false;
  const isFull = game ? game.entityType !== 'BAR' && game.participants.filter(p => p.isPlaying).length >= game.maxParticipants : false;

  useEffect(() => {
    setGameDetailsCanAccessChat(canAccessChat);
  }, [canAccessChat, setGameDetailsCanAccessChat]);

  const canEnterResults = () => {
    if (!game || !user) return false;
    return canUserEditResults(game, user);
  };

  const canInvitePlayers = Boolean((isOwner || (game?.anyoneCanInvite && isParticipant)) && !isFull);

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
          hasBookedCourt: game.hasBookedCourt || false,
          afterGameGoToBar: game.afterGameGoToBar || false,
          hasFixedTeams: game.hasFixedTeams || false,
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
        hasBookedCourt: editFormData.hasBookedCourt,
        afterGameGoToBar: editFormData.afterGameGoToBar,
        hasFixedTeams: editFormData.hasFixedTeams,
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
        isParticipant={isParticipant}
        isGuest={isGuest}
        isFull={isFull}
        isOwner={isOwner}
        userId={user?.id}
        canInvitePlayers={canInvitePlayers}
        onJoin={handleJoin}
        onAddToGame={handleAddToGame}
        onLeave={handleLeave}
        onAcceptInvite={handleAcceptInvite}
        onDeclineInvite={handleDeclineInvite}
        onCancelInvite={handleCancelInvite}
        onShowPlayerList={() => setShowPlayerList(true)}
        onShowManageUsers={() => setShowManageUsers(true)}
      />

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
    </div>
  );
};