import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Beer, Loader2, Swords, Users } from 'lucide-react';
import type { MatchingLobbyGame } from '@/api/playIntents';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { CourtLobbyGameComposite } from '@/components/playIntent/CourtLobbyGameComposite';
import './CourtLobbyPlayerFitCard.css';
import './CourtLobbyGameFitCard.css';

type AnchorRect = { left: number; top: number; width: number; height: number };
type CardLayout = {
  left: number;
  top: number;
  width: number;
  placement: 'below' | 'above';
  caretLeft: number;
  originX: number;
};

type Props = {
  game: MatchingLobbyGame;
  anchorEl: HTMLElement | null;
  closing: boolean;
  joining: boolean;
  onExited: () => void;
  onClose: () => void;
  onJoin: (game: MatchingLobbyGame) => void;
  onOpenGame: (gameId: string) => void;
};

function getSafeViewportRect() {
  const margin = 12;
  const vv = window.visualViewport;
  if (vv && vv.width > 0 && vv.height > 0) {
    return {
      left: vv.offsetLeft + margin,
      top: vv.offsetTop + margin,
      width: Math.max(0, vv.width - 2 * margin),
      height: Math.max(0, vv.height - 2 * margin),
    };
  }
  return {
    left: margin,
    top: margin,
    width: Math.max(0, window.innerWidth - 2 * margin),
    height: Math.max(0, window.innerHeight - 2 * margin),
  };
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function layoutCard(
  anchor: AnchorRect,
  safe: ReturnType<typeof getSafeViewportRect>,
  measuredHeight: number | undefined,
): CardLayout {
  const anchorCx = anchor.left + anchor.width / 2;
  const width = Math.min(288, safe.width);
  const left = clamp(
    anchorCx - width / 2,
    safe.left,
    safe.left + Math.max(0, safe.width - width),
  );
  const h = measuredHeight && measuredHeight > 80 ? measuredHeight : 220;
  const safeBottom = safe.top + safe.height;
  const belowTop = anchor.top + anchor.height + 10;
  const aboveTop = anchor.top - 10 - h;
  const fitsBelow = belowTop + h <= safeBottom + 0.5;
  const fitsAbove = aboveTop >= safe.top - 0.5;
  let placement: 'below' | 'above';
  let top: number;
  if (fitsBelow) {
    placement = 'below';
    top = belowTop;
  } else if (fitsAbove) {
    placement = 'above';
    top = aboveTop;
  } else if (safeBottom - belowTop >= anchor.top - 10 - safe.top) {
    placement = 'below';
    top = clamp(belowTop, safe.top, Math.max(safe.top, safeBottom - h));
  } else {
    placement = 'above';
    top = clamp(aboveTop, safe.top, Math.max(safe.top, safeBottom - h));
  }
  top = clamp(top, safe.top, Math.max(safe.top, safeBottom - h));
  return {
    left,
    top,
    width,
    placement,
    caretLeft: clamp(anchorCx - left, 10, width - 10),
    originX: clamp((anchorCx - left) / width, 0, 1),
  };
}

export function CourtLobbyGameFitCard({
  game,
  anchorEl,
  closing,
  joining,
  onExited,
  onClose,
  onJoin,
  onOpenGame,
}: Props) {
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
  const [layout, setLayout] = useState<CardLayout | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const openSlots = Math.max(0, game.maxParticipants - game.playingCount);
  const direct = game.allowDirectJoin;
  const entityLabel = t(`games.entityTypes.${game.entityType}`, {
    defaultValue: game.entityType,
  });
  const place = game.club?.name
    ? t('playIntent.matchingGameTimeClub', {
        time: game.timeLabel,
        club: game.club.name,
        defaultValue: `${game.timeLabel} · ${game.club.name}`,
      })
    : t('playIntent.matchingGameTimeOnly', {
        time: game.timeLabel,
        defaultValue: game.timeLabel,
      });

  const updatePosition = useCallback(() => {
    if (!anchorEl) return;
    const r = anchorEl.getBoundingClientRect();
    setLayout(
      layoutCard(
        { left: r.left, top: r.top, width: r.width, height: r.height },
        getSafeViewportRect(),
        cardRef.current?.offsetHeight,
      ),
    );
  }, [anchorEl]);

  const requestClose = useCallback(() => {
    if (!closing && !joining) onClose();
  }, [closing, joining, onClose]);

  useLayoutEffect(() => {
    updatePosition();
    const raf1 = requestAnimationFrame(() => {
      updatePosition();
    });
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', updatePosition);
    vv?.addEventListener('scroll', updatePosition);
    return () => {
      cancelAnimationFrame(raf1);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      vv?.removeEventListener('resize', updatePosition);
      vv?.removeEventListener('scroll', updatePosition);
    };
  }, [updatePosition]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (cardRef.current?.contains(target)) return;
      if (anchorEl?.contains(target)) return;
      requestClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [anchorEl, requestClose]);

  if (layout == null) return null;

  const originClass = layout.placement === 'below' ? 'origin-top' : 'origin-bottom';
  const motionY = layout.placement === 'below' ? { in: -12, out: -8 } : { in: 12, out: 8 };
  const EntityIcon =
    game.entityType === 'TOURNAMENT'
      ? Swords
      : game.entityType === 'BAR'
        ? Beer
        : Users;

  return createPortal(
    <AnimatePresence onExitComplete={onExited}>
      {!closing && (
        <motion.div
          key="court-lobby-game-fit-card"
          ref={cardRef}
          role="dialog"
          aria-label={place}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.86, y: motionY.in }}
          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.88, y: motionY.out }}
          transition={
            reduceMotion
              ? { duration: 0.12 }
              : { type: 'spring', stiffness: 320, damping: 24, mass: 0.9 }
          }
          className={`court-lobby-fit-card pointer-events-auto fixed z-[10060] ${originClass}`}
          style={{
            left: layout.left,
            top: layout.top,
            width: layout.width,
            originX: layout.originX,
            originY: layout.placement === 'below' ? 0 : 1,
          }}
        >
          <span
            className={`court-lobby-fit-card__caret ${
              layout.placement === 'below' ? 'is-below' : 'is-above'
            }`}
            style={{ left: layout.caretLeft }}
            aria-hidden
          />
          <div className="court-lobby-fit-card__shell">
            <div className="court-lobby-fit-card__header">
              <span className="court-lobby-fit-card__avatar" aria-hidden>
                <span
                  className={`court-lobby-fit-card__avatar-ring ${
                    direct ? 'is-join' : 'is-ask'
                  }`}
                />
                <span className="court-lobby-fit-card__avatar-img">
                  <CourtLobbyGameComposite game={game} />
                </span>
              </span>
              <div className="court-lobby-fit-card__title-block">
                <p className="court-lobby-fit-card__name">{game.timeLabel}</p>
                <p className="court-lobby-fit-card__title">
                  {game.club?.name ||
                    t('playIntent.matchingGameNoClub', {
                      defaultValue: 'Place to be set',
                    })}
                </p>
                <p
                  className={`court-lobby-fit-card__summary ${
                    direct ? 'tone-all' : 'tone-ask'
                  }`}
                >
                  {entityLabel}
                  {' · '}
                  {t('playIntent.matchingGameSlots', {
                    open: openSlots,
                    max: game.maxParticipants,
                    defaultValue: `${openSlots} of ${game.maxParticipants} spots open`,
                  })}
                </p>
              </div>
              <span
                className="court-lobby-game-card__entity"
                data-entity={game.entityType}
                title={entityLabel}
              >
                <EntityIcon size={14} strokeWidth={2.2} />
              </span>
            </div>
            <p className="court-lobby-game-card__hint">
              {direct
                ? t('playIntent.matchingGameJoinHint', {
                    defaultValue: 'You can walk in now. Your search will end if you join.',
                  })
                : t('playIntent.matchingGameAskHint', {
                    defaultValue: 'The host confirms first. You stay looking until they accept.',
                  })}
            </p>
            <div className="court-lobby-game-card__actions">
              <button
                type="button"
                className="court-lobby-game-card__secondary"
                disabled={joining}
                onClick={() => onOpenGame(game.id)}
              >
                {t('playIntent.matchingGameSee', { defaultValue: 'See game' })}
              </button>
              <button
                type="button"
                className={`court-lobby-game-card__primary${direct ? '' : ' is-ask'}`}
                disabled={joining}
                onClick={() => {
                  if (!joining) onJoin(game);
                }}
              >
                {joining ? (
                  <Loader2 size={16} strokeWidth={2.4} className="animate-spin" />
                ) : direct ? (
                  t('playIntent.matchingGameJoin', { defaultValue: 'Join' })
                ) : (
                  t('playIntent.matchingGameAskCta', { defaultValue: 'Ask to join' })
                )}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  ) as ReactNode;
}
