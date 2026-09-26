import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Check, Plus, UserPlus } from 'lucide-react';
import { favoritesApi } from '@/api/favorites';
import { PlayerAvatarFace } from '@/components/PlayerAvatarFace';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { usePopoverDismiss, type PopoverDismissReason } from '@/hooks/usePopoverDismiss';
import { isDocumentRtl, isRovingNavKey, nextRovingIndex } from '@/utils/rovingFocus';
import { getBackAction } from '@/utils/backNavigation';
import { LiveDot } from './LiveDot';
import { WATCH_EASE } from './watch/watchTheme';
import type { BasicUser } from '@/types';

/**
 * PRD 349 — the spectator strip on the watch board (`GameWatchPage`). Never on
 * `/broadcast`: that page is an OBS overlay and must stay clean.
 *
 * Three things: back, "Live · Padel Centar · court 3", and a **Follow players**
 * overflow that uses the existing follow API. A floating glass island over the
 * watch page's backdrop; the overflow opens as an animated sheet of faces.
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
  const reduceMotion = usePrefersReducedMotion();
  const textClass = light ? 'text-zinc-900' : 'text-white';
  // The strip sits outside the scrolling board, so the glass blur is cheap here.
  const glass = light
    ? 'bg-white/70 ring-1 ring-inset ring-black/[0.06] shadow-[0_10px_30px_-18px_rgba(15,23,42,0.45)] backdrop-blur-xl'
    : 'bg-white/[0.07] ring-1 ring-inset ring-white/[0.09] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl';
  const press = `transition-transform duration-300 ${WATCH_EASE} active:scale-[0.94]`;

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

  // Pushing `/games/:id` here would stack details → broadcast → details, and
  // the details back button would pop straight back into the broadcast. Go
  // back through history; only a cold open (shared link) lands on details.
  const goBack = useCallback(() => {
    if (getBackAction().type === 'history') navigate(-1);
    else navigate(`/games/${gameId}`, { replace: true });
  }, [gameId, navigate]);

  const venue = [clubName, courtName].filter(Boolean).join(' · ');

  return (
    <div className="pointer-events-auto flex w-full items-center gap-2" data-testid="spectator-top-bar">
      <button
        type="button"
        onClick={goBack}
        aria-label={t('common.back')}
        className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${glass} ${textClass} ${press}`}
      >
        <ArrowLeft size={19} strokeWidth={1.5} className="rtl:rotate-180" aria-hidden />
      </button>

      <div className={`flex h-11 min-w-0 flex-1 items-center justify-center gap-2.5 rounded-full px-4 ${glass} ${textClass}`}>
        <span className="inline-flex shrink-0 items-center gap-1.5 font-brand text-[10px] font-bold uppercase tracking-[0.22em] text-red-500">
          <LiveDot className="shadow-[0_0_0_3px_rgba(239,68,68,0.18)]" />
          {t('live.spectatorTitle')}
        </span>
        {venue ? (
          <>
            <span aria-hidden className="h-3.5 w-px shrink-0 bg-current opacity-15" />
            <span className="sr-only"> · </span>
            <span className="min-w-0 truncate text-[13px] font-medium tracking-[-0.005em] opacity-80">{venue}</span>
          </>
        ) : null}
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
            className={`inline-flex h-11 w-11 items-center justify-center rounded-full ${glass} ${textClass} ${press}`}
          >
            <UserPlus size={18} strokeWidth={1.5} aria-hidden />
          </button>

          <AnimatePresence>
            {menuOpen ? (
              <motion.div
                ref={menuRef}
                role="menu"
                aria-label={t('live.followPlayers')}
                data-testid="spectator-follow-menu"
                onKeyDown={handleMenuKeyDown}
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: -8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: -6 }}
                transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
                className={`absolute end-0 z-30 mt-2 w-[17rem] origin-top-right rounded-[1.5rem] p-1.5 backdrop-blur-2xl rtl:origin-top-left ${
                  light
                    ? 'bg-white/90 ring-1 ring-black/[0.06] shadow-[0_30px_60px_-24px_rgba(15,23,42,0.45)]'
                    : 'bg-[#18181b]/90 ring-1 ring-white/[0.09] shadow-[0_30px_70px_-20px_rgba(0,0,0,0.9)]'
                }`}
              >
                <div
                  className={`px-3 pb-1.5 pt-2.5 font-brand text-[10px] font-semibold uppercase tracking-[0.22em] ${
                    light ? 'text-zinc-400' : 'text-zinc-500'
                  }`}
                >
                  {t('live.followPlayers')}
                </div>
                {players.map((player, index) => {
                  const fullName = [player.firstName, player.lastName].filter(Boolean).join(' ').trim();
                  const initials = `${player.firstName?.[0] ?? ''}${player.lastName?.[0] ?? ''}`.toUpperCase();
                  const isFollowed = followed[player.id];
                  return (
                    <motion.button
                      key={player.id}
                      type="button"
                      role="menuitem"
                      autoFocus={index === 0}
                      disabled={isFollowed || pending[player.id]}
                      onClick={() => void follow(player)}
                      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1], delay: reduceMotion ? 0 : 0.04 + index * 0.035 }}
                      className={`flex min-h-[52px] w-full items-center gap-3 rounded-[1.1rem] px-2 text-start outline-none transition-colors duration-200 disabled:cursor-default ${
                        light ? 'text-zinc-900 hover:bg-black/[0.04] focus-visible:bg-black/[0.05]' : 'text-zinc-100 hover:bg-white/[0.06] focus-visible:bg-white/[0.08]'
                      }`}
                    >
                      <span className="relative size-9 shrink-0 rounded-full">
                        <PlayerAvatarFace
                          avatar={player.avatar}
                          tinyUrl={null}
                          initials={initials}
                          alt=""
                          textClassName="text-xs"
                          resetKey={player.id}
                        />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{fullName || player.id}</span>
                      <span
                        className={`flex size-8 shrink-0 items-center justify-center rounded-full transition-colors duration-300 ${
                          isFollowed
                            ? 'bg-emerald-500/15 text-emerald-500'
                            : light
                              ? 'bg-zinc-900/[0.05] text-zinc-700'
                              : 'bg-white/[0.08] text-zinc-200'
                        } ${pending[player.id] ? 'animate-pulse' : ''}`}
                      >
                        {isFollowed ? (
                          <Check size={15} strokeWidth={2} aria-hidden />
                        ) : (
                          <Plus size={15} strokeWidth={1.75} aria-hidden />
                        )}
                      </span>
                    </motion.button>
                  );
                })}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      ) : null}
    </div>
  );
}
