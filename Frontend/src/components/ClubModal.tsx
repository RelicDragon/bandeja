import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Info } from 'lucide-react';
import { Club } from '@/types';
import { clubsApi } from '@/api/clubs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { ClubAvatar } from '@/components/ClubAvatar';
import { FullscreenImageViewer } from '@/components/FullscreenImageViewer';
import { ClubDetailPanel } from '@/components/ClubDetailPanel';

interface ClubModalProps {
  isOpen: boolean;
  onClose: () => void;
  clubs: Club[];
  selectedId: string;
  onSelect: (id: string) => void;
}

type Panel = 'list' | 'detail';

export const ClubModal = ({ isOpen, onClose, clubs, selectedId, onSelect }: ClubModalProps) => {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [panel, setPanel] = useState<Panel>('list');
  const [detailClub, setDetailClub] = useState<Club | null>(null);
  const [fullscreenUrl, setFullscreenUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setSearch('');
      setPanel('list');
      setDetailClub(null);
      setFullscreenUrl(null);
    }
  }, [isOpen]);

  const searchLower = search.trim().toLowerCase();
  const filteredClubs = useMemo(() => {
    if (!searchLower) return clubs;
    return clubs
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
      });
  }, [clubs, searchLower]);

  const scrollBodyRef = useRef<HTMLDivElement>(null);
  const listScrollContentRef = useRef<HTMLDivElement>(null);
  const [listBottomFade, setListBottomFade] = useState(false);

  const updateListBottomFade = useCallback(() => {
    const el = scrollBodyRef.current;
    if (!el || panel !== 'list' || clubs.length === 0 || filteredClubs.length === 0) {
      setListBottomFade(false);
      return;
    }
    const { scrollTop, scrollHeight, clientHeight } = el;
    const overflow = scrollHeight > clientHeight + 1;
    const distanceFromEnd = scrollHeight - scrollTop - clientHeight;
    const atBottom = distanceFromEnd <= 32;
    setListBottomFade(overflow && !atBottom);
  }, [panel, clubs.length, filteredClubs.length]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    updateListBottomFade();
    let alive = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (alive) updateListBottomFade();
      });
    });
    return () => {
      alive = false;
    };
  }, [isOpen, updateListBottomFade, search, filteredClubs.length, panel]);

  useEffect(() => {
    const outer = scrollBodyRef.current;
    if (!outer || !isOpen) return;
    const ro = new ResizeObserver(() => updateListBottomFade());
    ro.observe(outer);
    const inner = listScrollContentRef.current;
    if (inner) ro.observe(inner);
    updateListBottomFade();
    return () => ro.disconnect();
  }, [isOpen, panel, updateListBottomFade, filteredClubs.length, clubs.length]);

  const handleSelect = (id: string) => {
    onSelect(id);
    onClose();
  };

  const openDetail = async (club: Club, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDetailClub(club);
    setPanel('detail');
    try {
      const res = await clubsApi.getById(club.id);
      if (res.success && res.data) setDetailClub(res.data);
    } catch {
      /* keep list payload */
    }
  };

  const refreshDetailClub = async () => {
    if (!detailClub) return;
    try {
      const res = await clubsApi.getById(detailClub.id);
      if (res.success && res.data) setDetailClub(res.data);
    } catch {
      /* noop */
    }
  };

  return (
    <>
      <Dialog open={isOpen} onClose={onClose} modalId="club-modal">
        <DialogContent>
          <DialogHeader>
            {panel === 'list' ? (
              <DialogTitle>{t('createGame.selectClub')}</DialogTitle>
            ) : (
              <div className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  onClick={() => {
                    setPanel('list');
                    setDetailClub(null);
                  }}
                  className="p-1.5 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 shrink-0"
                  aria-label={t('createGame.clubDetailsBack')}
                >
                  <ChevronLeft size={22} />
                </button>
                <DialogTitle className="truncate min-w-0">{detailClub?.name}</DialogTitle>
              </div>
            )}
          </DialogHeader>
          <div className="relative flex min-h-0 flex-1 flex-col">
            <div
              ref={scrollBodyRef}
              onScroll={updateListBottomFade}
              className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-4"
            >
            {panel === 'list' ? (
              <div ref={listScrollContentRef} className="space-y-2 min-h-[80px]">
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
                        <div
                          key={club.id}
                          className={`flex items-stretch overflow-hidden rounded-lg transition-all ${
                            selectedId === club.id
                              ? 'bg-primary-500 text-white'
                              : 'bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => handleSelect(club.id)}
                            className={`flex-1 min-w-0 text-left flex items-stretch rounded-lg ${
                              selectedId === club.id
                                ? ''
                                : 'hover:bg-gray-100 dark:hover:bg-gray-700/80'
                            }`}
                          >
                            <div
                              className={`relative w-[4.125rem] shrink-0 self-stretch ${
                                selectedId === club.id ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-700'
                              }`}
                            >
                              <ClubAvatar
                                club={club}
                                variant="tile"
                                className={selectedId === club.id ? 'ring-2 ring-inset ring-white/40' : ''}
                              />
                            </div>
                            <div className="min-w-0 flex-1 py-3 pr-3 pl-3 flex flex-col justify-center">
                              <div className="font-medium truncate">{club.name}</div>
                              {club.address ? (
                                <div className={`text-sm mt-0.5 truncate ${selectedId === club.id ? 'opacity-90' : 'opacity-80'}`}>
                                  {club.address}
                                </div>
                              ) : null}
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => openDetail(club, e)}
                            className={`shrink-0 px-3 flex items-center justify-center rounded-r-lg border-l ${
                              selectedId === club.id
                                ? 'border-white/20 text-white hover:bg-white/10'
                                : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                            }`}
                            aria-label={t('createGame.clubInfo')}
                          >
                            <Info size={20} />
                          </button>
                        </div>
                      ))
                    )}
                  </>
                )}
              </div>
            ) : detailClub ? (
              <ClubDetailPanel
                club={detailClub}
                onOpenFullscreenPhoto={(url) => setFullscreenUrl(url)}
                onClubRefresh={refreshDetailClub}
              />
            ) : null}
            </div>
            {listBottomFade ? (
              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-14 bg-gradient-to-t from-white to-transparent dark:from-gray-900"
                aria-hidden
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
      {fullscreenUrl ? (
        <FullscreenImageViewer imageUrl={fullscreenUrl} isOpen onClose={() => setFullscreenUrl(null)} />
      ) : null}
    </>
  );
};
