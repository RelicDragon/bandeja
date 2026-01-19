import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Gamepad2, Trophy, Swords, Dumbbell, Beer, Users, Hash, X } from 'lucide-react';
import { EntityType } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { CreateGroupChannelForm } from './chat/CreateGroupChannelForm';
import { BaseModal } from '@/components';

interface CreateMenuModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectGameType: (type: EntityType) => void;
  onSelectChatType: (type: 'group' | 'channel') => void;
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
  buttonRef,
  showChatForm = false,
  chatFormType = null,
  onChatFormClose
}: CreateMenuModalProps) => {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isExiting, setIsExiting] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [position, setPosition] = useState({ top: 0, right: 0 });
  
  const getEntityTypes = (): EntityType[] => {
    const types: EntityType[] = ['GAME'];
    
    if (user?.isAdmin || user?.canCreateTournament) {
      types.push('TOURNAMENT');
    }
    
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
    } else {
      setShouldRender(false);
    }
  }, [isOpen, showChatForm]);

  if (showChatForm && chatFormType) {
    return (
      <CreateGroupChannelForm
        isChannel={chatFormType === 'channel'}
        onClose={onChatFormClose || onClose}
        onSuccess={() => {
          window.dispatchEvent(new CustomEvent('refresh-chat-list'));
          if (onChatFormClose) {
            onChatFormClose();
          } else {
            onClose();
          }
        }}
      />
    );
  }

  if (!isOpen || !shouldRender) return null;

  const handleSelectGameType = (type: EntityType) => {
    setIsExiting(true);
    setTimeout(() => {
      onSelectGameType(type);
      onClose();
    }, 400);
  };

  const handleSelectChatType = (type: 'group' | 'channel') => {
    setIsExiting(true);
    setTimeout(() => {
      onSelectChatType(type);
      onClose();
    }, 400);
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

  const totalItems = entityTypes.length + 4;
  let currentIndex = 0;

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => {
      onClose();
      setIsExiting(false);
      setShouldRender(false);
    }, 400);
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={handleClose}
      isBasic={false}
      forceBackdrop={true}
      modalId="create-menu-modal"
      showCloseButton={false}
      closeOnBackdropClick={true}
    >
      <div 
        ref={containerRef} 
        className="fixed"
        style={{
          top: `${position.top}px`,
          right: `${position.right}px`
        }}
      >
        <div className="flex flex-col gap-2">
          <button
            onClick={handleClose}
            className={`game-type-button w-10 h-10 rounded-lg font-semibold text-white shadow-2xl bg-primary-600 hover:bg-primary-700 flex items-center justify-center self-end ${
              isExiting ? 'animate-bounce-out-button' : 'animate-bounce-in-button'
            }`}
            style={{
              animationDelay: isExiting ? `${(totalItems - currentIndex - 1) * 100}ms` : `${currentIndex++ * 100}ms`,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1)'
            }}
          >
            <X size={18} />
          </button>
          {entityTypes.map((type) => {
            const delay = isExiting ? `${(totalItems - currentIndex - 1) * 100}ms` : `${currentIndex * 100}ms`;
            currentIndex++;
            return (
              <button
                key={type}
                onClick={() => handleSelectGameType(type)}
                className={`game-type-button px-6 py-3 rounded-lg font-semibold text-white shadow-2xl bg-primary-600 hover:bg-primary-700 flex items-center gap-2 ${
                  isExiting ? 'animate-bounce-out-button' : 'animate-bounce-in-button'
                }`}
                style={{
                  animationDelay: delay,
                  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1)'
                }}
              >
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
            onClick={() => handleSelectChatType('group')}
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
            onClick={() => handleSelectChatType('channel')}
            className={`game-type-button px-6 py-3 rounded-lg font-semibold text-white shadow-2xl bg-primary-600 hover:bg-primary-700 flex items-center gap-2 ${
              isExiting ? 'animate-bounce-out-button' : 'animate-bounce-in-button'
            }`}
            style={{
              animationDelay: isExiting ? `${(totalItems - currentIndex - 1) * 100}ms` : `${currentIndex * 100}ms`,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1)'
            }}
          >
            <Hash size={18} />
            {t('chat.channel', { defaultValue: 'Channel' })}
          </button>
        </div>
      </div>
    </BaseModal>
  );
};
