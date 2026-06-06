import { Link2, MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ClubAvatar } from '@/components/ClubAvatar';
import { isClubOpenNow } from '@/utils/clubAdmin/openNow';

interface ClubAdminHomeHeroProps {
  club: {
    id: string;
    name: string;
    avatar?: string | null;
    city?: { name: string } | null;
    openingTime?: string | null;
    closingTime?: string | null;
    integrationActive?: boolean;
  };
}

export function ClubAdminHomeHero({ club }: ClubAdminHomeHeroProps) {
  const { t } = useTranslation();
  const open = isClubOpenNow(club.openingTime, club.closingTime);

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-br from-primary-50/70 via-white to-white p-4 dark:border-gray-800 dark:from-primary-950/40 dark:via-gray-900 dark:to-gray-900">
      <div className="flex items-center gap-3.5">
        <div className="relative h-[3.75rem] w-[3.75rem] shrink-0 overflow-hidden rounded-xl ring-1 ring-black/5 dark:ring-white/10">
          <ClubAvatar club={club} variant="tile" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold leading-snug text-gray-900 dark:text-white">
            {club.name}
          </h2>
          {club.city?.name && (
            <p className="mt-0.5 flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
              <MapPin className="h-3.5 w-3.5 shrink-0 opacity-70" strokeWidth={2} />
              <span className="truncate">{club.city.name}</span>
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <span
          className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-tight ${
            club.integrationActive
              ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400'
              : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
          }`}
        >
          <Link2 className="h-3 w-3 shrink-0" strokeWidth={2} />
          <span className="truncate">
            {club.integrationActive ? t('clubAdmin.integrationLinked') : t('clubAdmin.integrationNone')}
          </span>
        </span>
        {open !== null && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
              open
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${open ? 'bg-emerald-500' : 'bg-gray-400 dark:bg-gray-500'}`}
            />
            {open ? t('clubAdmin.openNow') : t('clubAdmin.closedNow')}
          </span>
        )}
      </div>
    </div>
  );
}
