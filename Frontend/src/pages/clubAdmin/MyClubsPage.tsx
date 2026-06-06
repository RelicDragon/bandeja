import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { ClubAvatar } from '@/components/ClubAvatar';
import { useClubAdminScrollContainer } from '@/components/clubAdmin/ClubAdminScrollContext';
import { useDebounce } from '@/components/CityMap/useDebounce';
import { useClubAdminForbidden } from '@/hooks/useClubAdminForbidden';
import { useClubAdminClubs } from '@/hooks/useClubAdminClubs';
import { useClubAdminScreen } from '@/clubAdmin/useClubAdminShell';
import { isClubOpenNow } from '@/utils/clubAdmin/openNow';

export function MyClubsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const handleForbidden = useClubAdminForbidden();
  const scrollRef = useClubAdminScrollContainer();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 300);
  const { items, total, loading, initialLoading, hasMore, error, loadMore } = useClubAdminClubs(
    handleForbidden,
    debouncedQuery
  );

  useClubAdminScreen({ title: t('clubAdmin.myClubs'), backTo: '/' });

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const root = scrollRef?.current ?? null;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loading) void loadMore();
      },
      { root, rootMargin: '120px', threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [scrollRef, hasMore, loading, loadMore, items.length]);

  return (
    <>
      {(total > 5 || query.trim().length > 0) && (
        <input
          type="search"
          className="mb-3 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
          placeholder={t('clubAdmin.searchClubs')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}
      {initialLoading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('common.loading')}</p>
        </div>
      ) : error && items.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">{t('clubAdmin.clubsLoadFailed')}</p>
      ) : items.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">{t('clubAdmin.noClubs')}</p>
      ) : (
        <div className="space-y-2">
          {items.map((c) => {
            const open = isClubOpenNow(c.openingTime, c.closingTime);
            return (
              <button
                key={c.id}
                type="button"
                className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 text-left transition-colors hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800"
                onClick={() => navigate(`${c.id}`)}
              >
                <ClubAvatar club={{ id: c.id, name: c.name, avatar: c.avatar }} variant="card" className="h-12 w-12 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate text-gray-900 dark:text-white">{c.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {c.city.name} · {t('clubAdmin.courtsCount', { count: c.courtsCount })}
                    {c.bookingsToday > 0 && ` · ${t('clubAdmin.bookingsToday', { count: c.bookingsToday })}`}
                  </p>
                  {open !== null && (
                    <p className={`text-xs ${open ? 'text-green-600' : 'text-gray-500 dark:text-gray-400'}`}>
                      {open ? t('clubAdmin.openNow') : t('clubAdmin.closedNow')}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
      {hasMore && (
        <div ref={sentinelRef} className="flex justify-center py-4">
          {loading && <Loader2 className="h-6 w-6 animate-spin text-primary-600" />}
        </div>
      )}
    </>
  );
}
