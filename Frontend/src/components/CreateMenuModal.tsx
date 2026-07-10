import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Gamepad2, Trophy, Swords, Dumbbell, Beer, Users, Hash, Bug, X, ShoppingBag, UsersRound, Loader2, CirclePlay } from 'lucide-react';
import type { EntityType, Sport } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { CreateGameSportPicker } from '@/components/createGame/CreateGameSportPicker';
import { useUserTeamsStore } from '@/store/userTeamsStore';
import toast from 'react-hot-toast';
import { userTeamsApi } from '@/api';
import { toastApiError } from '@/utils/toastApiError';
import { findLatestSoloOwnedTeam } from '@/utils/soloOwnedUserTeam';
import { CreateGroupChannelForm } from './chat/CreateGroupChannelForm';
import { useBackButtonModal } from '@/hooks/useBackButtonModal';
import { navigationService } from '@/services/navigationService';
import { hasMultipleSportsEnabled, listEnabledSports } from '@/utils/profileSports';

interface CreateMenuModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectGameType: (type: EntityType, sport?: Sport) => void;
  onSelectChatType: (type: 'group' | 'channel') => void;
  onSelectStory: () => void;
  buttonRef?: React.RefObject<HTMLElement | null>;
  showChatForm?: boolean;
  chatFormType?: 'group' | 'channel' | null;
  onChatFormClose?: () => void;
}

