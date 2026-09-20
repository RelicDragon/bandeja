import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerCloseButton,
} from '@/components/ui/Drawer';
import { OverlayKeyboardBody } from '@/components/ui/OverlayKeyboardBody';
import { Input } from '@/components/Input';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { shimmerBlock } from '@/components/motion/shimmerBlock';
import { useBackButtonModal } from '@/hooks/useBackButtonModal';
import { favoritesApi } from '@/api/favorites';
import { queryKeys } from '@/queries/queryKeys';
import type { BasicUser } from '@/types';
import { rankGiftCandidates } from './giftCandidates';

/**
 * PRD 355 — "Gift to a friend".
 *
 * Followers come first (they already chose to follow the giver), then everyone
 * the giver follows. The list is local-filtered, so typing never fires a query.
 */
interface ShopGiftPickerSheetProps {
  open: boolean;
  onClose: () => void;
  onPick: (user: BasicUser) => void;
}

export const ShopGiftPickerSheet = ({ open, onClose, onPick }: ShopGiftPickerSheetProps) => {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');

  useBackButtonModal(open, onClose, 'shop-gift-picker');

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.shop.giftCandidates,
    enabled: open,
    staleTime: 60_000,
    queryFn: async () => {
      const [followers, following] = await Promise.all([
        favoritesApi.getFollowers(),
        favoritesApi.getFollowing(),
      ]);
      return { followers, following };
    },
  });

  const candidates = useMemo(
    () => rankGiftCandidates(data?.followers ?? [], data?.following ?? [], search),
    [data?.followers, data?.following, search],
  );

  return (
    <Drawer open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DrawerContent accessibleTitle={t('shop.giftPickerTitle')}>
        <DrawerHeader className="flex items-center justify-between gap-3 text-start">
          <DrawerTitle>{t('shop.giftPickerTitle')}</DrawerTitle>
          <DrawerCloseButton onClick={onClose} aria-label={t('common.close')} />
        </DrawerHeader>

        <div className="px-4 pb-2">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('shop.giftPickerSearch')}
            aria-label={t('shop.giftPickerSearch')}
          />
        </div>

        <OverlayKeyboardBody>
          <div
            className="flex flex-col gap-1 px-2"
            style={{ paddingBottom: 'calc(0.75rem + var(--overlay-bottom-inset, 0px))' }}
          >
            {isLoading ? (
              [0, 1, 2, 3].map((index) => (
                <div key={index} className={`${shimmerBlock} h-14 rounded-xl`} />
              ))
            ) : candidates.length === 0 ? (
              <p className="px-2 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                {search ? t('shop.giftPickerNoMatches') : t('shop.giftPickerEmpty')}
              </p>
            ) : (
              candidates.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => onPick(user)}
                  className="flex min-h-[56px] w-full items-center gap-3 rounded-xl px-2 py-2 text-start hover:bg-gray-100 dark:hover:bg-gray-700/60"
                >
                  <PlayerAvatar player={user} showName={false} extrasmall asDiv subscribePresence={false} />
                  <span className="truncate text-sm font-medium text-gray-900 dark:text-white">
                    {`${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()}
                  </span>
                </button>
              ))
            )}
          </div>
        </OverlayKeyboardBody>
      </DrawerContent>
    </Drawer>
  );
};
