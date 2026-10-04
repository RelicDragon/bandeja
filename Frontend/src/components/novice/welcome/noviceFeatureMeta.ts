import {
  ArrowLeftRight,
  Award,
  Calendar,
  CalendarDays,
  CirclePlay,
  Flame,
  History,
  Home,
  Megaphone,
  MessageCircle,
  PlusCircle,
  Radio,
  ShoppingBag,
  Swords,
  TrendingUp,
  Trophy,
  UserPlus,
  UsersRound,
  Wallet,
} from 'lucide-react';
import type { ComponentType } from 'react';
import {
  NOVICE_FEATURE_MIN_RANK,
  NOVICE_FEATURES,
  type NoviceFeature,
} from '@shared/novice';
import { AgentGlyph } from '@/components/agent/AgentGlyph';

type FeatureIcon = ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;

/** Icon per novice feature — the same glyphs the unlocked entry points use. */
export const NOVICE_FEATURE_ICONS: Readonly<Record<NoviceFeature, FeatureIcon>> = {
  homeShell: Home,
  findTab: Calendar,
  calendar: CalendarDays,
  pastGames: History,
  chatsTab: MessageCircle,
  followPlayers: UserPlus,
  playStreak: Flame,
  createGame: PlusCircle,
  topTab: Trophy,
  levelHistory: TrendingUp,
  playerComparison: ArrowLeftRight,
  leagues: Award,
  tournaments: Swords,
  marketTab: ShoppingBag,
  stories: CirclePlay,
  liveRail: Radio,
  userTeams: UsersRound,
  aiAssistant: AgentGlyph,
  wallet: Wallet,
  createLeague: Trophy,
  ads: Megaphone,
};

/** i18n key of a feature's short label. */
export function noviceFeatureLabelKey(feature: NoviceFeature): string {
  return `novice.shell.features.${feature}`;
}

/** i18n key of a rank's name. */
export function noviceRankLabelKey(rankId: string): string {
  return `novice.shell.rank.${rankId}`;
}

/**
 * The Welcome teaser: what a newcomer gets by playing. Ads are never teased;
 * the rest of the features are summed up as "and more".
 */
export const NOVICE_TEASER_FEATURES: readonly NoviceFeature[] = [
  'chatsTab',
  'calendar',
  'topTab',
  'playerComparison',
  'marketTab',
  'leagues',
  'tournaments',
  'stories',
  'liveRail',
  'playStreak',
  'aiAssistant',
];

/** Features (minus ads) that the next rank above `rank` reveals. */
export function nextRankPreview(rank: number): { rank: number; features: NoviceFeature[] } | null {
  const upcoming = NOVICE_FEATURES.filter(
    (feature) => feature !== 'ads' && NOVICE_FEATURE_MIN_RANK[feature] > rank,
  );
  if (upcoming.length === 0) return null;
  const nextRank = Math.min(...upcoming.map((feature) => NOVICE_FEATURE_MIN_RANK[feature]));
  return {
    rank: nextRank,
    features: upcoming.filter((feature) => NOVICE_FEATURE_MIN_RANK[feature] === nextRank),
  };
}
