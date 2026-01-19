import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Search } from 'lucide-react';
import { PlayerAvatar } from '../PlayerAvatar';
import { GameParticipant } from '@/types';
import { matchesSearch } from '@/utils/transliteration';
import { BaseModal } from '@/components';

interface TeamPlayerSelectorProps {
  gameParticipants: GameParticipant[];
  onClose: () => void;
  onConfirm: (playerId: string) => void;
  selectedPlayerIds?: string[];
  title?: string;
}

export const TeamPlayerSelector = ({
  gameParticipants,
  onClose,
  onConfirm,
  selectedPlayerIds = [],
  title = 'Select Player'
}: TeamPlayerSelectorProps) => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(true);

  const handleClose = () => {
    setIsOpen(false);
    setTimeout(() => {
      onClose();
    }, 300);
  };

  const filteredParticipants = useMemo(() => {
    let filtered = gameParticipants.filter(p => p.isPlaying);

    // Filter out already selected players
    if (selectedPlayerIds.length > 0) {
      filtered = filtered.filter(p => !selectedPlayerIds.includes(p.userId));
    }

    if (searchQuery.trim()) {
      filtered = filtered.filter(p => {
        const fullName = `${p.user.firstName || ''} ${p.user.lastName || ''}`;
        return matchesSearch(searchQuery, fullName);
      });
    }

    return filtered.slice(0, 50);
  }, [gameParticipants, searchQuery, selectedPlayerIds]);

  const handlePlayerClick = (playerId: string) => {
    onConfirm(playerId);
    handleClose();
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={handleClose}
      isBasic
      modalId="team-player-selector"
      showCloseButton={false}
      closeOnBackdropClick={true}
    >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {title}
          </h2>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X size={20} className="text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
          <div className="relative">
            <Search
              size={20}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('common.search') || 'Search...'}
              className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
        </div>

        {filteredParticipants.length === 0 ? (
          <div className="flex items-center justify-center py-12 flex-1">
            <p className="text-gray-600 dark:text-gray-400">
              {selectedPlayerIds.length > 0 ? t('common.noResults') || 'No results found' : t('invites.noPlayersAvailable')}
            </p>
          </div>
        ) : (
          <div className="overflow-y-auto flex-1 min-h-0">
            {filteredParticipants.map((participant) => (
              <div
                key={participant.userId}
                className="flex items-center gap-3 p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer border-b border-gray-100 dark:border-gray-800 last:border-b-0"
                onClick={() => handlePlayerClick(participant.userId)}
              >
                <div className="flex-shrink-0">
                  <PlayerAvatar
                    player={participant.user}
                    showName={false}
                    smallLayout={true}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-base font-medium text-gray-900 dark:text-white truncate">
                    {participant.user.firstName} {participant.user.lastName}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
    </BaseModal>
  );
};
