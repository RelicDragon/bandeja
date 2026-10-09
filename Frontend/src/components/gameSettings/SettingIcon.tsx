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
import { settingAccentClass, type GameSettingIconKey } from './settingAccent';

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
  const tone = settingAccentClass(setting) ?? 'text-gray-400 dark:text-gray-500';
  return <Icon size={16} className={`shrink-0 ${tone}`} aria-hidden />;
}
