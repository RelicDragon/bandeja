import type { LucideIcon } from 'lucide-react';
import {
  Bot,
  CalendarDays,
  ChartLine,
  Flame,
  Footprints,
  History,
  House,
  Medal,
  Megaphone,
  MessageCircle,
  Mountain,
  CirclePlus,
  Radio,
  Scale,
  Search,
  ShoppingBag,
  Sprout,
  Star,
  Swords,
  Trophy,
  UserPlus,
  Users,
  Wallet,
  Zap,
  CircleDashed,
  ListPlus,
} from 'lucide-react';
import { noviceRankId, type NoviceFeature, type NoviceRankId } from '@shared/novice';

export const NOVICE_FEATURE_ICONS: Readonly<Record<NoviceFeature, LucideIcon>> = {
  homeShell: House,
  findTab: Search,
  calendar: CalendarDays,
  pastGames: History,
  chatsTab: MessageCircle,
  followPlayers: UserPlus,
  playStreak: Flame,
  createGame: CirclePlus,
  topTab: Trophy,
  levelHistory: ChartLine,
  playerComparison: Scale,
  leagues: Medal,
  tournaments: Swords,
  marketTab: ShoppingBag,
  stories: CircleDashed,
  liveRail: Radio,
  userTeams: Users,
  aiAssistant: Bot,
  wallet: Wallet,
  createLeague: ListPlus,
  ads: Megaphone,
};

type RankVisual = {
  icon: LucideIcon;
  /** Emblem fill (tailwind gradient stops). */
  gradient: string;
  /** Glow behind the emblem. */
  glow: string;
};

export const NOVICE_RANK_VISUALS: Readonly<Record<NoviceRankId, RankVisual>> = {
  newcomer: { icon: Sprout, gradient: 'from-emerald-300 to-emerald-500', glow: 'bg-emerald-400/40' },
  debut: { icon: Footprints, gradient: 'from-sky-300 to-sky-500', glow: 'bg-sky-400/40' },
  rookie: { icon: Zap, gradient: 'from-violet-300 to-violet-500', glow: 'bg-violet-400/40' },
  contender: { icon: Swords, gradient: 'from-orange-300 to-orange-500', glow: 'bg-orange-400/40' },
  challenger: { icon: Mountain, gradient: 'from-rose-300 to-rose-500', glow: 'bg-rose-400/40' },
  regular: { icon: Star, gradient: 'from-amber-300 to-amber-500', glow: 'bg-amber-400/50' },
};

export function noviceRankVisual(rank: number): RankVisual {
  return NOVICE_RANK_VISUALS[noviceRankId(rank)];
}

/** i18n key of a rank's display name (shared by celebration and badge). */
export function noviceRankNameKey(rank: number): string {
  return `novice.celebration.ranks.${noviceRankId(rank)}`;
}
