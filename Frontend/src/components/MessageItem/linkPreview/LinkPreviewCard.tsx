import React from 'react';
import { Beer, Dumbbell, ExternalLink, Swords, Trophy } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { LinkPreviewData } from '@/api/linkPreview';
import { SportPublicIcon } from '@/components/sport/SportPublicIcon';
import { getSportConfig, type Sport } from '@/sport/sportRegistry';
import type { ContentVariant } from '../MessageContentBody';
import {
  linkPreviewAccentClass,
  linkPreviewBadgeClass,
  linkPreviewMutedClass,
  linkPreviewSurfaceClass,
} from './linkPreviewStyles';
import {
  resolveLinkPreviewBadge,
  resolveLinkPreviewDescription,
  resolveLinkPreviewTitle,
} from './resolveLinkPreviewCopy';
import { isAppLinkPreviewHost } from './eligibility';
import { LinkPreviewImage } from './LinkPreviewImage';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import type { BasicUser } from '@/types';

type LinkPreviewCardProps = {
  url: string;
  preview: LinkPreviewData;
  variant: ContentVariant;
  navigationUrl?: string;
  onClick?: (e: React.MouseEvent, navigationUrl: string) => void;
  /** Skip enter animation when snapshot already ready (no chip→card flash). */
  instant?: boolean;
  standalone?: boolean;
  reserveControlSpace?: boolean;
};

const SPORTS = new Set<string>([
  'PADEL',
  'TENNIS',
  'TABLE_TENNIS',
  'BADMINTON',
  'PICKLEBALL',
  'SQUASH',
]);

function isSport(value: string | null | undefined): value is Sport {
  return !!value && SPORTS.has(value);
}

function GameEntityIcon({ badgeKey }: { badgeKey: string | null }) {
  const className = 'h-4 w-4 flex-shrink-0';
  switch (badgeKey) {
    case 'training':
      return <Dumbbell className={className} aria-hidden />;
    case 'tournament':
      return <Swords className={className} aria-hidden />;
    case 'league':
    case 'leagueSeason':
      return <Trophy className={className} aria-hidden />;
    case 'bar':
      return <Beer className={className} aria-hidden />;
    default:
      return null;
  }
}

