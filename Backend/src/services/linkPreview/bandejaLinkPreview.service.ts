import { formatInTimeZone } from 'date-fns-tz';
import prisma from '../../config/database';
import { MarketItemStatus, ParticipantStatus } from '@prisma/client';
import { appLinkCopyKey, type ParsedBandejaLink } from './parseBandejaLink';
import type { LinkPreviewBadgeKey, LinkPreviewCopyKey, LinkPreviewResult } from './linkPreview.types';

function displayName(user: { firstName?: string | null; lastName?: string | null } | null | undefined): string | null {
  if (!user) return null;
  const name = `${user.firstName || ''} ${user.lastName || ''}`.trim();
  return name || null;
}

function formatGameWhen(
  game: { startTime: Date; endTime: Date; timeIsSet: boolean },
  timeZone: string
): string {
  const tz = timeZone || 'UTC';
  try {
    if (game.timeIsSet) {
      const day = formatInTimeZone(game.startTime, tz, 'dd MMM');
      const start = formatInTimeZone(game.startTime, tz, 'HH:mm');
      const end = formatInTimeZone(game.endTime, tz, 'HH:mm');
      return `${day} · ${start}–${end}`;
    }
    return formatInTimeZone(game.startTime, tz, 'dd MMM yyyy');
  } catch {
    return formatInTimeZone(game.startTime, 'UTC', 'dd MMM yyyy');
  }
}

function entityBadgeKey(entityType: string | null | undefined): LinkPreviewBadgeKey {
  switch (entityType) {
    case 'TRAINING':
      return 'training';
    case 'TOURNAMENT':
      return 'tournament';
    case 'LEAGUE':
      return 'league';
    case 'LEAGUE_SEASON':
      return 'leagueSeason';
    case 'BAR':
      return 'bar';
    default:
      return 'game';
  }
}

function openTitleKey(badge: LinkPreviewBadgeKey): LinkPreviewCopyKey {
  if (badge === 'training') return 'openTraining';
  if (badge === 'league' || badge === 'leagueSeason') return 'openLeague';
  return 'openGame';
}

function formatLevelLabel(minLevel: number | null | undefined, maxLevel: number | null | undefined): string | null {
  if (minLevel == null && maxLevel == null) return null;
  if (minLevel != null && maxLevel != null) {
    if (minLevel === maxLevel) return minLevel.toFixed(1);
    return `${minLevel.toFixed(1)}–${maxLevel.toFixed(1)}`;
  }
  if (minLevel != null) return `${minLevel.toFixed(1)}+`;
  return `≤${(maxLevel as number).toFixed(1)}`;
}

function baseBandeja(
  href: string,
  partial: Omit<
    LinkPreviewResult,
    | 'url'
    | 'finalUrl'
    | 'source'
    | 'siteName'
    | 'hostname'
    | 'levelLabel'
    | 'playerAvatars'
    | 'provider'
    | 'status'
    | 'participantCount'
    | 'participantCapacity'
    | 'mutable'
    | 'refreshedAt'
  > &
    Partial<
      Pick<
        LinkPreviewResult,
        | 'levelLabel'
        | 'playerAvatars'
        | 'provider'
        | 'status'
        | 'participantCount'
        | 'participantCapacity'
        | 'mutable'
        | 'refreshedAt'
      >
    >
): LinkPreviewResult {
  return {
    url: href,
    finalUrl: href,
    source: 'bandeja',
    siteName: 'Bandeja',
    hostname: 'bandeja.me',
    ...partial,
    levelLabel: partial.levelLabel ?? null,
    playerAvatars: partial.playerAvatars ?? [],
    provider: partial.provider ?? null,
    status: partial.status ?? null,
    participantCount: partial.participantCount ?? null,
    participantCapacity: partial.participantCapacity ?? null,
    mutable: partial.mutable ?? false,
    refreshedAt: partial.refreshedAt ?? null,
  };
}

