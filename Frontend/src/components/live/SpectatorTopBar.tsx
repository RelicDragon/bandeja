import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { ArrowLeft, Check, MoreVertical, UserPlus } from 'lucide-react';
import { favoritesApi } from '@/api/favorites';
import { usePopoverDismiss, type PopoverDismissReason } from '@/hooks/usePopoverDismiss';
import { isDocumentRtl, isRovingNavKey, nextRovingIndex } from '@/utils/rovingFocus';
import { LiveDot } from './LiveDot';
import type { BasicUser } from '@/types';

/**
 * PRD 349 — the spectator strip on the broadcast page.
 *
 * Shown only to a spectator (a viewer who arrived with a `spectatorToken`),
 * because a participant already has the full game chrome. Three things: back,
 * "Live · Padel Centar · court 3", and a **Follow players** overflow that uses
 * the existing follow API.
 *
 * It sits above the board and is `pointer-events-auto` inside the board's
 * otherwise click-through header layer.
 */
export interface SpectatorTopBarProps {
  gameId: string;
  clubName?: string | null;
  courtName?: string | null;
  /** Both sides' players; the overflow lists them in roster order. */
  players: BasicUser[];
  /** The board is dark by default; light boards need dark text. */
  boardTheme?: 'light' | 'dark';
}

export function SpectatorTopBar({
  gameId,
  clubName,
  courtName,
  players,
  boardTheme = 'dark',
}: SpectatorTopBarProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [followed, setFollowed] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // A `role="menu"` has to behave like one: outside press or Escape closes it,
  // Escape hands focus back to the trigger, and Arrow / Home / End walk the
  // items (`utils/rovingFocus`, the model the segmented control uses).
  const closeMenu = useCallback((reason: PopoverDismissReason) => {
    setMenuOpen(false);
    if (reason === 'escape') triggerRef.current?.focus();
  }, []);
  const popoverRef = usePopoverDismiss<HTMLDivElement>(menuOpen, closeMenu);

  const handleMenuKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isRovingNavKey(event.key)) return;
    const items = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    if (!items || items.length === 0) return;
    const list = Array.from(items);
    const target = nextRovingIndex({
      key: event.key,
      currentIndex: list.indexOf(document.activeElement as HTMLButtonElement),
      enabled: list.map((item) => !item.disabled),
      rtl: isDocumentRtl(),
      // A `role="menu"` is vertical; Left/Right are reserved for submenus.
      orientation: 'vertical',
    });
    if (target == null) return;
    event.preventDefault();
    list[target]?.focus();
  }, []);

  const light = boardTheme === 'light';
  const textClass = light ? 'text-gray-900' : 'text-white';
  const chipClass = light
    ? 'bg-black/5 hover:bg-black/10'
    : 'bg-white/10 hover:bg-white/20';

  const follow = useCallback(
    async (player: BasicUser) => {
      if (pending[player.id] || followed[player.id]) return;
      setPending((prev) => ({ ...prev, [player.id]: true }));
      const name = player.firstName?.trim() || player.lastName?.trim() || '';
      try {
        await favoritesApi.addUserToFavorites(player.id);
        setFollowed((prev) => ({ ...prev, [player.id]: true }));
        toast.success(t('live.followed', { name }));
      } catch {
        toast.error(t('live.followFailed', { name }));
      } finally {
        setPending((prev) => ({ ...prev, [player.id]: false }));
      }
    },
    [followed, pending, t],
  );

  const venue = [clubName, courtName].filter(Boolean).join(' · ');

  return (
    <div className="pointer-events-auto flex w-full items-center gap-2" data-testid="spectator-top-bar">
      <button
        type="button"
        onClick={() => navigate(`/games/${gameId}`)}
        aria-label={t('common.back')}
        className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${chipClass} ${textClass}`}
      >
        <ArrowLeft size={18} className="rtl:rotate-180" aria-hidden />
      </button>

      <div
        className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold ${chipClass} ${textClass}`}
      >
        <LiveDot />
        <span className="truncate">
          {[t('live.spectatorTitle'), venue].filter(Boolean).join(' · ')}
        </span>
      </div>

      {players.length > 0 ? (
        <div className="relative shrink-0" ref={popoverRef}>
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={t('live.followPlayers')}
            data-testid="spectator-follow-toggle"
            className={`inline-flex h-11 w-11 items-center justify-center rounded-full ${chipClass} ${textClass}`}
          >
            <MoreVertical size={18} aria-hidden />
          </button>

          {menuOpen ? (
            <div
              ref={menuRef}
              role="menu"
              aria-label={t('live.followPlayers')}
              data-testid="spectator-follow-menu"
              onKeyDown={handleMenuKeyDown}
              className="absolute end-0 z-30 mt-1 w-56 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900"
            >
              {players.map((player, index) => {
                const name = player.firstName?.trim() || player.lastName?.trim() || '';
                const isFollowed = followed[player.id];
                return (
                  <button
                    key={player.id}
                    type="button"
                    role="menuitem"
                    autoFocus={index === 0}
                    disabled={isFollowed || pending[player.id]}
                    onClick={() => void follow(player)}
                    className="flex min-h-[44px] w-full items-center gap-2 px-3 text-start text-sm text-gray-800 transition hover:bg-gray-50 disabled:opacity-60 dark:text-gray-100 dark:hover:bg-gray-800"
                  >
                    {isFollowed ? (
                      <Check size={16} className="shrink-0 text-emerald-500" aria-hidden />
                    ) : (
                      <UserPlus size={16} className="shrink-0 text-primary-500" aria-hidden />
                    )}
                    <span className="truncate">{name}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
