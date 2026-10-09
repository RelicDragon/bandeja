import {
  Beer,
  ClipboardPen,
  DoorOpen,
  Globe,
  ListPlus,
  MessageSquareLock,
  Radio,
  Sprout,
  TrendingUp,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';

export type GameSettingIconKey =
  | 'affectsRating'
  | 'isPublic'
  | 'showOnLiveRail'
  | 'anyoneCanInvite'
  | 'suitableForNovices'
  | 'resultsByAnyone'
  | 'allowDirectJoin'
  | 'autoFillFromQueue'
  | 'afterGameGoToBar'
  | 'participantsOnlyChat';

const ICONS: Record<GameSettingIconKey, LucideIcon> = {
  affectsRating: TrendingUp,
  isPublic: Globe,
  showOnLiveRail: Radio,
  anyoneCanInvite: UserPlus,
  suitableForNovices: Sprout,
  resultsByAnyone: ClipboardPen,
  allowDirectJoin: DoorOpen,
  autoFillFromQueue: ListPlus,
  afterGameGoToBar: Beer,
  participantsOnlyChat: MessageSquareLock,
};

/** Leading icon for a game settings toggle row (create flow and game details share it). */
export function SettingIcon({ setting }: { setting: GameSettingIconKey }) {
  const Icon = ICONS[setting];
  return <Icon size={16} className="shrink-0 text-gray-400 dark:text-gray-500" aria-hidden />;
}