async function previewGame(
  id: string,
  href: string,
  mode: 'game' | 'gameChat' | 'gameLive',
  viewerUserId: string
): Promise<LinkPreviewResult | null> {
  const game = await prisma.game.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      entityType: true,
      sport: true,
      status: true,
      isPublic: true,
      startTime: true,
      endTime: true,
      timeIsSet: true,
      maxParticipants: true,
      minLevel: true,
      maxLevel: true,
      avatar: true,
      court: { select: { club: { select: { name: true } } } },
      club: { select: { name: true } },
      city: { select: { name: true, timezone: true } },
      participants: {
        where: { status: ParticipantStatus.PLAYING },
        select: {
          userId: true,
          user: { select: { avatar: true } },
        },
        orderBy: { joinedAt: 'asc' },
        take: 4,
      },
      _count: {
        select: {
          participants: { where: { status: ParticipantStatus.PLAYING } },
        },
      },
    },
  });
  if (!game) return null;

  const entityKey = entityBadgeKey(game.entityType);
  const badgeKey: LinkPreviewBadgeKey = entityKey;
  const titleKey = openTitleKey(entityKey);

  const isMember = game.participants.some((p) => p.userId === viewerUserId);
  if (!isMember && !game.isPublic) {
    const member = await prisma.gameParticipant.findFirst({
      where: { gameId: id, userId: viewerUserId },
      select: { id: true },
    });
    if (!member) {
      return baseBandeja(href, {
        entityType: mode === 'game' ? 'game' : mode,
        title: null,
        titleKey,
        description: null,
        descriptionKey: titleKey,
        imageUrl: null,
        badgeKey,
        avatarUrl: null,
        sport: null,
      });
    }
  }

  const location = game.court?.club?.name || game.club?.name || game.city?.name || null;
  const when = formatGameWhen(game, game.city?.timezone || 'UTC');
  const playing = game._count.participants;
  const levelLabel = formatLevelLabel(game.minLevel, game.maxLevel);
  const parts: string[] = [];
  if (location) parts.push(location);
  parts.push(when);

  const playerAvatars = game.participants
    .map((p) => p.user?.avatar)
    .filter((a): a is string => !!a)
    .slice(0, 4);

  return baseBandeja(href, {
    entityType: mode === 'game' ? 'game' : mode,
    title: game.name?.trim() || null,
    titleKey: game.name?.trim() ? null : titleKey,
    description: parts.join('\n') || null,
    descriptionKey: null,
    imageUrl: game.avatar ?? null,
    badgeKey,
    avatarUrl: null,
    sport: game.sport ?? null,
    levelLabel,
    playerAvatars,
    status: game.status,
    participantCount: playing,
    participantCapacity: game.maxParticipants > 0 ? game.maxParticipants : null,
    mutable: true,
    refreshedAt: new Date().toISOString(),
  });
}

async function previewUser(id: string, href: string): Promise<LinkPreviewResult | null> {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      firstName: true,
      lastName: true,
      avatar: true,
      isActive: true,
      primarySport: true,
      sportsEnabled: true,
      socialLevel: true,
      gender: true,
      approvedLevel: true,
      isTrainer: true,
      verbalStatus: true,
      sportProfiles: {
        select: {
          sport: true,
          level: true,
          reliability: true,
          gamesPlayed: true,
          gamesWon: true,
        },
      },
    },
  });
  if (!user || !user.isActive) return null;
  const name = displayName(user);
  const primaryLevel =
    user.sportProfiles.find((profile) => profile.sport === user.primarySport)?.level ??
    user.socialLevel;
  return baseBandeja(href, {
    entityType: 'user',
    title: name,
    titleKey: name ? null : 'viewProfile',
    description: user.verbalStatus?.trim() || null,
    descriptionKey: null,
    imageUrl: null,
    badgeKey: 'profile',
    avatarUrl: user.avatar ?? null,
    sport: user.primarySport ?? null,
    levelLabel: Number.isFinite(primaryLevel) ? primaryLevel.toFixed(1) : null,
    profileUser: {
      id,
      firstName: user.firstName,
      lastName: user.lastName,
      avatar: user.avatar,
      level: primaryLevel,
      primarySport: user.primarySport,
      sportsEnabled: user.sportsEnabled,
      socialLevel: user.socialLevel,
      gender: user.gender,
      approvedLevel: user.approvedLevel,
      isTrainer: user.isTrainer,
      verbalStatus: user.verbalStatus,
      sportProfiles: user.sportProfiles,
    },
  });
}

async function previewUserChat(
  id: string,
  viewerUserId: string,
  href: string
): Promise<LinkPreviewResult | null> {
  const chat = await prisma.userChat.findUnique({
    where: { id },
    select: {
      user1Id: true,
      user2Id: true,
      user1: { select: { firstName: true, lastName: true, avatar: true, isActive: true } },
      user2: { select: { firstName: true, lastName: true, avatar: true, isActive: true } },
    },
  });
  if (!chat) return null;
  if (chat.user1Id !== viewerUserId && chat.user2Id !== viewerUserId) return null;
  const other = chat.user1Id === viewerUserId ? chat.user2 : chat.user1;
  if (!other?.isActive) return null;
  const name = displayName(other);
  return baseBandeja(href, {
    entityType: 'userChat',
    title: name,
    titleKey: name ? null : 'directMessage',
    description: null,
    descriptionKey: 'directMessage',
    imageUrl: null,
    badgeKey: 'chat',
    avatarUrl: other.avatar ?? null,
    sport: null,
  });
}

