import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Share } from '@capacitor/share';
import { Card, ConfirmationModal } from '@/components';
import { ShareModal } from '@/components/ShareModal';
import { GameCancelled } from '@/components/GameDetails/GameCancelled';
import { RefreshIndicator } from '@/components/RefreshIndicator';
import { EventHeroSlideshow } from '@/components/eventDetails/EventHeroSlideshow';
import { EventPosterHeader } from '@/components/eventDetails/EventPosterHeader';
import { EventMetaBlock } from '@/components/eventDetails/EventMetaBlock';
import { EventPartnerBoard } from '@/components/eventDetails/EventPartnerBoard';
import { EventGoingRow } from '@/components/eventDetails/EventGoingRow';
import { EventStickyCtas } from '@/components/eventDetails/EventStickyCtas';
import { EventApprovalBanner } from '@/components/eventDetails/EventApprovalBanner';
import { EventEditListingModal } from '@/components/eventDetails/EventEditListingModal';
import { useEventRsvp } from '@/hooks/useEventRsvp';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { gamesApi, normalizeGameFromApi } from '@/api';
import { useAuthStore } from '@/store/authStore';
import { useShellNavStore } from '@/store/shellNavStore';
import { useGameDetailsChromeStore } from '@/components/GameDetails/gameDetailsChromeStore';
import { useSocketEventsStore } from '@/store/socketEventsStore';
import { SportLevelProvider } from '@/contexts/SportLevelContext';
import { isCapacitor } from '@/utils/capacitor';
import { getShareUrl } from '@/utils/shareUrl';
import { openExternalUrl } from '@/utils/openExternalUrl';
import { parseGameSport } from '@/utils/gameSport';
import { getGameParticipationState } from '@/utils/gameParticipationState';
import { isEventApproved } from '@shared/eventApproval';
import { retainGameRoom, releaseGameRoom } from '@/services/gameRoomMembership';
import { isCancelledGame410Payload, layoutInfoFrom410 } from '@/utils/cancelledGameChatStub';
import type { Game } from '@/types';
import type { CancelledGameParticipantSnapshot } from '@/utils/cancelledGameChatStub';

type EventCancelledLayoutInfo = {
  entityType: string;
  name: string | null;
  sport?: import('@/types').Sport;
  cancelledAt: string;
  cancelledByUser?: import('@/types').BasicUser | null;
  participants?: CancelledGameParticipantSnapshot[];
};

export type EventDetailsContentProps = {
  initialGame?: Game | null;
  layoutCancelledInfo?: EventCancelledLayoutInfo | null;
};

