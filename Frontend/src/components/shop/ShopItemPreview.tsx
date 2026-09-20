import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Sticker } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { frameClass, nameColorClass, chatAccentClass } from '@/features/collection/collectionAssets';
import type { ShopItem } from '@/api/shop';
import type { ShopPreviewContext } from './shopFormat';
import '@/styles/collection.css';

/**
 * PRD 355 — a live preview of one catalogue item, rendered on the viewer's own
 * identity so "how would this look on me?" needs no imagination.
 *
 * The whole preview is one labelled `role="img"`: screen readers get a sentence
 * ("Neon Frame shown on your profile picture") instead of the decorative parts.
 */

interface ShopItemPreviewProps {
  item: ShopItem;
  context: ShopPreviewContext;
  /** `lg` is the item sheet and the featured carousel; `md` is a grid card. */
  size?: 'md' | 'lg';
  className?: string;
}

function initialsOf(firstName?: string | null, lastName?: string | null): string {
  const first = (firstName ?? '').trim().charAt(0);
  const last = (lastName ?? '').trim().charAt(0);
  return `${first}${last}`.toUpperCase() || '?';
}

export const ShopItemPreview = ({ item, context, size = 'md', className = '' }: ShopItemPreviewProps) => {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);

  const avatarSize = size === 'lg' ? 'h-20 w-20 text-xl' : 'h-14 w-14 text-base';
  const smallAvatarSize = 'h-9 w-9 text-xs';
  const displayName = `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || t('shop.previewYou');

  const frame = item.kind === 'PROFILE_FRAME' ? frameClass(item.assetKey) : null;
  const nameColor = item.kind === 'NAME_COLOR' ? nameColorClass(item.assetKey) : null;
  const accent = item.kind === 'CHAT_ACCENT' ? chatAccentClass(item.assetKey) : null;

  const avatar = (sizeClass: string, small = false) => (
    <div
      className={`relative flex-shrink-0 rounded-full ${sizeClass} ${
        frame ? `${frame}${small ? ' collection-frame-sm' : ''}` : ''
      }`}
    >
      <div className="absolute inset-0 overflow-hidden rounded-full bg-primary-600 dark:bg-primary-700 flex items-center justify-center font-semibold text-white">
        {user?.avatar ? (
          <img src={user.avatar} alt="" className="h-full w-full object-cover" />
        ) : (
          initialsOf(user?.firstName, user?.lastName)
        )}
      </div>
    </div>
  );

  const name = (extra = '') => (
    <span className={`${nameColor ?? ''} truncate font-semibold text-gray-900 dark:text-white ${extra}`}>
      {displayName}
    </span>
  );

  const label = t('shop.previewAlt', {
    name: item.name,
    context: t(`shop.previewContext.${context}`),
  });

  let body: ReactNode;

  if (item.kind === 'STICKER_PACK') {
    body = (
      <div className="flex items-center justify-center gap-2">
        {item.previewUrl ? (
          <img
            src={item.previewUrl}
            alt=""
            className={size === 'lg' ? 'h-24 w-24 object-contain' : 'h-16 w-16 object-contain'}
          />
        ) : (
          [0, 1, 2].map((index) => (
            <div
              key={index}
              className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800"
            >
              <Sticker size={22} className="text-gray-500 dark:text-gray-400" />
            </div>
          ))
        )}
      </div>
    );
  } else if (context === 'chat') {
    body = (
      <div className="flex w-full items-end justify-end gap-2">
        <div
          className={`max-w-[70%] rounded-2xl px-3 py-2 text-sm ${
            accent ?? 'bg-primary-600 text-white'
          }`}
        >
          {t('shop.previewBubble')}
        </div>
        {avatar(smallAvatarSize, true)}
      </div>
    );
  } else if (context === 'roster') {
    body = (
      <div className="flex w-full items-center gap-3">
        {avatar(smallAvatarSize, true)}
        <div className="flex min-w-0 flex-1 flex-col">
          {name('text-sm')}
          <span className="truncate text-xs text-gray-500 dark:text-gray-400">
            {t('shop.previewRosterHint')}
          </span>
        </div>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
          4.0
        </span>
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col items-center gap-2">
        {avatar(avatarSize)}
        {name(size === 'lg' ? 'text-base' : 'text-sm')}
      </div>
    );
  }

  return (
    <div
      role="img"
      aria-label={label}
      className={`flex min-h-[88px] w-full items-center justify-center ${className}`}
    >
      {body}
    </div>
  );
};
