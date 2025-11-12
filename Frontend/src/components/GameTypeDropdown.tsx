import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Gamepad2, Trophy, Swords, GraduationCap, Beer } from 'lucide-react';
import { EntityType } from '@/types';
import { useAuthStore } from '@/store/authStore';

interface GameTypeDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectType: (type: EntityType) => void;
}

export const GameTypeDropdown = ({ isOpen, onClose, onSelectType }: GameTypeDropdownProps) => {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  
  // Sort and filter entity types based on user permissions
  const getEntityTypes = (): EntityType[] => {
    const types: EntityType[] = ['GAME'];
    
    // Add TOURNAMENT if user has permission
    if (user?.isAdmin || user?.canCreateTournament) {
      types.push('TOURNAMENT');
    }
    
    // Add LEAGUE if user has permission
    if (user?.isAdmin || user?.canCreateLeague) {
      types.push('LEAGUE');
    }
    
    // Add TRAINING only if user is admin or trainer
    if (user?.isAdmin || user?.isTrainer) {
      types.push('TRAINING');
    }
    
    // Add BAR at the end
    types.push('BAR');
    
    return types;
  };
  
  const entityTypes = getEntityTypes();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsAnimatingOut(true);
        setTimeout(() => {
          onClose();
          setIsAnimatingOut(false);
          setShouldRender(false);
        }, 200);
      }
    };

    if (isOpen) {
      setShouldRender(true);
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    } else {
      setShouldRender(false);
    }
  }, [isOpen, onClose]);

  if (!isOpen || !shouldRender) return null;

  const handleSelectType = (type: EntityType) => {
    setIsExiting(true);
    setTimeout(() => {
      onSelectType(type);
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
        return <GraduationCap size={18} />;
      case 'BAR':
        return <Beer size={18} />;
      default:
        return null;
    }
  };

  return (
    <>
      {/* Background darkening overlay */}
      <div className={`fixed inset-0 bg-black/20 z-60 ${isAnimatingOut || isExiting ? 'animate-blur-out' : 'animate-blur-in'}`} />
      
      {/* Dropdown buttons */}
      <div ref={containerRef} className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 pr-8 z-70">
        <div className="flex flex-col pr-8 gap-2">
          {entityTypes.map((type, index) => (
            <button
              key={type}
              onClick={() => handleSelectType(type)}
              className={`game-type-button px-6 py-3 rounded-lg font-semibold text-white shadow-2xl bg-primary-600 hover:bg-primary-700 flex items-center gap-2 ${
                isExiting ? 'animate-bounce-out-button' : 'animate-bounce-in-button'
              }`}
              style={{
                animationDelay: isExiting ? `${(entityTypes.length - index - 1) * 100}ms` : `${index * 100}ms`,
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1)'
              }}
            >
              {getIcon(type)}
              {t(`games.entityTypes.${type}`)}
            </button>
          ))}
        </div>
      </div>
    </>
  );
};
