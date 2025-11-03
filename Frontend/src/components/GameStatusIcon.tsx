import { Megaphone, Play, Medal, Archive } from 'lucide-react';
import { GameStatus } from '@/types';

interface GameStatusIconProps {
  status: GameStatus;
  className?: string;
}

export const GameStatusIcon = ({ status, className = '' }: GameStatusIconProps) => {
  const getStatusIcon = (status: GameStatus) => {
    switch (status) {
      case 'ANNOUNCED':
        return <Megaphone size={16} />;
      case 'STARTED':
        return <Play size={16} />;
      case 'FINISHED':
        return <Medal size={16} />;
      case 'ARCHIVED':
        return <Archive size={16} />;
      default:
        return <Megaphone size={16} />;
    }
  };

  const getStatusColor = (status: GameStatus) => {
    switch (status) {
      case 'ANNOUNCED':
        return 'text-blue-600 dark:text-blue-400';
      case 'STARTED':
        return 'text-orange-600 dark:text-orange-400';
      case 'FINISHED':
        return 'text-gray-600 dark:text-gray-400';
      case 'ARCHIVED':
        return 'text-gray-500 dark:text-gray-500';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  return (
    <div className={`${getStatusColor(status)} ${className}`}>
      {getStatusIcon(status)}
    </div>
  );
};
