import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, LayoutGrid, LogOut } from 'lucide-react';
import { ClubAvatar } from '@/components/ClubAvatar';
import { useDebounce } from '@/components/CityMap/useDebounce';
import { ConsoleSheet } from '@/components/clubAdmin/console/ConsoleSheet';
import { inputClass } from '@/components/clubAdmin/console/controls';
import { ErrorState, SkeletonRows } from '@/components/clubAdmin/console/primitives';
import { cx } from '@/components/clubAdmin/console/classes';
import { flattenClubs, useClubAdminClubsQuery } from '@/queries/clubAdmin';
import { switchClubPath } from './consoleNav';

const SEARCH_FROM = 8;

export function ClubSwitcherSheet({
  open,
  onOpenChange,
  currentClubId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentClubId: string;
}) {
  const { t } = useTranslation('clubAdmin');
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState('');
  const debounced = useDebounce(query, 250);
  const clubs = useClubAdminClubsQuery(debounced, open);
  const items = flattenClubs(clubs.data?.pages);
  const total = clubs.data?.pages[0]?.total ?? items.length;

  const go = (to: string, replace = false) => {
    onOpenChange(false);
    navigate(to, { replace });
  };

  const rowCls =
    'flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-start transition-colors duration-150 hover:bg-muted focus-visible:bg-muted focus-visible:outline-none';

  return (
    <ConsoleSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('switcher.title')}
      modalId="club-admin-switcher"
    >
      <div className="space-y-3">
        {total > SEARCH_FROM || query ? (
          <input
            type="search"
            className={inputClass}
            placeholder={t('picker.search')}
            aria-label={t('picker.search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        ) : null}
        {clubs.isPending ? (
          <SkeletonRows rows={3} />
        ) : clubs.isError ? (
          <ErrorState compact onRetry={() => void clubs.refetch()} />
        ) : (
          <ul className="space-y-0.5" aria-label={t('switcher.listLabel')}>
            {items.map((c) => {
              const current = c.id === currentClubId;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    className={cx(rowCls, current && 'bg-muted/70')}
                    aria-current={current ? 'true' : undefined}
                    onClick={() => (current ? onOpenChange(false) : go(switchClubPath(location.pathname, c.id), true))}
                  >
                    <ClubAvatar club={{ id: c.id, name: c.name, avatar: c.avatar }} className="h-10 w-10 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium text-foreground">{c.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{c.city.name}</span>
                    </span>
                    {current ? <Check className="h-5 w-5 text-primary-600 dark:text-primary-400" aria-hidden /> : null}
                  </button>
                </li>
              );
            })}
            {clubs.hasNextPage ? (
              <li>
                <button
                  type="button"
                  className={cx(rowCls, 'justify-center text-sm font-medium text-primary-600 dark:text-primary-400')}
                  onClick={() => void clubs.fetchNextPage()}
                  disabled={clubs.isFetchingNextPage}
                >
                  {t('common.showMore')}
                </button>
              </li>
            ) : null}
          </ul>
        )}
        <div className="space-y-0.5 border-t border-border pt-2">
          <button type="button" className={rowCls} onClick={() => go('/my-clubs')}>
            <LayoutGrid className="h-5 w-5 text-muted-foreground" aria-hidden />
            <span className="text-[15px] text-foreground">{t('switcher.allClubs')}</span>
          </button>
          <button type="button" className={rowCls} onClick={() => go('/')}>
            <LogOut className="h-5 w-5 text-muted-foreground rtl:-scale-x-100" aria-hidden />
            <span className="text-[15px] text-foreground">{t('nav.backToApp')}</span>
          </button>
        </div>
      </div>
    </ConsoleSheet>
  );
}