function MediaThumb({
  url,
  preview,
  isBandeja,
}: {
  url: string;
  preview: LinkPreviewData;
  isBandeja: boolean;
}) {
  if (preview.entityType === 'user') {
    const fallbackId = (() => {
      try {
        return new URL(url).pathname.match(/^\/(?:user-profile|profile)\/([^/]+)/)?.[1] ?? null;
      } catch {
        return null;
      }
    })();
    const name = preview.title?.trim().split(/\s+/) ?? [];
    const player =
      preview.profileUser ??
      (fallbackId
        ? ({
            id: fallbackId,
            firstName: name[0],
            lastName: name.slice(1).join(' ') || undefined,
            avatar: preview.avatarUrl,
            level: Number(preview.levelLabel) || 1,
            primarySport: isSport(preview.sport) ? preview.sport : 'PADEL',
            sportsEnabled: isSport(preview.sport) ? [preview.sport] : ['PADEL'],
            socialLevel: Number(preview.levelLabel) || 1,
            gender: 'PREFER_NOT_TO_SAY',
            approvedLevel: false,
            isTrainer: false,
            sportProfiles: isSport(preview.sport)
              ? [{
                  sport: preview.sport,
                  level: Number(preview.levelLabel) || 1,
                  reliability: 0,
                  gamesPlayed: 0,
                  gamesWon: 0,
                }]
              : [],
          } as BasicUser)
        : null);
    return player ? (
      <PlayerAvatar
        player={player}
        smallLayout
        showName={false}
        fullHideName
        levelSport={isSport(preview.sport) ? preview.sport : undefined}
      />
    ) : null;
  }

  const raw = preview.imageUrl || preview.avatarUrl;
  const bandejaFallback = (
    <img src="/bandeja2-blue-45-icon.png" alt="" className="h-12 w-12 rounded-xl object-cover" />
  );
  const faviconFallback = (
    <img
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(preview.hostname || 'link')}&sz=128`}
      alt=""
      className="h-12 w-12 rounded-xl object-contain bg-white/40 dark:bg-black/20 p-2"
    />
  );
  const rounded = preview.avatarUrl && !preview.imageUrl ? 'rounded-full' : 'rounded-xl';

  const fallback = isBandeja ? bandejaFallback : faviconFallback;
  const media = raw ? (
    <LinkPreviewImage src={raw} className="h-12 w-12" rounded={rounded} fallback={fallback} />
  ) : (
    fallback
  );

  return media;
}

function PlayerAvatarStack({ avatars }: { avatars: string[] }) {
  if (!avatars.length) return null;
  return (
    <span className="flex items-center" aria-hidden>
      {avatars.slice(0, 4).map((src, i) => (
        <span key={`${src}-${i}`} style={{ marginLeft: i === 0 ? 0 : -6, zIndex: 4 - i }}>
          <LinkPreviewImage
            src={src}
            className="h-5 w-5 ring-1 ring-white/80 dark:ring-black/40"
            rounded="rounded-full"
            fallback={<span className="block h-5 w-5 rounded-full bg-black/10" />}
          />
        </span>
      ))}
    </span>
  );
}

export const LinkPreviewCard: React.FC<LinkPreviewCardProps> = ({
  url,
  preview,
  variant,
  navigationUrl = url,
  onClick,
  instant = false,
  standalone = false,
  reserveControlSpace = false,
}) => {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const isBandeja = preview.source === 'bandeja';
  const isAppNav = (() => {
    try {
      return isAppLinkPreviewHost(new URL(url).hostname);
    } catch {
      return isBandeja;
    }
  })();
  const host = preview.hostname || preview.siteName || 'link';
  const title = resolveLinkPreviewTitle(preview, t);
  const description = resolveLinkPreviewDescription(preview, t, title);
  const isProfile = preview.entityType === 'user';
  const isGame = ['game', 'gameChat', 'gameLive'].includes(preview.entityType);
  const badge = isProfile ? null : resolveLinkPreviewBadge(preview.badgeKey, t);
  const visibleDescription = isProfile
    ? preview.profileUser?.verbalStatus?.trim() || preview.description?.trim() || null
    : description;
  const showTitle = !isGame || !!preview.title?.trim();
  const gameEntityIcon = isGame ? <GameEntityIcon badgeKey={preview.badgeKey} /> : null;
  const muted = linkPreviewMutedClass(variant);
  const siteLabel = preview.provider
    ? t(`chat.linkPreview.provider.${preview.provider}`, {
        defaultValue: preview.siteName || preview.provider,
      })
    : isBandeja
        ? t('chat.linkPreview.brand', { defaultValue: 'Bandeja' })
        : host;
  const aria = t('chat.linkPreview.openLink', { defaultValue: 'Open link' });
  const sport = isSport(preview.sport) ? preview.sport : null;
  const statusLabel = preview.status
    ? t(`chat.linkPreview.status.${preview.status.toLowerCase()}`, {
        defaultValue: preview.status.replace(/_/g, ' '),
      })
    : null;
  const availableSlots =
    preview.participantCapacity != null && preview.participantCount != null
      ? Math.max(0, preview.participantCapacity - preview.participantCount)
      : null;

  const handleClick = (e: React.MouseEvent) => {
    if (isAppNav) e.preventDefault();
    onClick?.(e, navigationUrl);
  };

  const skipMotion = instant || reduceMotion;
  const gameDescriptionLines = isGame ? (visibleDescription ?? '').split('\n') : [];
  const gameClub = gameDescriptionLines[0]?.trim() || null;
  const gameDateTime = gameDescriptionLines.slice(1).join(' ').trim() || null;
  const cardClassName = `${standalone ? '' : 'mt-1.5'} flex min-h-[68px] max-w-full min-w-0 overflow-hidden rounded-xl border text-left transition-[transform,opacity] active:scale-[0.99] motion-reduce:transform-none motion-reduce:transition-none ${linkPreviewSurfaceClass(variant, standalone)}`;
  const cardBody = (
    <>
      <span
        className={`w-[3px] flex-shrink-0 self-stretch ${linkPreviewAccentClass(variant, isBandeja)}`}
        aria-hidden
      />
      {isGame ? (
        <span className="min-w-0 flex-1 px-2.5 py-2 pr-8">
          <span className="flex min-w-0 items-start gap-2.5">
            <span className="flex-shrink-0">
              <MediaThumb url={url} preview={preview} isBandeja={isBandeja} />
            </span>
            <span className="min-w-0 flex-1 py-0.5">
              {showTitle || gameEntityIcon ? (
                <span className="flex items-center gap-1.5 text-[13px] font-semibold leading-snug tracking-tight">
                  {gameEntityIcon}
                  {showTitle ? <span className="line-clamp-2">{title}</span> : null}
                </span>
              ) : null}
              {gameClub ? (
                <span className={`mt-0.5 block text-[11px] leading-snug line-clamp-2 ${muted}`}>
                  {gameClub}
                </span>
              ) : null}
            </span>
          </span>
          {gameDateTime ? (
            <span className={`mt-2 block text-[11px] leading-snug ${muted}`}>{gameDateTime}</span>
          ) : null}
          {statusLabel ? (
            <span className={`mt-1 block text-[10px] ${muted}`}>{statusLabel}</span>
          ) : null}
          {availableSlots != null ? (
            <span className={`mt-1 flex items-center gap-2 text-[10px] ${muted}`}>
              <span>
                {preview.participantCount}/{preview.participantCapacity} ·{' '}
                {t('chat.linkPreview.slotsCount', {
                  count: availableSlots,
                  defaultValue: '{{count}} spots',
                })}
              </span>
              <PlayerAvatarStack avatars={preview.playerAvatars || []} />
            </span>
          ) : null}
        </span>
      ) : (
        <span
          className={`flex min-w-0 flex-1 gap-2.5 py-2 pl-2.5 ${
            reserveControlSpace ? 'pr-8' : 'pr-2.5'
          }`}
        >
          <span className="flex-shrink-0 self-center">
            <MediaThumb url={url} preview={preview} isBandeja={isBandeja} />
          </span>
          <span className="min-w-0 flex-1 py-0.5">
            {!isProfile && (badge || !isBandeja) ? (
              <span className="flex items-center gap-1.5 min-w-0">
                {badge ? (
                  <span
                    className={`truncate text-[10px] font-semibold tracking-wide px-1.5 py-0.5 rounded-md ${linkPreviewBadgeClass(variant)}`}
                  >
                    {badge}
                  </span>
                ) : (
                  <span className={`truncate text-[11px] font-medium ${muted}`}>{siteLabel}</span>
                )}
                {!isAppNav ? (
                  <ExternalLink className={`ml-auto h-3 w-3 flex-shrink-0 opacity-50 ${muted}`} aria-hidden />
                ) : null}
              </span>
            ) : null}
            {showTitle ? (
              <span className="mt-0.5 block text-[13px] font-semibold leading-snug line-clamp-2 tracking-tight">
                {title}
              </span>
            ) : null}
            {visibleDescription ? (
              <span className={`mt-0.5 block text-[11px] leading-snug line-clamp-2 ${muted}`}>
                {visibleDescription}
              </span>
            ) : null}
            {preview.entityType === 'market' && (sport || preview.levelLabel) ? (
              <span className={`mt-1 flex flex-wrap items-center gap-1.5 text-[10px] ${muted}`}>
                {sport ? (
                  <span className="inline-flex items-center gap-1">
                    <SportPublicIcon sport={sport} className="h-3.5 w-3.5 object-contain" />
                    <span>{t(getSportConfig(sport).labelKey)}</span>
                  </span>
                ) : null}
                {preview.levelLabel ? <span>{sport ? '· ' : ''}{preview.levelLabel}</span> : null}
              </span>
            ) : null}
            {preview.entityType === 'market' && statusLabel ? (
              <span className={`mt-1 block text-[10px] ${muted}`}>{statusLabel}</span>
            ) : null}
          </span>
        </span>
      )}
    </>
  );

  if (preview.entityType === 'user') {
    return (
      <motion.div
        role="link"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          event.currentTarget.click();
        }}
        initial={skipMotion ? false : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={skipMotion ? { duration: 0 } : { duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
        aria-label={`${aria}: ${title}`}
        data-testid="chat-bandeja-link-preview-card"
        data-preview-source={preview.source}
        data-preview-entity={preview.entityType}
        className={`${cardClassName} cursor-pointer`}
      >
        {cardBody}
      </motion.div>
    );
  }

  return (
    <motion.a
      href={navigationUrl}
      target={isAppNav ? undefined : '_blank'}
      rel={isAppNav ? undefined : 'noopener noreferrer'}
      onClick={handleClick}
      initial={skipMotion ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={skipMotion ? { duration: 0 } : { duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
      aria-label={`${aria}: ${title}`}
      data-testid={isBandeja ? 'chat-bandeja-link-preview-card' : 'chat-link-preview-card'}
      data-preview-source={preview.source}
      data-preview-entity={preview.entityType}
      data-preview-provider={preview.provider || undefined}
      className={cardClassName}
    >
      {cardBody}
    </motion.a>
  );
};