export const CreateMenuModal = ({ 
  isOpen, 
  onClose, 
  onSelectGameType, 
  onSelectChatType,
  onSelectStory,
  buttonRef,
  showChatForm = false,
  chatFormType = null,
  onChatFormClose
}: CreateMenuModalProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const refreshAllTeams = useUserTeamsStore((s) => s.refreshAll);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isExiting, setIsExiting] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [position, setPosition] = useState({ top: 0, right: 0 });
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [showSportPicker, setShowSportPicker] = useState(false);
  const gameLongPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gameLongPressTriggered = useRef(false);

  const multiSportCreate = hasMultipleSportsEnabled(user);
  const pickableSports = multiSportCreate ? listEnabledSports(user) : [];
  
  const handleClose = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => {
      onClose();
      setIsExiting(false);
      setShouldRender(false);
    }, 400);
  }, [onClose]);
  
  useBackButtonModal(isOpen, handleClose, 'create-menu-modal');

  const getEntityTypes = (): EntityType[] => {
    const types: EntityType[] = ['GAME', 'TOURNAMENT'];

    if (user?.isAdmin || user?.canCreateLeague) {
      types.push('LEAGUE');
    }
    
    if (user?.isAdmin || user?.isTrainer) {
      types.push('TRAINING');
    }
    
    types.push('BAR');
    
    return types;
  };
  
  const entityTypes = getEntityTypes();

  useEffect(() => {
    const updatePosition = () => {
      if (buttonRef?.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        setPosition({
          top: rect.top,
          right: window.innerWidth - rect.right
        });
      }
    };

    if (isOpen && buttonRef?.current) {
      updatePosition();
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true);
      return () => {
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', updatePosition, true);
      };
    }
  }, [isOpen, buttonRef]);

  useEffect(() => {
    if (isOpen && !showChatForm) {
      setShouldRender(true);
      setIsExiting(false);
    } else {
      setShouldRender(false);
    }
  }, [isOpen, showChatForm]);

  if (showChatForm && chatFormType) {
    return (
      <CreateGroupChannelForm
        isChannel={chatFormType === 'channel'}
        onClose={onChatFormClose || onClose}
        onSuccess={(groupChannel) => {
          window.dispatchEvent(new CustomEvent('refresh-chat-list'));
          if (onChatFormClose) {
            onChatFormClose();
          } else {
            onClose();
          }
          
          if (groupChannel.isChannel) {
            navigationService.navigateToChannelChat(groupChannel.id);
          } else {
            navigationService.navigateToGroupChat(groupChannel.id);
          }
        }}
      />
    );
  }

  if (!isOpen || !shouldRender) return null;

  const clearGameLongPress = () => {
    if (gameLongPressTimer.current) {
      clearTimeout(gameLongPressTimer.current);
      gameLongPressTimer.current = null;
    }
  };

  const handleSelectGameType = (type: EntityType, sport?: Sport) => {
    setShowSportPicker(false);
    setIsExiting(true);
    setTimeout(() => {
      onSelectGameType(type, sport);
      onClose();
    }, 400);
  };

  const startGameLongPress = () => {
    if (!multiSportCreate) return;
    gameLongPressTriggered.current = false;
    clearGameLongPress();
    gameLongPressTimer.current = setTimeout(() => {
      gameLongPressTriggered.current = true;
      setShowSportPicker(true);
    }, 500);
  };

  const endGameLongPress = () => {
    clearGameLongPress();
  };

  const handleSelectChatType = (type: 'group' | 'channel') => {
    setIsExiting(true);
    setTimeout(() => {
      onSelectChatType(type);
      onClose();
    }, 400);
  };

  const handleCreateBug = () => {
    setIsExiting(true);
    setTimeout(() => {
      onClose();
      navigationService.navigateToCreateBug();
    }, 400);
  };

  const handleCreateListing = () => {
    setIsExiting(true);
    setTimeout(() => {
      onClose();
      navigationService.navigateToCreateListing();
    }, 400);
  };

  const handleCreateTeam = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (creatingTeam) return;
    setCreatingTeam(true);
    try {
      const refreshed = await refreshAllTeams();
      if (!refreshed) {
        toast.error(t('errors.networkError'));
        return;
      }
      const existing = findLatestSoloOwnedTeam(useUserTeamsStore.getState().teams, user?.id);
      if (existing) {
        setIsExiting(true);
        setTimeout(() => {
          onClose();
          navigate(`/user-team/${existing.id}`, { replace: true });
        }, 400);
        return;
      }
      const team = await userTeamsApi.create({});
      useUserTeamsStore.getState().setTeam(team);
      await refreshAllTeams();
      setIsExiting(true);
      setTimeout(() => {
        onClose();
        navigate(`/user-team/${team.id}`, { replace: true });
      }, 400);
    } catch (err: unknown) {
      toastApiError(t, err);
    } finally {
      setCreatingTeam(false);
    }
  };

  const getIcon = (type: EntityType) => {
    switch (type) {
      case 'GAME':
        return <Gamepad2 size={18} />;
      case 'TOURNAMENT':
        return <Swords size={18} />;
      case 'LEAGUE':
        return <Trophy size={18} />;
      case 'TRAINING':
        return <Dumbbell size={18} />;
      case 'BAR':
        return <Beer size={18} />;
      default:
        return null;
    }
  };

  const totalItems = entityTypes.length + 10;
  let currentIndex = 0;

  const overlay = (
    <div
      className={`fixed inset-0 z-50 bg-black/80 ${isExiting ? 'animate-backdrop-out' : 'animate-backdrop-in'}`}
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-label={t('games.create', { defaultValue: 'Create' })}
    >
      <div
        ref={containerRef}
        className="fixed pointer-events-auto"
        style={{
          top: `${position.top}px`,
          right: `${position.right}px`
        }}
      >
        <div className="flex flex-col gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); handleClose(); }}
            className={`game-type-button w-12 h-12 rounded-lg font-semibold text-white shadow-2xl bg-primary-600 hover:bg-primary-700 flex items-center justify-center self-end ${
              isExiting ? 'animate-bounce-out-button' : 'animate-bounce-in-button'
            }`}
            style={{
              animationDelay: isExiting ? `${(totalItems - (currentIndex++) - 1) * 100}ms` : `${currentIndex++ * 100}ms`,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1)'
            }}
            aria-label={t('common.close', { defaultValue: 'Close' })}
          >
            <X size={18} />
          </button>
          {entityTypes.map((type) => {
            const delay = isExiting ? `${(totalItems - currentIndex - 1) * 100}ms` : `${currentIndex * 100}ms`;
            currentIndex++;
            const isGame = type === 'GAME';
            return (
              <button
                key={type}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isGame && gameLongPressTriggered.current) {
                    gameLongPressTriggered.current = false;
                    return;
                  }
                  handleSelectGameType(type);
                }}
                onPointerDown={(e) => {
                  if (!isGame) return;
                  e.stopPropagation();
                  startGameLongPress();
                }}
                onPointerUp={endGameLongPress}
                onPointerLeave={endGameLongPress}
                onPointerCancel={endGameLongPress}
                className={`game-type-button px-6 py-3 rounded-lg font-semibold text-white shadow-2xl bg-primary-600 hover:bg-primary-700 flex items-center gap-2 ${
                  isGame ? 'relative' : ''
                } ${isExiting ? 'animate-bounce-out-button' : 'animate-bounce-in-button'}`}
                style={{
                  animationDelay: delay,
                  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1)'
                }}
              >
                {isGame && showSportPicker && multiSportCreate ? (
                  <div className="absolute right-full top-0 z-20 mr-2 min-w-[10rem]">
                    <CreateGameSportPicker
                      sports={pickableSports}
                      onPick={(sport) => handleSelectGameType('GAME', sport)}
                      onCancel={() => setShowSportPicker(false)}
                    />
                  </div>
                ) : null}
                {getIcon(type)}
                {t(`games.entityTypes.${type}`)}
              </button>
            );
          })}
          
          <div 
            className={`h-px bg-gray-300 dark:bg-gray-600 ${
              isExiting ? 'animate-bounce-out-button' : 'animate-bounce-in-button'
            }`}
            style={{
              animationDelay: isExiting ? `${(totalItems - (currentIndex++) - 1) * 100}ms` : `${currentIndex++ * 100}ms`
            }}
          />
          
          <button
            onClick={(e) => { e.stopPropagation(); onSelectStory(); }}
            className={`game-type-button px-6 py-3 rounded-lg font-semibold text-white shadow-2xl bg-primary-600 hover:bg-primary-700 flex items-center gap-2 ${
              isExiting ? 'animate-bounce-out-button' : 'animate-bounce-in-button'
            }`}
            style={{
              animationDelay: isExiting ? `${(totalItems - (currentIndex++) - 1) * 100}ms` : `${currentIndex++ * 100}ms`,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1)'
            }}
          >
            <CirclePlay size={18} />
            {t('stories.story', { defaultValue: 'Story' })}
          </button>

          <button
            onClick={(e) => { e.stopPropagation(); handleSelectChatType('group'); }}
            className={`game-type-button px-6 py-3 rounded-lg font-semibold text-white shadow-2xl bg-primary-600 hover:bg-primary-700 flex items-center gap-2 ${
              isExiting ? 'animate-bounce-out-button' : 'animate-bounce-in-button'
            }`}
            style={{
              animationDelay: isExiting ? `${(totalItems - (currentIndex++) - 1) * 100}ms` : `${currentIndex++ * 100}ms`,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1)'
            }}
          >
            <Users size={18} />
            {t('chat.group', { defaultValue: 'Group' })}
          </button>
          
          <button
            onClick={(e) => { e.stopPropagation(); handleSelectChatType('channel'); }}
            className={`game-type-button px-6 py-3 rounded-lg font-semibold text-white shadow-2xl bg-primary-600 hover:bg-primary-700 flex items-center gap-2 ${
              isExiting ? 'animate-bounce-out-button' : 'animate-bounce-in-button'
            }`}
            style={{
              animationDelay: isExiting ? `${(totalItems - (currentIndex++) - 1) * 100}ms` : `${currentIndex++ * 100}ms`,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1)'
            }}
          >
            <Hash size={18} />
            {t('chat.channel', { defaultValue: 'Channel' })}
          </button>

          <div
            className={`h-px bg-gray-300 dark:bg-gray-600 ${
              isExiting ? 'animate-bounce-out-button' : 'animate-bounce-in-button'
            }`}
            style={{
              animationDelay: isExiting ? `${(totalItems - (currentIndex++) - 1) * 100}ms` : `${currentIndex++ * 100}ms`
            }}
          />

          <button
            type="button"
            onClick={handleCreateTeam}
            disabled={creatingTeam}
            className={`game-type-button px-6 py-3 rounded-lg font-semibold text-white shadow-2xl bg-primary-600 hover:bg-primary-700 flex items-center gap-2 disabled:opacity-60 ${
              isExiting ? 'animate-bounce-out-button' : 'animate-bounce-in-button'
            }`}
            style={{
              animationDelay: isExiting ? `${(totalItems - (currentIndex++) - 1) * 100}ms` : `${currentIndex++ * 100}ms`,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1)'
            }}
          >
            {creatingTeam ? <Loader2 size={18} className="animate-spin" /> : <UsersRound size={18} />}
            {t('teams.team', { defaultValue: 'Team' })}
          </button>

          <button
            onClick={(e) => { e.stopPropagation(); handleCreateListing(); }}
            className={`game-type-button px-6 py-3 rounded-lg font-semibold text-white shadow-2xl bg-primary-600 hover:bg-primary-700 flex items-center gap-2 ${
              isExiting ? 'animate-bounce-out-button' : 'animate-bounce-in-button'
            }`}
            style={{
              animationDelay: isExiting ? `${(totalItems - (currentIndex++) - 1) * 100}ms` : `${currentIndex++ * 100}ms`,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1)'
            }}
          >
            <ShoppingBag size={18} />
            {t('marketplace.listing', { defaultValue: 'Listing' })}
          </button>

          <div
            className={`h-px bg-gray-300 dark:bg-gray-600 ${
              isExiting ? 'animate-bounce-out-button' : 'animate-bounce-in-button'
            }`}
            style={{
              animationDelay: isExiting ? `${(totalItems - (currentIndex++) - 1) * 100}ms` : `${currentIndex++ * 100}ms`
            }}
          />

          <button
            onClick={(e) => { e.stopPropagation(); handleCreateBug(); }}
            className={`game-type-button px-6 py-3 rounded-lg font-semibold text-white shadow-2xl bg-primary-600 hover:bg-primary-700 flex items-center gap-2 ${
              isExiting ? 'animate-bounce-out-button' : 'animate-bounce-in-button'
            }`}
            style={{
              animationDelay: isExiting ? `${(totalItems - currentIndex - 1) * 100}ms` : `${currentIndex * 100}ms`,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1)'
            }}
          >
            <Bug size={18} />
            {t('bug.bug', { defaultValue: 'Bug' })}
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(overlay, document.body) : null;
};
