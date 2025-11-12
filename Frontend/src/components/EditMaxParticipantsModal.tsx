import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { X, Trash2, RotateCw } from 'lucide-react';
import { gamesApi } from '@/api/games';
import { Button } from './Button';
import { PlayerAvatar } from './PlayerAvatar';
import { Game } from '@/types';
import { useAuthStore } from '@/store/authStore';

interface EditMaxParticipantsModalProps {
  isOpen: boolean;
  game: Game;
  onClose: () => void;
  onUpdate: (game: Game) => void;
  onKickUser: (userId: string) => Promise<void>;
}

export const EditMaxParticipantsModal = ({
  isOpen,
  game,
  onClose,
  onUpdate,
  onKickUser,
}: EditMaxParticipantsModalProps) => {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const [newMaxParticipants, setNewMaxParticipants] = useState(game.maxParticipants);
  const [isSaving, setIsSaving] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [removedPlayerIds, setRemovedPlayerIds] = useState<Set<string>>(new Set());
  const [originalParticipants, setOriginalParticipants] = useState<typeof game.participants>([]);

  useEffect(() => {
    if (isOpen) {
      setNewMaxParticipants(game.maxParticipants);
      setIsClosing(false);
      setRemovedPlayerIds(new Set());
      setOriginalParticipants(game.participants.filter(p => p.isPlaying));
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, game.maxParticipants, game.participants]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
      setIsClosing(false);
    }, 200);
  };

  const currentPlayingCount = game.participants.filter(p => p.isPlaying).length;
  const playingParticipants = originalParticipants.filter(p => !removedPlayerIds.has(p.userId));
  const currentUserParticipant = game.participants.find(p => p.userId === user?.id);
  const isOwner = currentUserParticipant?.role === 'OWNER';
  const isAdmin = currentUserParticipant?.role === 'ADMIN';
  const remainingCount = playingParticipants.length;
  const needsRemoval = remainingCount > newMaxParticipants;
  const playersToRemoveCount = Math.max(0, remainingCount - newMaxParticipants);

  const getMaxParticipants = () => {
    if (game.entityType === 'TOURNAMENT') {
      return 32;
    }
    return 8;
  };

  const getMinParticipants = () => {
    return 2;
  };

  const getValidOptions = () => {
    if (game.entityType === 'TOURNAMENT') {
      return Array.from({ length: 13 }, (_, i) => 8 + i * 2);
    }
    return [2, 3, 4, 5, 6, 7, 8];
  };

  const canSave = !needsRemoval;

  const handleSave = async () => {
    if (!canSave || isSaving) return;

    setIsSaving(true);
    try {
      // Kick all marked players first
      for (const userId of removedPlayerIds) {
        await onKickUser(userId);
      }
      
      // Then update max participants
      await gamesApi.update(game.id, { maxParticipants: newMaxParticipants });
      const response = await gamesApi.getById(game.id);
      onUpdate(response.data);
      toast.success(t('gameDetails.maxParticipantsUpdated', { defaultValue: 'Max participants updated' }));
      handleClose();
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    } finally {
      setIsSaving(false);
    }
  };

  const handleMarkForRemoval = (userId: string) => {
    setRemovedPlayerIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  };

  if (!isOpen && !isClosing) return null;

  const validOptions = getValidOptions();

  return createPortal(
    <div 
      className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-opacity duration-200 ${
        isClosing ? 'opacity-0' : 'opacity-100'
      }`}
      onClick={handleClose}
      style={{ 
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      }}
    >
      <div
        className={`bg-white dark:bg-gray-900 rounded-lg shadow-2xl w-full max-w-md flex flex-col transition-all duration-200 max-h-[90vh] ${
          isClosing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {t('gameDetails.editMaxParticipants', { defaultValue: 'Edit Max Participants' })}
          </h2>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X size={20} className="text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <div className="overflow-y-auto p-4 space-y-4">
          <div className="flex items-center gap-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="flex items-center gap-2 flex-1">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('gameDetails.current', { defaultValue: 'Current' })}
              </span>
              <span className="text-lg font-semibold text-gray-900 dark:text-white">
                {currentPlayingCount}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-1">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('gameDetails.maximum', { defaultValue: 'Maximum' })}
              </span>
              <span className="text-lg font-semibold text-gray-900 dark:text-white">
                {game.maxParticipants}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('gameDetails.newMaxParticipants', { defaultValue: 'New Max Participants' })}
            </label>
            <div className={`grid gap-2 ${game.entityType === 'TOURNAMENT' ? 'grid-cols-7' : 'grid-cols-7'}`}>
              {validOptions.map((num) => (
                <button
                  key={num}
                  onClick={() => setNewMaxParticipants(num)}
                  disabled={num < getMinParticipants() || num > getMaxParticipants()}
                  className={`h-10 rounded-lg font-semibold text-sm transition-all ${
                    newMaxParticipants === num
                      ? 'bg-primary-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed'
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          {(needsRemoval || removedPlayerIds.size > 0) && (
            <div className="space-y-3">
              {needsRemoval && (
                <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                  <p className="text-sm text-yellow-800 dark:text-yellow-300">
                    {t('gameDetails.removePlayersNote', { 
                      count: playersToRemoveCount,
                      max: newMaxParticipants,
                      defaultValue: `You need to remove ${playersToRemoveCount} player(s) to set max participants to ${newMaxParticipants}.`
                    })}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('gameDetails.selectPlayersToRemove', { defaultValue: 'Select players to remove' })}
                </h3>
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden max-h-[300px] overflow-y-auto">
                  {originalParticipants.filter(p => {
                    // Exclude current user
                    if (p.userId === user?.id) return false;
                    // If current user is admin (not owner), exclude owner
                    if (isAdmin && !isOwner && p.role === 'OWNER') return false;
                    return true;
                  }).map((participant) => {
                    const isRemoved = removedPlayerIds.has(participant.userId);
                    return (
                      <div
                        key={participant.userId}
                        className={`flex items-center gap-3 p-4 transition-colors border-b border-gray-100 dark:border-gray-800 last:border-b-0 ${
                          isRemoved 
                            ? 'opacity-50 bg-gray-100 dark:bg-gray-800/50' 
                            : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                        }`}
                      >
                        <div className="flex-shrink-0">
                          <PlayerAvatar 
                            player={{
                              id: participant.userId,
                              firstName: participant.user.firstName,
                              lastName: participant.user.lastName,
                              avatar: participant.user.avatar,
                              level: participant.user.level,
                              gender: participant.user.gender,
                            }}
                            showName={false}
                            smallLayout={false}
                            extrasmall={true}
                          />
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-base font-medium text-gray-900 dark:text-white truncate">
                            {participant.user.firstName} {participant.user.lastName}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            Level {participant.user.level?.toFixed(1) || '0.0'}
                          </p>
                        </div>

                        <div className="flex-shrink-0">
                          {isRemoved ? (
                            <button
                              onClick={() => handleMarkForRemoval(participant.userId)}
                              className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30 hover:bg-green-200 dark:hover:bg-green-900/40 transition-colors"
                              title={t('common.unmark', { defaultValue: 'Unmark for removal' })}
                            >
                              <RotateCw size={18} className="text-green-600 dark:text-green-400" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleMarkForRemoval(participant.userId)}
                              disabled={isSaving}
                              className="p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              title={t('gameDetails.markForRemoval', { defaultValue: 'Mark for removal' })}
                            >
                              <Trash2 size={18} className="text-red-600 dark:text-red-400" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-800 flex-shrink-0">
          <div className="flex gap-2">
            <Button
              onClick={handleClose}
              variant="outline"
              className="flex-1"
              disabled={isSaving}
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleSave}
              className="flex-1"
              disabled={!canSave || isSaving}
            >
              {isSaving ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  {t('common.saving') || 'Saving...'}
                </div>
              ) : (
                t('common.save')
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

