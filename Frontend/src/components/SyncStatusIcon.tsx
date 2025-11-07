import { Cloud, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SyncStatus } from '@/store/headerStore';

interface SyncStatusIconProps {
  status: SyncStatus;
  className?: string;
  onStatusChange?: (status: SyncStatus) => void;
}

export const SyncStatusIcon = ({ status, className = '', onStatusChange }: SyncStatusIconProps) => {
  const [isAnimating, setIsAnimating] = useState(false);
  const [displayStatus, setDisplayStatus] = useState(status);

  useEffect(() => {
    setIsAnimating(true);
    const timer = setTimeout(() => {
      setDisplayStatus(status);
      setIsAnimating(false);
    }, 150);
    return () => clearTimeout(timer);
  }, [status]);

  useEffect(() => {
    if (status === 'SUCCESS' && onStatusChange) {
      const timer = setTimeout(() => {
        onStatusChange('IDLE');
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [status, onStatusChange]);

  const getIcon = () => {
    switch (displayStatus) {
      case 'IDLE':
        return <Cloud size={18} className="text-gray-400 dark:text-gray-500" />;
      case 'SYNCING':
        return (
          <Loader2 
            size={18} 
            className="text-blue-500 dark:text-blue-400 animate-spin" 
          />
        );
      case 'SUCCESS':
        return <CheckCircle size={18} className="text-green-500 dark:text-green-400" />;
      case 'FAILED':
        return <XCircle size={18} className="text-red-500 dark:text-red-400" />;
      default:
        return <Cloud size={18} className="text-gray-400 dark:text-gray-500" />;
    }
  };

  return (
    <div 
      className={`transition-all duration-300 ${isAnimating ? 'opacity-0 scale-95' : 'opacity-100 scale-100'} ${className}`}
    >
      {getIcon()}
    </div>
  );
};
