import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MessagesSquare, Repeat } from 'lucide-react';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/queries/queryKeys';
import { isGameSeriesEnabled } from '@/config/featureFlags';
import { buildSeriesPath } from '@/deepLinks/catalog';
import { seriesApi } from '@/api/series';
import { useAuthStore } from '@/store/authStore';
import { SeriesNextWeekCard } from './SeriesNextWeekCard';
import { SeriesOrganizerStrip } from './SeriesOrganizerStrip';
import { SeriesRepeatSheet } from './SeriesRepeatSheet';
import { useSeriesGameContext } from './useSeries';

/**
 * PRD 345 — everything series-related on a game's details page, in one block.
 *
 * Top to bottom: the "Same time next week?" card for a finished occurrence, the
 * organizer strip (owner or platform admin, only when a next occurrence exists)
 * and the quiet "Part of *Tuesday Regulars* · week 12" line linking to the
 * series.
 *
 * Renders nothing at all when the flag is off or the game is not part of a
 * series — no shell, no skeleton, no request.
 */

export interface SeriesGameSectionProps {
  gameId: string;
  /** `true` once the occurrence has results or is over — gates the prompt card. */
  isFinished: boolean;
  clubName?: string | null;
  clubAvatarUrl?: string | null;
  className?: string;
}

export const SeriesGameSection = ({
  gameId,
  isFinished,
  clubName,
  clubAvatarUrl,
  className = '',
}: SeriesGameSectionProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const viewerIsPlatformAdmin = useAuthStore((state) => state.user?.isAdmin ?? false);
  const [editOpen, setEditOpen] = useState(false);
  const [openingChat, setOpeningChat] = useState(false);

  const { data: context } = useSeriesGameContext(gameId, isGameSeriesEnabled());
  const seriesId = context?.label?.seriesId ?? null;

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.series.nextPrompt(gameId) });
  }, [gameId, queryClient]);

  const handleOpenChat = useCallback(async () => {
    if (!seriesId || openingChat) return;
    setOpeningChat(true);
    try {
      const response = await seriesApi.openChat(seriesId);
      navigate(`/group-chat/${response.data.data.groupChannelId}`);
    } catch {
      toast.error(t('series.chatUnavailable'));
    } finally {
      setOpeningChat(false);
    }
  }, [navigate, openingChat, seriesId, t]);

  if (!isGameSeriesEnabled() || !context) return null;

  const { label, viewerIsOwner, settings, next } = context;
  if (!label && !next) return null;

  const showPrompt = Boolean(
    next && isFinished && next.viewerIsRegular && !next.viewerIsPlaying,
  );

  return (
    <div className={`flex flex-col gap-2 ${className}`.trim()}>
      {showPrompt && next && (
        <SeriesNextWeekCard
          prompt={next}
          sourceGameId={gameId}
          clubName={clubName}
          clubAvatarUrl={clubAvatarUrl}
          onOpenSeries={(seriesId) => navigate(`/series/${seriesId}`)}
        />
      )}

      {/* Skip next / Edit series are `assertSeriesOwner`-gated, and that guard
          accepts the series owner *or* a platform admin — so the strip shows to
          exactly those two, never to a viewer whose taps would 403. */}
      {(viewerIsOwner || viewerIsPlatformAdmin) && next && (
        <SeriesOrganizerStrip
          prompt={next}
          onEditSeries={() => setEditOpen(true)}
          onSkipped={refresh}
        />
      )}

      {/* The "Part of <series> · week N" line lives in `SeriesTitleLine`, under
          the game title, where the PRD puts it — and where a guest sees it too. */}

      {label && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <button
            type="button"
            onClick={() => navigate(buildSeriesPath(label.seriesId))}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-1 text-start text-xs text-gray-500 underline-offset-2 hover:underline dark:text-gray-400"
          >
            <Repeat className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">{t('series.openSeries')}</span>
          </button>

          {/* PRD 345 story 12 — the series group chat, reachable from the
              occurrence and not only from the series page. The owner's tap
              creates the channel on first use; a regular's tap opens the one
              that already exists, and gets a plain error if it does not. */}
          <button
            type="button"
            onClick={handleOpenChat}
            disabled={openingChat}
            aria-busy={openingChat}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-1 text-start text-xs text-gray-500 underline-offset-2 hover:underline disabled:opacity-60 dark:text-gray-400"
          >
            <MessagesSquare className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">{t('series.openChat')}</span>
          </button>
        </div>
      )}

      {label && (
        <SeriesRepeatSheet
          open={editOpen}
          onClose={() => setEditOpen(false)}
          mode="edit"
          seriesId={label.seriesId}
          initial={{
            cadence: label.cadence,
            weekday: label.weekday,
            startTimeLocal: label.startTimeLocal,
            endsOn: settings.endsOn,
            seatDeadlineHours: settings.seatDeadlineHours,
            horizonDays: settings.horizonDays,
          }}
          regulars={(next?.regulars ?? []).map((regular) => ({
            userId: regular.userId,
            name: [regular.firstName, regular.lastName].filter(Boolean).join(' ').trim(),
            avatar: regular.avatar,
          }))}
          onSaved={refresh}
        />
      )}
    </div>
  );
};