export function EventDetailsContent({
  initialGame = null,
  layoutCancelledInfo,
}: EventDetailsContentProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const setBottomTabsVisible = useShellNavStore((s) => s.setBottomTabsVisible);
  const setGameDetailsCanAccessChat = useGameDetailsChromeStore((s) => s.setGameDetailsCanAccessChat);
  const lastGameUpdate = useSocketEventsStore((s) => s.lastGameUpdate);
  const lastGameCancelled = useSocketEventsStore((s) => s.lastGameCancelled);
  const clearLastGameCancelled = useSocketEventsStore((s) => s.clearLastGameCancelled);

  const [game, setGame] = useState<Game | null>(initialGame?.id === id ? initialGame : null);
  const [loading, setLoading] = useState(!initialGame || initialGame.id !== id);
  const [cancelledInfo, setCancelledInfo] = useState(layoutCancelledInfo ?? null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState('');

  const rsvp = useEventRsvp(game, setGame);
  const participation = getGameParticipationState(game?.participants ?? [], user?.id, game);
  const canEdit = !!(participation.isOwner || user?.isAdmin);
  const canAccessChat =
    participation.isPlaying || !!participation.userParticipant?.lookingForPartner;

  useEffect(() => {
    setBottomTabsVisible(false);
    return () => setBottomTabsVisible(true);
  }, [setBottomTabsVisible]);

  useEffect(() => {
    setGameDetailsCanAccessChat(canAccessChat);
    return () => setGameDetailsCanAccessChat(false);
  }, [canAccessChat, setGameDetailsCanAccessChat]);

  useEffect(() => {
    if (!id) return;
    void retainGameRoom(id).catch(() => {});
    return () => releaseGameRoom(id);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    if (layoutCancelledInfo) {
      setCancelledInfo(layoutCancelledInfo);
      setGame(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const seed = initialGame?.id === id ? initialGame : null;
    if (seed) {
      setGame(seed);
      setLoading(false);
    } else {
      setLoading(true);
    }
    void gamesApi
      .getById(id)
      .then((res) => {
        if (!cancelled) setGame(res.data);
      })
      .catch((error: { response?: { status?: number; data?: unknown } }) => {
        if (cancelled) return;
        if (error.response?.status === 410 && isCancelledGame410Payload(error.response.data)) {
          setCancelledInfo(layoutInfoFrom410(error.response.data));
          setGame(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, initialGame, layoutCancelledInfo]);

  useEffect(() => {
    if (!lastGameUpdate || lastGameUpdate.gameId !== id) return;
    if (lastGameUpdate.senderId === user?.id) return;
    setGame(normalizeGameFromApi(lastGameUpdate.game));
  }, [lastGameUpdate, id, user?.id]);

  useEffect(() => {
    if (!lastGameCancelled || lastGameCancelled.gameId !== id) return;
    setCancelledInfo({
      entityType: lastGameCancelled.entityType,
      name: lastGameCancelled.name ?? null,
      sport: lastGameCancelled.sport,
      cancelledAt: lastGameCancelled.cancelledAt,
      cancelledByUser: lastGameCancelled.cancelledByUser ?? null,
    });
    setGame(null);
    clearLastGameCancelled();
  }, [lastGameCancelled, id, clearLastGameCancelled]);

  const fetchGame = useCallback(async () => {
    if (!id) return;
    const res = await gamesApi.getById(id);
    setGame(res.data);
  }, [id]);

  const { isRefreshing, pullDistance, pullProgress } = usePullToRefresh({
    onRefresh: fetchGame,
    disabled: !game,
  });

  const requireAuth = () => {
    if (user) return false;
    toast(t('eventDetails.loginToRsvp'));
    navigate('/login');
    return true;
  };

  const handleShare = async () => {
    const url = getShareUrl();
    if (isCapacitor()) {
      try {
        await Share.share({ url });
        return;
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
      }
    }
    if (navigator.share && (window.isSecureContext || location.protocol === 'https:')) {
      try {
        await navigator.share({ url });
        return;
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
      }
    }
    if (navigator.clipboard && (window.isSecureContext || location.protocol === 'https:')) {
      try {
        await navigator.clipboard.writeText(url);
        toast.success(t('gameDetails.linkCopied'));
        return;
      } catch {
        /* fallback modal */
      }
    }
    setShareUrl(url);
    setShareOpen(true);
  };

  const handleDelete = async () => {
    if (!id || deleting) return;
    setDeleting(true);
    try {
      await gamesApi.delete(id);
      toast.success(t('eventDetails.deleted'));
      navigate('/');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      const message = err.response?.data?.message || 'errors.generic';
      toast.error(t(message, { defaultValue: message }));
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  if (cancelledInfo) {
    return (
      <GameCancelled
        entityType={(cancelledInfo.entityType as Game['entityType']) || 'EVENT'}
        name={cancelledInfo.name}
        cancelledAt={cancelledInfo.cancelledAt}
        cancelledByUser={cancelledInfo.cancelledByUser}
        levelSport={cancelledInfo.sport}
        gameId={id}
        canViewChat={false}
      />
    );
  }

  if (loading && !game) {
    return (
      <div className="flex min-h-[calc(100vh-60px)] items-center justify-center">
        <div className="inline-block h-12 w-12 animate-spin rounded-full border-b-2 border-violet-600" />
      </div>
    );
  }

  if (!game) {
    return (
      <div className="flex min-h-[calc(100vh-60px)] items-center justify-center p-4">
        <Card className="py-12 text-center">
          <p className="text-gray-600 dark:text-gray-400">{t('errors.notFound')}</p>
        </Card>
      </div>
    );
  }

  const sport = parseGameSport(game.sport);

  return (
    <SportLevelProvider sport={sport}>
      <RefreshIndicator isRefreshing={isRefreshing} pullDistance={pullDistance} pullProgress={pullProgress} />
      <div data-testid="event-details" className="pb-2">
        <EventHeroSlideshow game={game} />
        <EventPosterHeader
          game={game}
          canEdit={canEdit}
          onEdit={() => setEditOpen(true)}
          onDelete={() => setDeleteOpen(true)}
        />
        <div className="mt-4 space-y-6">
          <EventApprovalBanner
            game={game}
            isAdmin={Boolean(user?.isAdmin)}
            onUpdated={setGame}
          />
          <EventMetaBlock game={game} />
          <EventPartnerBoard
            game={game}
            isLooking={rsvp.intent === 'looking'}
            onSaveNote={rsvp.saveLookingNote}
          />
          <EventGoingRow game={game} />
        </div>
        {isEventApproved(game) ? (
          <EventStickyCtas
          intent={rsvp.intent}
          busy={rsvp.busy}
          registerUrl={game.externalUrl?.trim() || null}
          onGoing={() => {
            if (requireAuth()) return;
            rsvp.setGoing();
          }}
          onLooking={() => {
            if (requireAuth()) return;
            rsvp.setLooking();
          }}
          onLeave={rsvp.leave}
          onShare={() => void handleShare()}
          onRegister={() => {
            const url = game.externalUrl?.trim();
            if (url) void openExternalUrl(url);
          }}
        />
        ) : null}
      </div>
      {canEdit && (
        <EventEditListingModal
          isOpen={editOpen}
          game={game}
          onClose={() => setEditOpen(false)}
          onSaved={setGame}
        />
      )}
      <ConfirmationModal
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={t('eventDetails.deleteEvent')}
        message={t('eventDetails.deleteConfirm')}
        confirmVariant="danger"
        confirmText={t('eventDetails.deleteEvent')}
        isLoading={deleting}
        onConfirm={() => void handleDelete()}
      />
      <ShareModal
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
        shareUrl={shareUrl}
        dialogTitle={t('eventDetails.share')}
      />
    </SportLevelProvider>
  );
}
