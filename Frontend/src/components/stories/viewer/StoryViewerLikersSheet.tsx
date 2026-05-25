import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Drawer, DrawerContent } from '@/components/ui/Drawer';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { storyEngagementApi } from '@/api/storyEngagement';
import type { StorySourceType } from '@/api/stories';
import type { BasicUser } from '@/types';
import { formatStoryEngagementCount } from './storyEngagementFormat';

type StoryViewerLikersSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceType: StorySourceType;
  sourceId: string;
  ownerUserId: string;
  likeCount: number;
};

export function StoryViewerLikersSheet({
  open,
  onOpenChange,
  sourceType,
  sourceId,
  ownerUserId,
  likeCount,
}: StoryViewerLikersSheetProps) {
  const { t } = useTranslation();
  const [users, setUsers] = useState<BasicUser[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const fetchPage = useCallback(
    async (nextCursor?: string) => {
      setLoading(true);
      setError(false);
      try {
        const page = await storyEngagementApi.getLikers(
          sourceType,
          sourceId,
          ownerUserId,
          nextCursor
        );
        setUsers((prev) => (nextCursor ? [...prev, ...page.users] : page.users));
        setCursor(page.nextCursor);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    },
    [sourceType, sourceId, ownerUserId]
  );

  useEffect(() => {
    if (!open) {
      setUsers([]);
      setCursor(null);
      setError(false);
      return;
    }
    void fetchPage();
  }, [open, fetchPage]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        className="flex max-h-[min(55vh,520px)] min-h-0 flex-col overflow-hidden !pb-0 z-[60]"
        aria-labelledby="story-likers-title"
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-gray-300 dark:bg-gray-600" />
        <div className="shrink-0 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <h2 id="story-likers-title" className="text-center text-base font-semibold">
            {t('stories.viewer.likersTitle')}
            {likeCount > 0 ? ` · ${formatStoryEngagementCount(likeCount)}` : ''}
          </h2>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
          {loading && users.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">{t('common.loading')}</p>
          ) : error ? (
            <p className="py-8 text-center text-sm text-red-500">{t('stories.viewer.loadFailed')}</p>
          ) : users.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">{t('stories.viewer.noLikers')}</p>
          ) : (
            <>
              {users.map((user) => (
                <div key={user.id} className="flex items-center gap-3 py-2">
                  <PlayerAvatar player={user} showName extrasmall />
                </div>
              ))}
              {cursor ? (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void fetchPage(cursor)}
                  className="mx-auto mt-2 block text-sm font-semibold text-sky-600 disabled:opacity-50"
                >
                  {loading ? t('common.loading') : t('stories.viewer.loadMore')}
                </button>
              ) : null}
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
