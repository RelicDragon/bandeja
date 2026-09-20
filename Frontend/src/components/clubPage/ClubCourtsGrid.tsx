import { useTranslation } from 'react-i18next';
import { Camera, Home, Sun } from 'lucide-react';
import type { PublicClubCourt } from '@/api/clubPublic';
import { getSportConfig } from '@/sport/sportRegistry';

type ClubCourtsGridProps = {
  courts: PublicClubCourt[];
};

/**
 * Surface strings are free-form operator data (`ARTIFICIAL_GRASS`, `artificial
 * grass`, `Clay`, …) with no fixed vocabulary, so there is nothing to
 * translate against. Render the operator's own value, just de-shouted.
 */
function humanizeSurface(surfaceType: string | null): string | null {
  const raw = surfaceType?.trim();
  if (!raw) return null;
  if (raw !== raw.toUpperCase()) return raw;
  const words = raw.toLowerCase().split(/[_\s-]+/).filter(Boolean);
  if (words.length === 0) return null;
  return [words[0].charAt(0).toUpperCase() + words[0].slice(1), ...words.slice(1)].join(' ');
}

/**
 * PRD 354 — compact court grid.
 *
 * Every tile carries a full label ("Court 3, indoor, artificial grass") so the
 * indoor/outdoor icon is never the only carrier of that information.
 */
export function ClubCourtsGrid({ courts }: ClubCourtsGridProps) {
  const { t } = useTranslation();

  if (courts.length === 0) return null;

  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {courts.map((court) => {
        const surface = humanizeSurface(court.surfaceType);
        const environment = t(court.isIndoor ? 'clubPage.courts.indoor' : 'clubPage.courts.outdoor');
        const sportLabel = court.sport ? t(getSportConfig(court.sport).labelKey) : null;
        const fullLabel = [court.name, environment, surface, sportLabel].filter(Boolean).join(', ');

        return (
          <li
            key={court.id}
            className="flex min-h-[44px] flex-col gap-1 rounded-2xl border border-gray-200/90 bg-white p-3 dark:border-gray-700 dark:bg-gray-900"
          >
            {/* `aria-label` on a `listitem` is author-allowed but NVDA in browse
                mode reads the item's *contents*, so a tile whose every child is
                `aria-hidden` reads as an empty list item. A real `sr-only` node
                is the portable way to carry the full label. */}
            <span className="sr-only">{fullLabel}</span>
            <span className="flex items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-gray-900 dark:text-white" aria-hidden>
                {court.name}
              </span>
              {court.webCameraUrl ? (
                <Camera size={12} className="shrink-0 text-primary-500" aria-hidden />
              ) : null}
            </span>
            <span className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400" aria-hidden>
              {court.isIndoor ? <Home size={11} /> : <Sun size={11} />}
              {environment}
            </span>
            {surface ? (
              <span className="truncate text-[11px] text-gray-500 dark:text-gray-400" aria-hidden>
                {surface}
              </span>
            ) : null}
            {sportLabel ? (
              <span className="truncate text-[11px] text-gray-400 dark:text-gray-500" aria-hidden>
                {sportLabel}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
