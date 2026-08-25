import { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Search } from 'lucide-react';
import { Club, EntityType, Sport } from '@/types';
import { clubsApi } from '@/api/clubs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { FullscreenImageViewer } from '@/components/FullscreenImageViewer';
import { ClubDetailPanel } from '@/components/ClubDetailPanel';
import { BrowseCityChip } from '@/components/browseCity/BrowseCityChip';
import { CityPickerEmbed } from '@/components/browseCity/CityPickerEmbed';
import { ClubVenueList } from '@/components/clubPicker/ClubVenueList';
import { useClubVenuePicker } from '@/hooks/useClubVenuePicker';
import { useBrowseCityStore } from '@/store/browseCityStore';

interface ClubModalProps {
  isOpen: boolean;
  onClose: () => void;
  clubs: Club[];
  selectedId: string;
  onSelect: (id: string, club?: Club) => void;
  cityId?: string;
  onVenueCityChange?: (cityId: string, snapshot?: { name: string; country: string }) => void;
  entityType?: EntityType;
  preferredSport?: Sport | null;
}

type Panel = 'list' | 'detail' | 'city';

export const ClubModal = ({
  isOpen,
  onClose,
  clubs,
  selectedId,
  onSelect,
  cityId,
  onVenueCityChange,
  entityType,
  preferredSport,
}: ClubModalProps) => {
  const { t } = useTranslation();
  const recents = useBrowseCityStore((s) => s.recents);
  const [search, setSearch] = useState('');
  const [panel, setPanel] = useState<Panel>('list');
  const [detailClub, setDetailClub] = useState<Club | null>(null);
  const [fullscreenUrl, setFullscreenUrl] = useState<string | null>(null);

  const selectedClub = clubs.find((c) => c.id === selectedId);
  const seedCity = selectedClub?.city ?? clubs.find((c) => c.cityId === cityId)?.city;
  const venue = useClubVenuePicker({
    isOpen,
    cityId,
    selectedClubCityId: selectedClub?.cityId,
    selectedId,
    entityType,
    preferredSport,
    search,
    seedName: seedCity?.name,
    seedCountry: seedCity?.country,
  });

  useEffect(() => {
    if (!isOpen) {
      setSearch('');
      setPanel('list');
      setDetailClub(null);
      setFullscreenUrl(null);
    }
  }, [isOpen]);

  const scrollBodyRef = useRef<HTMLDivElement>(null);
  const listScrollContentRef = useRef<HTMLDivElement>(null);
  const [listBottomFade, setListBottomFade] = useState(false);
  const listCount = venue.displayed.here.length + venue.displayed.elsewhere.reduce((n, g) => n + g.clubs.length, 0);

  const updateListBottomFade = useCallback(() => {
    const el = scrollBodyRef.current;
    if (!el || panel !== 'list' || listCount === 0) {
      setListBottomFade(false);
      return;
    }
    const { scrollTop, scrollHeight, clientHeight } = el;
    const overflow = scrollHeight > clientHeight + 1;
    const distanceFromEnd = scrollHeight - scrollTop - clientHeight;
    setListBottomFade(overflow && distanceFromEnd > 32);
  }, [listCount, panel]);

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
  }, [isOpen, updateListBottomFade, search, listCount, panel]);

  useEffect(() => {
    const outer = scrollBodyRef.current;
    if (!outer || !isOpen) return;
    const ro = new ResizeObserver(() => updateListBottomFade());
    ro.observe(outer);
    const inner = listScrollContentRef.current;
    if (inner) ro.observe(inner);
    updateListBottomFade();
    return () => ro.disconnect();
  }, [isOpen, panel, updateListBottomFade, listCount]);

  const handleSelect = (club: Club) => {
    if (club.cityId && club.cityId !== venue.venueCityId) {
      const snapshot = club.city
        ? { name: club.city.name, country: club.city.country }
        : undefined;
      venue.applyCity(club.cityId, snapshot);
      onVenueCityChange?.(club.cityId, snapshot);
    }
    onSelect(club.id, club);
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

  const closeCityPicker = () => setPanel('list');
  const closeDetail = () => {
    setPanel('list');
    setDetailClub(null);
  };
  const dismiss = () => {
    if (panel === 'city') {
      closeCityPicker();
      return;
    }
    if (panel === 'detail') {
      closeDetail();
      return;
    }
    onClose();
  };

  return (
    <>
      <Dialog open={isOpen} onClose={dismiss} modalId="club-modal">
        <DialogContent
          className="overflow-hidden"
          showCloseButton={panel !== 'city'}
          onEscapeKeyDown={(event) => {
            if (panel === 'city' || panel === 'detail') {
              event.preventDefault();
              dismiss();
            }
          }}
        >
          {panel === 'city' ? (
            <>
              <DialogTitle className="sr-only">{t('browseCity.changeCity')}</DialogTitle>
              <CityPickerEmbed
                selectedId={venue.venueCityId}
                recentCityIds={recents.filter((id) => id !== venue.homeCityId)}
                onClose={closeCityPicker}
                onSelect={(id, city) => {
                  const snapshot = city ? { name: city.name, country: city.country } : undefined;
                  setSearch('');
                  venue.applyCity(id, snapshot);
                  onVenueCityChange?.(id, snapshot);
                }}
              />
            </>
          ) : null}
          <div
            className={`flex min-h-0 flex-1 flex-col ${panel === 'city' ? 'pointer-events-none invisible' : ''}`}
            aria-hidden={panel === 'city'}
            inert={panel === 'city' ? true : undefined}
          >
          <div data-overlay-chrome="" className="sticky top-0 z-10 shrink-0 bg-white dark:bg-gray-900">
          <DialogHeader>
            {panel === 'detail' ? (
              <div className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  onClick={closeDetail}
                  className="shrink-0 rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                  aria-label={t('createGame.clubDetailsBack')}
                >
                  <ChevronLeft size={22} />
                </button>
                <DialogTitle className="min-w-0 truncate">{detailClub?.name}</DialogTitle>
              </div>
            ) : (
              <div className="flex min-w-0 items-center justify-between gap-3 pr-8">
                <DialogTitle className="min-w-0 truncate">{t('createGame.selectClub')}</DialogTitle>
                <BrowseCityChip
                  cityName={venue.cityName}
                  isAway={venue.isAway}
                  testId="venue-city-chip"
                  ariaHome={t('browseCity.chipAriaVenueHome', { city: venue.cityName })}
                  ariaAway={t('browseCity.chipAriaVenueAway', { city: venue.cityName })}
                  onClick={() => setPanel('city')}
                />
              </div>
            )}
          </DialogHeader>
          {panel === 'list' ? (
            <div className="shrink-0 px-4 pb-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('browseCity.searchClubs')}
                  className="w-full rounded-2xl border border-gray-200/90 bg-gray-50/80 py-2.5 pl-10 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-gray-700 dark:bg-gray-800/60 dark:text-white dark:placeholder-gray-500 dark:focus:border-primary-500 dark:focus:bg-gray-900"
                />
              </div>
            </div>
          ) : null}
          </div>
          <div className="relative flex min-h-0 flex-1 flex-col">
            {panel === 'detail' && detailClub ? (
              <div
                ref={scrollBodyRef}
                data-overlay-scrollport=""
                className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-4"
              >
                <ClubDetailPanel
                  club={detailClub}
                  onOpenFullscreenPhoto={(url) => setFullscreenUrl(url)}
                  onClubRefresh={refreshDetailClub}
                />
              </div>
            ) : (
              <>
                <div
                  ref={scrollBodyRef}
                  data-overlay-scrollport=""
                  onScroll={updateListBottomFade}
                  className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 pb-4"
                >
                  <div ref={listScrollContentRef} className="min-h-[80px]">
                    <ClubVenueList
                      here={venue.displayed.here}
                      elsewhere={venue.displayed.elsewhere}
                      selectedId={selectedId}
                      query={search}
                      cityName={venue.cityName}
                      loading={venue.loading}
                      onSelect={handleSelect}
                      onInfoClick={openDetail}
                      onViewCity={(id, snapshot) => {
                        setSearch('');
                        venue.applyCity(id, snapshot);
                        onVenueCityChange?.(id, snapshot);
                      }}
                    />
                  </div>
                </div>
                {listBottomFade ? (
                  <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-14 bg-gradient-to-t from-white to-transparent dark:from-gray-900"
                    aria-hidden
                  />
                ) : null}
              </>
            )}
          </div>
          </div>
        </DialogContent>
      </Dialog>
      {fullscreenUrl ? (
        <FullscreenImageViewer imageUrl={fullscreenUrl} isOpen onClose={() => setFullscreenUrl(null)} />
      ) : null}
    </>
  );
};
