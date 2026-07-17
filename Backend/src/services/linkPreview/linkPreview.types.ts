export type LinkPreviewSource = 'external' | 'bandeja';

export type LinkPreviewEntityType =
  | 'external'
  | 'game'
  | 'gameChat'
  | 'gameLive'
  | 'user'
  | 'userChat'
  | 'group'
  | 'channel'
  | 'bug'
  | 'market'
  | 'app';

/** Stable keys — FE translates via `chat.linkPreview.*`. */
export type LinkPreviewBadgeKey =
  | 'game'
  | 'training'
  | 'tournament'
  | 'league'
  | 'leagueSeason'
  | 'bar'
  | 'chat'
  | 'live'
  | 'profile'
  | 'group'
  | 'channel'
  | 'bug'
  | 'market'
  | 'marketChat';

export type LinkPreviewCopyKey =
  | 'openGame'
  | 'openTraining'
  | 'openLeague'
  | 'viewProfile'
  | 'directMessage'
  | 'marketplaceItem'
  | 'app.home'
  | 'app.invites'
  | 'app.find'
  | 'app.findToday'
  | 'app.findTomorrow'
  | 'app.chats'
  | 'app.chatsMarketplace'
  | 'app.createGame'
  | 'app.createLeague'
  | 'app.nextGame'
  | 'app.nextGameChat'
  | 'app.nextGameLive'
  | 'app.marketplace'
  | 'app.marketplaceMy'
  | 'app.leaderboard'
  | 'app.login'
  | 'app.register'
  | 'app.bugs'
  | 'app.profile'
  | 'app.open';

export type LinkPreviewProvider =
  | 'youtube'
  | 'spotify'
  | 'instagram'
  | 'tiktok'
  | 'x'
  | 'github'
  | 'playtomic';

export type LinkPreviewProfileUser = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  avatar: string | null;
  level: number;
  primarySport: string;
  sportsEnabled: string[];
  socialLevel: number;
  gender: string;
  approvedLevel: boolean;
  isTrainer: boolean;
  verbalStatus: string | null;
  sportProfiles: Array<{
    sport: string;
    level: number;
    reliability: number;
    gamesPlayed: number;
    gamesWon: number;
  }>;
};

export type LinkPreviewResult = {
  url: string;
  finalUrl: string;
  source: LinkPreviewSource;
  entityType: LinkPreviewEntityType;
  /** Entity/display title from DB or OG. Prefer over titleKey when set. */
  title: string | null;
  /** Fallback i18n key when title is empty. */
  titleKey: LinkPreviewCopyKey | null;
  description: string | null;
  descriptionKey: LinkPreviewCopyKey | null;
  imageUrl: string | null;
  siteName: string | null;
  hostname: string;
  badgeKey: LinkPreviewBadgeKey | null;
  avatarUrl: string | null;
  sport: string | null;
  /** e.g. "2.5–3.5" for games with level bounds. */
  levelLabel: string | null;
  /** Up to 4 playing participant avatar URLs. */
  playerAvatars: string[];
  provider: LinkPreviewProvider | null;
  /** Raw stable entity state; clients localize it. */
  status: string | null;
  participantCount: number | null;
  participantCapacity: number | null;
  /** Mutable Bandeja cards are refreshed with stale-while-revalidate. */
  mutable: boolean;
  refreshedAt: string | null;
  /** Public player data used by the shared PlayerAvatar interaction. */
  profileUser?: LinkPreviewProfileUser | null;
};