async function previewGroupChannel(
  id: string,
  viewerUserId: string,
  href: string,
  kind: 'groupChat' | 'channelChat' | 'bug'
): Promise<LinkPreviewResult | null> {
  const channel = await prisma.groupChannel.findUnique({
    where: kind === 'bug' ? { bugId: id } : { id },
    select: {
      name: true,
      avatar: true,
      isChannel: true,
      isPublic: true,
      participantsCount: true,
      bugId: true,
      marketItemId: true,
      city: { select: { name: true } },
      participants: {
        where: { userId: viewerUserId },
        select: { userId: true },
        take: 1,
      },
    },
  });
  if (!channel) return null;

  const isParticipant = channel.participants.length > 0;
  const canSee = isParticipant || channel.isPublic;
  if (!canSee) return null;

  const badgeKey: LinkPreviewBadgeKey =
    kind === 'bug' || channel.bugId
      ? 'bug'
      : channel.marketItemId
        ? 'marketChat'
        : channel.isChannel
          ? 'channel'
          : 'group';

  const bits: string[] = [];
  if (channel.city?.name) bits.push(channel.city.name);
  if (channel.participantsCount > 0) bits.push(String(channel.participantsCount));

  return baseBandeja(href, {
    entityType: kind === 'bug' ? 'bug' : channel.isChannel ? 'channel' : 'group',
    title: channel.name?.trim() || null,
    titleKey: null,
    description: bits.join(' · ') || null,
    descriptionKey: null,
    imageUrl: null,
    badgeKey,
    avatarUrl: channel.avatar ?? null,
    sport: null,
  });
}

async function previewMarketItem(id: string, href: string): Promise<LinkPreviewResult | null> {
  const item = await prisma.marketItem.findUnique({
    where: { id },
    select: {
      title: true,
      description: true,
      mediaUrls: true,
      status: true,
      priceCents: true,
      currency: true,
      city: { select: { name: true } },
      category: { select: { name: true } },
    },
  });
  if (!item) return null;

  const price =
    item.priceCents != null
      ? `${(item.priceCents / 100).toFixed(item.priceCents % 100 === 0 ? 0 : 2)} ${item.currency}`
      : null;
  const bits = [item.category?.name, item.city?.name, price].filter(Boolean) as string[];

  return baseBandeja(href, {
    entityType: 'market',
    title: item.title.trim() || null,
    titleKey: item.title.trim() ? null : 'marketplaceItem',
    description: bits.join(' · ') || item.description?.trim()?.slice(0, 160) || null,
    descriptionKey: null,
    imageUrl: item.mediaUrls[0] ?? null,
    badgeKey: 'market',
    avatarUrl: null,
    sport: null,
    status: item.status,
    mutable: item.status === MarketItemStatus.ACTIVE || item.status === MarketItemStatus.RESERVED,
    refreshedAt: new Date().toISOString(),
  });
}

function previewApp(link: ParsedBandejaLink): LinkPreviewResult {
  const copyKey = appLinkCopyKey(link.pathname, link.search);
  return baseBandeja(link.href, {
    entityType: 'app',
    title: null,
    titleKey: copyKey,
    description: null,
    descriptionKey: copyKey,
    imageUrl: null,
    badgeKey: null,
    avatarUrl: null,
    sport: null,
  });
}

export async function fetchBandejaLinkPreview(
  link: ParsedBandejaLink,
  viewerUserId: string
): Promise<LinkPreviewResult | null> {
  try {
    switch (link.kind) {
      case 'game':
      case 'gameChat':
      case 'gameLive':
        if (!link.id) return null;
        return await previewGame(link.id, link.href, link.kind, viewerUserId);
      case 'userProfile':
        if (!link.id) return null;
        return await previewUser(link.id, link.href);
      case 'userChat':
        if (!link.id) return null;
        return await previewUserChat(link.id, viewerUserId, link.href);
      case 'groupChat':
      case 'channelChat':
      case 'bug':
        if (!link.id) return null;
        return await previewGroupChannel(link.id, viewerUserId, link.href, link.kind);
      case 'marketplaceItem':
        if (!link.id) return null;
        return await previewMarketItem(link.id, link.href);
      case 'app':
        return previewApp(link);
      default:
        return null;
    }
  } catch (err) {
    console.warn('[linkPreview] bandeja', err instanceof Error ? err.message : err);
    return null;
  }
}

export async function canViewBandejaLinkPreview(
  link: ParsedBandejaLink,
  viewerUserId: string
): Promise<boolean> {
  switch (link.kind) {
    case 'game':
    case 'gameChat':
    case 'gameLive': {
      if (!link.id) return false;
      const game = await prisma.game.findUnique({
        where: { id: link.id },
        select: {
          isPublic: true,
          participants: {
            where: { userId: viewerUserId },
            select: { id: true },
            take: 1,
          },
        },
      });
      return !!game && (game.isPublic || game.participants.length > 0);
    }
    case 'userChat': {
      if (!link.id) return false;
      const chat = await prisma.userChat.findUnique({
        where: { id: link.id },
        select: { user1Id: true, user2Id: true },
      });
      return !!chat && (chat.user1Id === viewerUserId || chat.user2Id === viewerUserId);
    }
    case 'groupChat':
    case 'channelChat':
    case 'bug': {
      if (!link.id) return false;
      const channel = await prisma.groupChannel.findUnique({
        where: link.kind === 'bug' ? { bugId: link.id } : { id: link.id },
        select: {
          isChannel: true,
          isPublic: true,
          participants: {
            where: { userId: viewerUserId },
            select: { id: true },
            take: 1,
          },
        },
      });
      return !!channel && (channel.participants.length > 0 || (channel.isChannel && channel.isPublic));
    }
    default:
      return true;
  }
}
