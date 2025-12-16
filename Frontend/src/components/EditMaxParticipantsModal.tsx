import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { X, Trash2, RotateCw } from 'lucide-react';
import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';
import { gamesApi } from '@/api/games';
import { Button } from './Button';
import { PlayerAvatar } from './PlayerAvatar';
import { RangeSlider } from './RangeSlider';
import { Select } from './Select';
import { ConfirmationModal } from './ConfirmationModal';
import { Game, GenderTeam } from '@/types';
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
  const [levelRange, setLevelRange] = useState<[number, number]>([
    game.minLevel ?? 1.0,
    game.maxLevel ?? 7.0,
  ]);
  const [genderTeams, setGenderTeams] = useState<GenderTeam>(game.genderTeams ?? 'ANY');
  const [isSaving, setIsSaving] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [removedPlayerIds, setRemovedPlayerIds] = useState<Set<string>>(new Set());
  const [originalParticipants, setOriginalParticipants] = useState<typeof game.participants>([]);
  const [confirmationModal, setConfirmationModal] = useState<{
    isOpen: boolean;
    type: 'NON_MALE' | 'NON_FEMALE' | 'PREFER_NOT_TO_SAY';
    count: number;
  }>({ isOpen: false, type: 'NON_MALE', count: 0 });

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setNewMaxParticipants(game.maxParticipants);
      setLevelRange([game.minLevel ?? 1.0, game.maxLevel ?? 7.0]);
      setGenderTeams(game.genderTeams ?? 'ANY');
      setIsClosing(false);
      setRemovedPlayerIds(new Set());
      setOriginalParticipants(game.participants.filter(p => p.isPlaying));
    }
  }, [isOpen, game]);

  useEffect(() => {
    if (isOpen) {
      setOriginalParticipants(game.participants.filter(p => p.isPlaying));
    }
  }, [isOpen, game.participants]);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
      setIsClosing(false);
    }, 200);
  }, [onClose]);

  const playingParticipants = originalParticipants.filter(p => !removedPlayerIds.has(p.userId));
  const currentPlayingCount = playingParticipants.length;
  const currentUserParticipant = game.participants.find(p => p.userId === user?.id);
  const isOwner = currentUserParticipant?.role === 'OWNER';
  const isAdmin = currentUserParticipant?.role === 'ADMIN';
  
  const eligibleParticipants = useMemo(() => {
    return playingParticipants.filter(p => {
      if (isAdmin && !isOwner && p.role === 'OWNER') return false;
      return true;
    });
  }, [playingParticipants, isAdmin, isOwner]);

  const maleParticipants = useMemo(() => {
    return eligibleParticipants.filter(p => p.user.gender === 'MALE');
  }, [eligibleParticipants]);

  const femaleParticipants = useMemo(() => {
    return eligibleParticipants.filter(p => p.user.gender === 'FEMALE');
  }, [eligibleParticipants]);

  const preferNotToSayParticipants = useMemo(() => {
    return eligibleParticipants.filter(p => 
      !p.user.gender || p.user.gender === 'PREFER_NOT_TO_SAY'
    );
  }, [eligibleParticipants]);

  const nonMaleParticipants = useMemo(() => {
    return eligibleParticipants.filter(p => p.user.gender !== 'MALE');
  }, [eligibleParticipants]);

  const nonFemaleParticipants = useMemo(() => {
    return eligibleParticipants.filter(p => p.user.gender !== 'FEMALE');
  }, [eligibleParticipants]);

  const getParticipantsForRemoval = useMemo(() => {
    if (genderTeams === 'ANY') {
      const remainingCount = eligibleParticipants.length;
      const needsRemoval = remainingCount > newMaxParticipants;
      return {
        needsRemoval,
        playersToRemoveCount: Math.max(0, remainingCount - newMaxParticipants),
        participants: eligibleParticipants,
      };
    } else if (genderTeams === 'MEN') {
      const remainingCount = maleParticipants.length;
      const needsRemoval = remainingCount > newMaxParticipants;
      return {
        needsRemoval,
        playersToRemoveCount: Math.max(0, remainingCount - newMaxParticipants),
        participants: maleParticipants,
      };
    } else if (genderTeams === 'WOMEN') {
      const remainingCount = femaleParticipants.length;
      const needsRemoval = remainingCount > newMaxParticipants;
      return {
        needsRemoval,
        playersToRemoveCount: Math.max(0, remainingCount - newMaxParticipants),
        participants: femaleParticipants,
      };
    } else if (genderTeams === 'MIX_PAIRS') {
      const maxPerGender = newMaxParticipants / 2;
      const maleCount = maleParticipants.length;
      const femaleCount = femaleParticipants.length;
      const needsMaleRemoval = maleCount > maxPerGender;
      const needsFemaleRemoval = femaleCount > maxPerGender;
      return {
        needsRemoval: needsMaleRemoval || needsFemaleRemoval,
        playersToRemoveCount: Math.max(0, maleCount - maxPerGender) + Math.max(0, femaleCount - maxPerGender),
        participants: [...maleParticipants, ...femaleParticipants],
        needsMaleRemoval,
        needsFemaleRemoval,
        maleToRemoveCount: Math.max(0, maleCount - maxPerGender),
        femaleToRemoveCount: Math.max(0, femaleCount - maxPerGender),
      };
    }
    return {
      needsRemoval: false,
      playersToRemoveCount: 0,
      participants: [],
    };
  }, [genderTeams, eligibleParticipants, maleParticipants, femaleParticipants, newMaxParticipants]);

  const needsRemoval = getParticipantsForRemoval.needsRemoval;
  const playersToRemoveCount = getParticipantsForRemoval.playersToRemoveCount;
  
  const validRemovedPlayerIds = useMemo(() => {
    const currentParticipantIds = new Set(originalParticipants.map(p => p.userId));
    return new Set(Array.from(removedPlayerIds).filter(userId => currentParticipantIds.has(userId)));
  }, [removedPlayerIds, originalParticipants]);

  const maxParticipants = useMemo(() => {
    if (game.entityType === 'LEAGUE_SEASON') {
      return 128;
    }
    if (game.entityType === 'TOURNAMENT') {
      return 32;
    }
    return 8;
  }, [game.entityType]);

  const minParticipants = 2;

  const validOptions = useMemo(() => {
    if (game.entityType === 'TOURNAMENT' || game.entityType === 'LEAGUE_SEASON') {
      return Array.from({ length: 13 }, (_, i) => 8 + i * 2);
    }
    return [2, 3, 4, 5, 6, 7, 8];
  }, [game.entityType]);

  const canSave = !needsRemoval && 
    (genderTeams === 'ANY' || 
     (genderTeams === 'MEN' && nonMaleParticipants.length === 0) ||
     (genderTeams === 'WOMEN' && nonFemaleParticipants.length === 0) ||
     (genderTeams === 'MIX_PAIRS' && preferNotToSayParticipants.length === 0));

  const handleSave = useCallback(async () => {
    if (!canSave || isSaving) return;

    setIsSaving(true);
    try {
      // Handle marked players - set current user to isPlaying: false, kick others
      // Only process users who are still in the current participants
      for (const userId of validRemovedPlayerIds) {
        if (userId === user?.id) {
          await gamesApi.togglePlayingStatus(game.id, false);
        } else {
          await onKickUser(userId);
        }
      }
      
      // Then update max participants, level range, and gender teams
      await gamesApi.update(game.id, {
        maxParticipants: newMaxParticipants,
        minLevel: levelRange[0],
        maxLevel: levelRange[1],
        genderTeams: genderTeams,
      });
      const response = await gamesApi.getById(game.id);
      onUpdate(response.data);
      toast.success(t('gameDetails.participantsUpdated', { defaultValue: 'Participants updated' }));
      handleClose();
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    } finally {
      setIsSaving(false);
    }
  }, [canSave, isSaving, validRemovedPlayerIds, newMaxParticipants, levelRange, genderTeams, game.id, user?.id, onKickUser, onUpdate, t, handleClose]);

  const handleMarkForRemoval = useCallback((userId: string) => {
    setRemovedPlayerIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  }, []);

  const handleKickAllNonCompliant = useCallback(async () => {
    let playersToKick: string[] = [];
    
    if (confirmationModal.type === 'NON_MALE') {
      playersToKick = nonMaleParticipants.map(p => p.userId);
    } else if (confirmationModal.type === 'NON_FEMALE') {
      playersToKick = nonFemaleParticipants.map(p => p.userId);
    } else if (confirmationModal.type === 'PREFER_NOT_TO_SAY') {
      playersToKick = preferNotToSayParticipants.map(p => p.userId);
    }

    setIsSaving(true);
    try {
      for (const userId of playersToKick) {
        if (userId === user?.id) {
          await gamesApi.togglePlayingStatus(game.id, false);
        } else {
          await onKickUser(userId);
        }
        setRemovedPlayerIds(prev => new Set([...prev, userId]));
      }
      
      const response = await gamesApi.getById(game.id);
      const updatedGame = response.data;
      onUpdate(updatedGame);
      setOriginalParticipants(updatedGame.participants.filter(p => p.isPlaying));
      
      toast.success(t('gameDetails.playersKicked', { 
        count: playersToKick.length,
        defaultValue: `${playersToKick.length} player(s) kicked` 
      }));
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    } finally {
      setIsSaving(false);
      setConfirmationModal({ isOpen: false, type: 'NON_MALE', count: 0 });
    }
  }, [confirmationModal, nonMaleParticipants, nonFemaleParticipants, preferNotToSayParticipants, game.id, user?.id, onKickUser, onUpdate, t]);

  if (!isOpen && !isClosing) return null;

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
            {t('gameDetails.editParticipants', { defaultValue: 'Edit Participants' })}
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
            {game.entityType === 'LEAGUE_SEASON' ? (
              <div className="space-y-4">
                <div className="flex items-center justify-center px-2">
                  <div className="inline-flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-lg px-4 py-1.5">
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      {newMaxParticipants}
                    </span>
                  </div>
                </div>
                <div className="px-2 py-2">
                  <Slider
                    min={8}
                    max={128}
                    step={1}
                    value={newMaxParticipants}
                    onChange={(val) => {
                      if (typeof val === 'number') {
                        setNewMaxParticipants(val);
                      }
                    }}
                    styles={{
                      track: {
                        backgroundColor: 'rgb(59 130 246)',
                        height: 6,
                      },
                      rail: {
                        backgroundColor: 'rgb(229 231 235)',
                        height: 6,
                      },
                      handle: {
                        backgroundColor: 'rgb(59 130 246)',
                        border: '3px solid white',
                        width: 20,
                        height: 20,
                        marginTop: -7,
                        opacity: 1,
                        boxShadow: '0 2px 8px rgba(59, 130 246, 0.3)',
                      },
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className={`grid gap-2 ${game.entityType === 'TOURNAMENT' ? 'grid-cols-7' : 'grid-cols-7'}`}>
                {validOptions.map((num) => (
                  <button
                    key={num}
                    onClick={() => setNewMaxParticipants(num)}
                    disabled={num < minParticipants || num > maxParticipants}
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
            )}
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('createGame.playerLevel', { defaultValue: 'Player Level' })}
            </label>
            <RangeSlider
              min={1.0}
              max={7.0}
              value={levelRange}
              onChange={setLevelRange}
              step={0.1}
            />
          </div>

          {(game.entityType === 'GAME' || game.entityType === 'TOURNAMENT' || game.entityType === 'LEAGUE') && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('createGame.genderTeams.label', { defaultValue: 'Gender Teams' })}
              </label>
              <Select
                options={[
                  { value: 'ANY', label: t('createGame.genderTeams.any', { defaultValue: 'Any' }) },
                  { value: 'MEN', label: t('createGame.genderTeams.men', { defaultValue: 'Men' }) },
                  { value: 'WOMEN', label: t('createGame.genderTeams.women', { defaultValue: 'Women' }) },
                  ...(newMaxParticipants >= 4 && newMaxParticipants % 2 === 0
                    ? [{ value: 'MIX_PAIRS', label: t('createGame.genderTeams.mixPairs', { defaultValue: 'Mix Pairs' }) }]
                    : []),
                ]}
                value={genderTeams}
                onChange={(value) => setGenderTeams(value as GenderTeam)}
                disabled={isSaving}
              />
            </div>
          )}

          {genderTeams === 'MEN' && nonMaleParticipants.length > 0 && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="flex items-center justify-end">
                <Button
                  onClick={() => setConfirmationModal({ 
                    isOpen: true, 
                    type: 'NON_MALE', 
                    count: nonMaleParticipants.length 
                  })}
                  variant="danger"
                  size="sm"
                  disabled={isSaving}
                >
                  {t('gameDetails.kickAllNonMale', { 
                    count: nonMaleParticipants.length,
                    defaultValue: `Kick all non-male players (${nonMaleParticipants.length})`
                  })}
                </Button>
              </div>
            </div>
          )}

          {genderTeams === 'WOMEN' && nonFemaleParticipants.length > 0 && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="flex items-center justify-end">
                <Button
                  onClick={() => setConfirmationModal({ 
                    isOpen: true, 
                    type: 'NON_FEMALE', 
                    count: nonFemaleParticipants.length 
                  })}
                  variant="danger"
                  size="sm"
                  disabled={isSaving}
                >
                  {t('gameDetails.kickAllNonFemale', { 
                    count: nonFemaleParticipants.length,
                    defaultValue: `Kick all non-female players (${nonFemaleParticipants.length})`
                  })}
                </Button>
              </div>
            </div>
          )}

          {genderTeams === 'MIX_PAIRS' && preferNotToSayParticipants.length > 0 && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="flex items-center justify-end">
                <Button
                  onClick={() => setConfirmationModal({ 
                    isOpen: true, 
                    type: 'PREFER_NOT_TO_SAY', 
                    count: preferNotToSayParticipants.length 
                  })}
                  variant="danger"
                  size="sm"
                  disabled={isSaving}
                >
                  {t('gameDetails.kickAllPreferNotToSay', { 
                    count: preferNotToSayParticipants.length,
                    defaultValue: `Kick all non-male/female players (${preferNotToSayParticipants.length})`
                  })}
                </Button>
              </div>
            </div>
          )}

          {(needsRemoval || validRemovedPlayerIds.size > 0) && (
            <div className="space-y-3">
              {needsRemoval && (
                <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                  {genderTeams === 'MIX_PAIRS' && getParticipantsForRemoval.needsMaleRemoval && getParticipantsForRemoval.needsFemaleRemoval ? (
                    <div className="space-y-2">
                      <p className="text-sm text-yellow-800 dark:text-yellow-300">
                        {t('gameDetails.removeMalePlayersNote', { 
                          count: getParticipantsForRemoval.maleToRemoveCount,
                          max: newMaxParticipants / 2,
                          defaultValue: `You need to remove ${getParticipantsForRemoval.maleToRemoveCount} male player(s) (max ${newMaxParticipants / 2} males allowed).`
                        })}
                      </p>
                      <p className="text-sm text-yellow-800 dark:text-yellow-300">
                        {t('gameDetails.removeFemalePlayersNote', { 
                          count: getParticipantsForRemoval.femaleToRemoveCount,
                          max: newMaxParticipants / 2,
                          defaultValue: `You need to remove ${getParticipantsForRemoval.femaleToRemoveCount} female player(s) (max ${newMaxParticipants / 2} females allowed).`
                        })}
                      </p>
                    </div>
                  ) : genderTeams === 'MIX_PAIRS' && getParticipantsForRemoval.needsMaleRemoval ? (
                    <p className="text-sm text-yellow-800 dark:text-yellow-300">
                      {t('gameDetails.removeMalePlayersNote', { 
                        count: getParticipantsForRemoval.maleToRemoveCount,
                        max: newMaxParticipants / 2,
                        defaultValue: `You need to remove ${getParticipantsForRemoval.maleToRemoveCount} male player(s) (max ${newMaxParticipants / 2} males allowed).`
                      })}
                    </p>
                  ) : genderTeams === 'MIX_PAIRS' && getParticipantsForRemoval.needsFemaleRemoval ? (
                    <p className="text-sm text-yellow-800 dark:text-yellow-300">
                      {t('gameDetails.removeFemalePlayersNote', { 
                        count: getParticipantsForRemoval.femaleToRemoveCount,
                        max: newMaxParticipants / 2,
                        defaultValue: `You need to remove ${getParticipantsForRemoval.femaleToRemoveCount} female player(s) (max ${newMaxParticipants / 2} females allowed).`
                      })}
                    </p>
                  ) : (
                    <p className="text-sm text-yellow-800 dark:text-yellow-300">
                      {t('gameDetails.removePlayersNote', { 
                        count: playersToRemoveCount,
                        max: newMaxParticipants,
                        defaultValue: `You need to remove ${playersToRemoveCount} player(s) to set max participants to ${newMaxParticipants}.`
                      })}
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('gameDetails.selectPlayersToRemove', { defaultValue: 'Select players to remove' })}
                </h3>
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden max-h-[300px] overflow-y-auto">
                  {(() => {
                    let participantsToShow = getParticipantsForRemoval.participants;
                    
                    if (genderTeams === 'MIX_PAIRS') {
                      const showMale = getParticipantsForRemoval.needsMaleRemoval;
                      const showFemale = getParticipantsForRemoval.needsFemaleRemoval;
                      if (showMale && showFemale) {
                        participantsToShow = getParticipantsForRemoval.participants;
                      } else if (showMale) {
                        participantsToShow = maleParticipants;
                      } else if (showFemale) {
                        participantsToShow = femaleParticipants;
                      } else {
                        participantsToShow = [];
                      }
                    }
                    
                    return participantsToShow.map((participant) => {
                      const isRemoved = validRemovedPlayerIds.has(participant.userId);
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
                              fullHideName={true}
                              smallLayout={false}
                              extrasmall={true}
                            />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm text-gray-900 dark:text-white truncate">
                                {participant.user.firstName} {participant.user.lastName}
                              </p>
                              {participant.user.gender && participant.user.gender !== 'PREFER_NOT_TO_SAY' && (
                                <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                                  participant.user.gender === 'MALE' 
                                    ? 'bg-blue-500 dark:bg-blue-600' 
                                    : 'bg-pink-500 dark:bg-pink-600'
                                }`}>
                                  <i className={`bi ${participant.user.gender === 'MALE' ? 'bi-gender-male' : 'bi-gender-female'} text-white text-[10px]`}></i>
                                </div>
                              )}
                            </div>
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
                    });
                  })()}
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

      <ConfirmationModal
        isOpen={confirmationModal.isOpen}
        title={confirmationModal.type === 'NON_MALE' 
          ? t('gameDetails.kickAllNonMaleConfirm', { defaultValue: 'Kick all non-male players?' })
          : confirmationModal.type === 'NON_FEMALE'
          ? t('gameDetails.kickAllNonFemaleConfirm', { defaultValue: 'Kick all non-female players?' })
          : t('gameDetails.kickAllPreferNotToSayConfirm', { defaultValue: 'Kick all players with unspecified gender?' })
        }
        message={
          confirmationModal.type === 'NON_MALE'
            ? t('gameDetails.kickAllNonMaleMessage', { 
                count: confirmationModal.count,
                defaultValue: `Are you sure you want to kick all ${confirmationModal.count} non-male player(s)? This action cannot be undone.`
              })
            : confirmationModal.type === 'NON_FEMALE'
            ? t('gameDetails.kickAllNonFemaleMessage', { 
                count: confirmationModal.count,
                defaultValue: `Are you sure you want to kick all ${confirmationModal.count} non-female player(s)? This action cannot be undone.`
              })
            : t('gameDetails.kickAllPreferNotToSayMessage', { 
                count: confirmationModal.count,
                defaultValue: `Are you sure you want to kick all ${confirmationModal.count} player(s) with unspecified gender? This action cannot be undone.`
              })
        }
        confirmVariant="danger"
        onConfirm={handleKickAllNonCompliant}
        onClose={() => setConfirmationModal({ isOpen: false, type: 'NON_MALE', count: 0 })}
      />
    </div>,
    document.body
  );
};

