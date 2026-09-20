import { useTranslation } from 'react-i18next';
import type { ClubRegular } from '@/api/clubPublic';
import { PlayerAvatarFace } from '@/components/PlayerAvatarFace';
import { pressScaleGuard } from '@/components/motion/pressScale';
import { usePlayerCardModal } from '@/hooks/usePlayerCardModal';
import { userAvatarTinyUrlFromStandard } from '@/utils/userAvatarTinyUrl';

type ClubRegularsRowProps = {
  regulars: ClubRegular[];
};

function initialsOf(regular: ClubRegular): string {
  const first = regular.firstName?.trim()?.[0] ?? '';
  const last = regular.lastName?.trim()?.[0] ?? '';
  return `${first}${last}`.toUpperCase() || '?';
}

function displayName(regular: ClubRegular): string {
  return [regular.firstName, regular.lastName].filter(Boolean).join(' ').trim();
}

/**
 * PRD 354 — "Regulars": the players who show up here most often.
 *
 * Faces only. The projection behind this row carries no rating and no play
 * count on purpose (see the backend service), so this must not be rendered with
 * `PlayerAvatar`, which would imply level data it does not have. Tapping a face
 * opens the normal player card, which fetches the full profile.
 */
export function ClubRegularsRow({ regulars }: ClubRegularsRowProps) {
  const { t } = useTranslation();
  const { openPlayerCard } = usePlayerCardModal();

  if (regulars.length === 0) return null;

  return (
    <ul className="-mx-2 flex gap-3 overflow-x-auto px-2 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {regulars.map((regular) => {
        const name = displayName(regular);
        return (
          <li key={regular.id} className="shrink-0">
            <button
              type="button"
              onClick={() => openPlayerCard(regular.id, regular.primarySport)}
              aria-label={t('clubPage.regulars.open', { name: name || t('clubPage.regulars.unnamed') })}
              className={`flex min-h-[44px] w-16 flex-col items-center gap-1 rounded-xl p-1 transition-transform duration-200 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 ${pressScaleGuard}`}
            >
              <span className="relative block h-12 w-12">
                <PlayerAvatarFace
                  avatar={regular.avatar}
                  tinyUrl={userAvatarTinyUrlFromStandard(regular.avatar)}
                  initials={initialsOf(regular)}
                  alt={name}
                  textClassName="text-sm"
                />
              </span>
              <span className="w-full truncate text-center text-[11px] text-gray-600 dark:text-gray-300">
                {regular.firstName ?? ''}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
