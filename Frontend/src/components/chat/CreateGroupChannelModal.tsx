import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Users, Hash } from 'lucide-react';
import { CreateGroupChannelForm } from './CreateGroupChannelForm';

interface CreateGroupChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  buttonRef?: React.RefObject<HTMLElement | null>;
  onCreated?: () => void;
}

export const CreateGroupChannelModal = ({ isOpen, onClose, buttonRef, onCreated }: CreateGroupChannelModalProps) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [selectedType, setSelectedType] = useState<'group' | 'channel' | null>(null);

  useEffect(() => {
    const updatePosition = () => {
      if (buttonRef?.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        setPosition({
          top: rect.bottom + 8,
          left: rect.left + rect.width / 2
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
    if (isOpen) {
      const originalStyle = window.getComputedStyle(document.body).overflow;
      const originalPaddingRight = document.body.style.paddingRight;
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      
      document.body.style.overflow = 'hidden';
      if (scrollbarWidth > 0) {
        document.body.style.paddingRight = `${scrollbarWidth}px`;
      }
      
      return () => {
        document.body.style.overflow = originalStyle;
        document.body.style.paddingRight = originalPaddingRight;
      };
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        if (buttonRef?.current && buttonRef.current.contains(event.target as Node)) {
          return;
        }
        setIsAnimatingOut(true);
        setTimeout(() => {
          onClose();
          setIsAnimatingOut(false);
          setShouldRender(false);
          setSelectedType(null);
        }, 200);
      }
    };

    if (isOpen) {
      setShouldRender(true);
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    } else {
      setShouldRender(false);
      setSelectedType(null);
    }
  }, [isOpen, onClose, buttonRef]);

  if (!isOpen || !shouldRender || typeof document === 'undefined') return null;

  const handleSelectType = (type: 'group' | 'channel') => {
    setSelectedType(type);
  };

  const handleFormClose = () => {
    setIsExiting(true);
    setTimeout(() => {
      onClose();
      setIsExiting(false);
      setShouldRender(false);
      setSelectedType(null);
    }, 200);
  };

  const handleFormSuccess = () => {
    if (onCreated) {
      onCreated();
    }
    handleFormClose();
  };

  if (selectedType) {
    return (
      <CreateGroupChannelForm
        isChannel={selectedType === 'channel'}
        onClose={handleFormClose}
        onSuccess={handleFormSuccess}
      />
    );
  }

  return createPortal(
    <>
      <div 
        className={`fixed inset-0 bg-black/20 z-[9998] ${isAnimatingOut || isExiting ? 'animate-blur-out' : 'animate-blur-in'}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setIsAnimatingOut(true);
            setTimeout(() => {
              onClose();
              setIsAnimatingOut(false);
              setShouldRender(false);
            }, 200);
          }
        }}
        style={{ pointerEvents: 'auto' }}
      />
      
      <div 
        ref={containerRef} 
        className="fixed z-[9999] pr-8"
        style={{
          top: `${position.top}px`,
          left: `${position.left}px`,
          transform: 'translateX(-50%)'
        }}
      >
        <div className="flex flex-col pr-8 gap-2">
          <button
            onClick={() => handleSelectType('group')}
            className={`game-type-button px-6 py-3 rounded-lg font-semibold text-white shadow-2xl bg-primary-600 hover:bg-primary-700 flex items-center gap-2 ${
              isExiting ? 'animate-bounce-out-button' : 'animate-bounce-in-button'
            }`}
            style={{
              animationDelay: isExiting ? '100ms' : '0ms',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1)'
            }}
          >
            <Users size={18} />
            {t('chat.createGroup', { defaultValue: 'Create Group' })}
          </button>
          <button
            onClick={() => handleSelectType('channel')}
            className={`game-type-button px-6 py-3 rounded-lg font-semibold text-white shadow-2xl bg-primary-600 hover:bg-primary-700 flex items-center gap-2 ${
              isExiting ? 'animate-bounce-out-button' : 'animate-bounce-in-button'
            }`}
            style={{
              animationDelay: isExiting ? '0ms' : '100ms',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1)'
            }}
          >
            <Hash size={18} />
            {t('chat.createChannel', { defaultValue: 'Create Channel' })}
          </button>
        </div>
      </div>
    </>,
    document.body
  );
};
