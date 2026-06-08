import type { UserStats } from '@/api/users';
import type { UserChat } from '@/api/chat';
import type { Sport } from '@shared/sport';

export interface PlayerProfileActions {
  toggleFavorite: () => Promise<void>;
  startChat: () => Promise<void>;
  block: () => Promise<void>;
  unblock: () => Promise<void>;
  share: () => Promise<void>;
  openFullProfile: () => void;
}

export interface PlayerProfileViewModel {
  stats: UserStats | null;
  loading: boolean;
  error: boolean;
  isCurrentUser: boolean;
  isBlocked: boolean;
  levelSport: Sport | undefined;
  setStats: (stats: UserStats) => void;
  startingChat: boolean;
  blockingUser: boolean;
  actions: PlayerProfileActions;
}

export interface UsePlayerProfileOptions {
  levelSport?: Sport;
  sportFromUrl?: Sport;
  presenceKey?: string;
  enabled?: boolean;
  onShareFallback?: (url: string) => void;
  onBlocked?: () => void;
  onStartChat?: (chat: UserChat) => boolean | void;
  onOpenFullProfile?: (levelSport: Sport | undefined) => boolean | void;
}
