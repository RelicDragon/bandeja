import type { LinkPreviewData } from '@/api/linkPreview';
import { isRichLinkPreview } from '@/api/linkPreview';
import type { BasicUser } from '@/types';

const TRUSTED_STORED_ENTITY = new Set([
  'external',
  'app',
  'user',
  'market',
]);
const PROVIDERS = new Set(['youtube', 'spotify', 'instagram', 'tiktok', 'x', 'github', 'playtomic']);

function parseProfileUser(raw: unknown): BasicUser | null {
  if (!raw || typeof raw !== 'object') return null;
  const user = raw as Record<string, unknown>;
  if (typeof user.id !== 'string') return null;
  return {
    id: user.id,
    firstName: typeof user.firstName === 'string' ? user.firstName : undefined,
    lastName: typeof user.lastName === 'string' ? user.lastName : undefined,
    avatar: typeof user.avatar === 'string' ? user.avatar : null,
    level: typeof user.level === 'number' ? user.level : 1,
    primarySport: typeof user.primarySport === 'string' ? user.primarySport : 'PADEL',
    sportsEnabled: Array.isArray(user.sportsEnabled)
      ? user.sportsEnabled.filter((sport): sport is BasicUser['primarySport'] => typeof sport === 'string')
      : [],
    socialLevel: typeof user.socialLevel === 'number' ? user.socialLevel : 1,
    gender: typeof user.gender === 'string' ? user.gender : 'PREFER_NOT_TO_SAY',
    approvedLevel: user.approvedLevel === true,
    isTrainer: user.isTrainer === true,
    verbalStatus: typeof user.verbalStatus === 'string' ? user.verbalStatus : null,
    sportProfiles: Array.isArray(user.sportProfiles)
      ? user.sportProfiles.filter(
          (profile): profile is NonNullable<BasicUser['sportProfiles']>[number] =>
            !!profile &&
            typeof profile === 'object' &&
            typeof (profile as Record<string, unknown>).sport === 'string' &&
            typeof (profile as Record<string, unknown>).level === 'number'
        )
      : [],
  } as BasicUser;
}

export function parseStoredLinkPreview(raw: unknown): LinkPreviewData | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.url !== 'string' || typeof o.hostname !== 'string') return null;
  const entityType = (typeof o.entityType === 'string' ? o.entityType : 'external') as LinkPreviewData['entityType'];
  // Ignore legacy ACL-sensitive snapshots (viewer must re-fetch).
  if (!TRUSTED_STORED_ENTITY.has(entityType)) return null;
  const data: LinkPreviewData = {
    url: o.url,
    finalUrl: typeof o.finalUrl === 'string' ? o.finalUrl : o.url,
    source: o.source === 'bandeja' ? 'bandeja' : 'external',
    entityType,
    title: typeof o.title === 'string' ? o.title : null,
    titleKey: typeof o.titleKey === 'string' ? o.titleKey : null,
    description: typeof o.description === 'string' ? o.description : null,
    descriptionKey: typeof o.descriptionKey === 'string' ? o.descriptionKey : null,
    imageUrl: typeof o.imageUrl === 'string' ? o.imageUrl : null,
    siteName: typeof o.siteName === 'string' ? o.siteName : null,
    hostname: o.hostname,
    badgeKey: typeof o.badgeKey === 'string' ? o.badgeKey : null,
    avatarUrl: typeof o.avatarUrl === 'string' ? o.avatarUrl : null,
    sport: typeof o.sport === 'string' ? o.sport : null,
    levelLabel: typeof o.levelLabel === 'string' ? o.levelLabel : null,
    playerAvatars: Array.isArray(o.playerAvatars)
      ? o.playerAvatars.filter((a): a is string => typeof a === 'string')
      : [],
    provider: PROVIDERS.has(String(o.provider))
      ? (o.provider as LinkPreviewData['provider'])
      : null,
    status: typeof o.status === 'string' ? o.status : null,
    participantCount: typeof o.participantCount === 'number' ? o.participantCount : null,
    participantCapacity: typeof o.participantCapacity === 'number' ? o.participantCapacity : null,
    mutable: o.mutable === true,
    refreshedAt: typeof o.refreshedAt === 'string' ? o.refreshedAt : null,
    profileUser: parseProfileUser(o.profileUser),
  };
  return isRichLinkPreview(data) ? data : null;
}
