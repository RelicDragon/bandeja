import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Club } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';

interface ClubModalProps {
  isOpen: boolean;
  onClose: () => void;
  clubs: Club[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export const ClubModal = ({ isOpen, onClose, clubs, selectedId, onSelect }: ClubModalProps) => {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!isOpen) setSearch('');
  }, [isOpen]);

  const searchLower = search.trim().toLowerCase();
  const filteredClubs = searchLower
    ? clubs
        .filter(
          (c) =>
            c.name.toLowerCase().includes(searchLower) ||
            (c.normalizedName?.toLowerCase().includes(searchLower) ?? false)
        )
        .sort((a, b) => {
          const rank = (c: Club) => {
            if (c.name.toLowerCase().includes(searchLower)) return 1;
            if (c.normalizedName?.toLowerCase().includes(searchLower)) return 2;
            return 3;
          };
          return rank(a) - rank(b);
        })
    : clubs;

  const handleSelect = (id: string) => {
    onSelect(id);
    onClose();
  };

  return (
    <Dialog open={isOpen} onClose={onClose} modalId="club-modal">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('createGame.selectClub')}</DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto flex-1 p-4">
          <div className="space-y-2 min-h-[80px]">
            {clubs.length === 0 ? (
              <p className="text-center text-gray-500 dark:text-gray-400 py-8">{t('createGame.noClubsAvailable')}</p>
            ) : (
              <>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('common.search')}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 mb-2"
                />
                {filteredClubs.length === 0 ? (
                  <p className="text-center text-gray-500 dark:text-gray-400 py-4">{t('common.noResults')}</p>
                ) : (
                  filteredClubs.map((club) => (
                    <button
                      key={club.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelect(club.id);
                      }}
                      className={`w-full text-left px-4 py-3 rounded-lg transition-all ${
                        selectedId === club.id
                          ? 'bg-primary-500 text-white'
                          : 'bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      <div className="font-medium">{club.name}</div>
                      {club.address && <div className="text-sm opacity-80 mt-0.5">{club.address}</div>}
                    </button>
                  ))
                )}
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
