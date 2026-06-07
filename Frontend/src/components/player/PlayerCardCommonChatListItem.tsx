import { useMemo } from 'react';
import { Hash, Package } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CommonChatItem } from '@/api/commonChats';
import { useAuthStore } from '@/store/authStore';
import { useTranslatedGeo } from '@/hooks/useTranslatedGeo';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import {
  getGameChatListEntityVisual,
  getGameChatListSetMetaSubtitle,
  getGameChatListTitle,
} from '@/utils/chatListGameCardDisplay';

const PALETTES: { bg: string; fg: string }[] = [
  { bg: 'bg-violet-500', fg: 'text-white' },
  { bg: 'bg-fuchsia-500', fg: 'text-white' },
  { bg: 'bg-sky-500', fg: 'text-white' },
  { bg: 'bg-emerald-500', fg: 'text-white' },
  { bg: 'bg-rose-500', fg: 'text-white' },
  { bg: 'bg-indigo-500', fg: 'text-white' },
  { bg: 'bg-teal-500', fg: 'text-white' },
  { bg: 'bg-orange-500', fg: 'text-white' },
  { bg: 'bg-cyan-600', fg: 'text-white' },
  { bg: 'bg-pink-500', fg: 'text-white' },
];

function hashSeed(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (Math.imul(31, hash) + value.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

function firstSymbolFromName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const char = [...trimmed][0] ?? '?';
  return /\p{L}/u.test(char) ? char.toLocaleUpperCase('und') : char;
}

interface PlayerCardCommonChatListItemProps {
  item: CommonChatItem;
  onClick: () => void;
}

export const PlayerCardCommonChatListItem = ({ item, onClick }: PlayerCardCommonChatListItemProps) => {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const displaySettings = useMemo(() => resolveDisplaySettings(user), [user]);
  const { translateCity } = useTranslatedGeo();

  const displayName = useMemo(() => {
    if (item.kind === 'game' && item.game) {
      return getGameChatListTitle(item.game, t) || t('games.entityTypes.GAME', { defaultValue: 'Game' });
    }
    const group = item.groupChannel;
    if (!group) return '';
    if (item.kind === 'bug' && group.bug?.text) {
      return group.bug.text.trim();
    }
    if (item.kind === 'market' && group.marketItem?.title) {
      return group.marketItem.title.trim();
    }
    if (group.isCityGroup) {
      return translateCity(group.id, group.name, '');
    }
    return group.name;
  }, [item, t, translateCity]);

  const gameSubtitle = useMemo(() => {
    if (item.kind !== 'game' || !item.game) return '';
    return getGameChatListSetMetaSubtitle(item.game, displaySettings, t);
  }, [item, displaySettings, t]);

  const groupSubtitle = useMemo(() => {
    if (item.kind !== 'group' || !item.groupChannel) return '';
    const count = item.groupChannel.participantsCount;
    if (!count || count <= 0) return '';
    return t('chat.participants', { count });
  }, [item, t]);

  const subtitle = gameSubtitle || groupSubtitle;

  const letter = firstSymbolFromName(displayName);
  const palette = PALETTES[hashSeed(`${item.id}\0${displayName}`) % PALETTES.length];

  const avatar = useMemo(() => {
    if (item.kind === 'game' && item.game) {
      const { Icon, iconClass, ringClass } = getGameChatListEntityVisual(item.game.entityType);
      return (
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 bg-white dark:bg-gray-800 ${ringClass}`}>
          <Icon size={18} className={iconClass} />
        </div>
      );
    }

    const group = item.groupChannel;
    if (!group) {
      return (
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${palette.bg} ${palette.fg} text-sm font-semibold`}>
          {letter}
        </div>
      );
    }

    if (item.kind === 'market' && group.marketItem?.mediaUrls?.[0]) {
      return (
        <img
          src={group.marketItem.mediaUrls[0]}
          alt=""
          className="h-10 w-10 shrink-0 rounded-full object-cover"
        />
      );
    }

    if (group.avatar) {
      return (
        <img
          src={group.avatar}
          alt=""
          className="h-10 w-10 shrink-0 rounded-full object-cover"
        />
      );
    }

    if (item.kind === 'channel') {
      return (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/30">
          <Hash size={18} className="text-primary-600 dark:text-primary-400" />
        </div>
      );
    }

    if (item.kind === 'market') {
      return (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/30">
          <Package size={18} className="text-primary-600 dark:text-primary-400" />
        </div>
      );
    }

    return (
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${palette.bg} ${palette.fg} text-sm font-semibold`}>
        {letter}
      </div>
    );
  }, [item, letter, palette]);

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 border-b border-gray-200 px-1 py-3 text-left transition-colors last:border-b-0 hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
    >
      {avatar}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-gray-900 dark:text-white">
          {displayName}
        </div>
        {subtitle && (
          <div className="truncate text-xs text-gray-500 dark:text-gray-400">
            {subtitle}
          </div>
        )}
      </div>
    </button>
  );
};
