import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { MentionsInput, Mention, SuggestionDataItem, MentionData } from 'react-mentions';
import { MentionSuggestionsContainer } from './MentionSuggestionsContainer';
import { chatApi, ChatContextType, GroupChannel } from '@/api/chat';
import { Game, Bug } from '@/types';
import type { GameParticipant } from '@/types';
import type { GroupChannelParticipant } from '@/api/chat';
import { PlayerAvatar } from './PlayerAvatar';
import { matchesSearch } from '@/utils/transliteration';
import {
  buildBugMentionableUsers,
  buildGameMentionableUsers,
  buildGroupMentionableUsers,
  type MentionableUser,
} from '@/utils/mentionableUsers';

interface MentionInputProps {
  value: string;
  onChange: (value: string, mentionIds: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  game?: Game | null;
  bug?: Bug | null;
  groupChannel?: GroupChannel | null;
  userChatId?: string;
  contextType: ChatContextType;
  chatType?: string;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  className?: string;
  style?: React.CSSProperties;
}

export const MentionInput: React.FC<MentionInputProps> = ({
  value,
  onChange,
  placeholder,
  disabled = false,
  game,
  bug,
  groupChannel,
  userChatId: _userChatId,
  contextType,
  chatType = 'PUBLIC',
  onKeyDown,
  className = '',
  style,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [suggestionsWidth, setSuggestionsWidth] = useState(300);
  const [suggestionsPortalHost, setSuggestionsPortalHost] = useState<HTMLElement | null>(null);
  const [gameParticipants, setGameParticipants] = useState<GameParticipant[] | null>(null);
  const [groupParticipants, setGroupParticipants] = useState<GroupChannelParticipant[] | null>(null);

  const syncInputHeight = () => {
    const textarea = inputRef.current;
    if (!textarea) return;
    const minH = 48;
    const maxH = 120;
    textarea.style.height = '0';
    const h = Math.min(maxH, Math.max(minH, textarea.scrollHeight));
    textarea.style.height = `${h}px`;
    const control = textarea.parentElement;
    if (control) {
      (control as HTMLElement).style.height = `${h}px`;
    }
  };

  useEffect(() => {
    setSuggestionsPortalHost(document.body);
  }, []);

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        const inputWidth = containerRef.current.offsetWidth;
        setSuggestionsWidth(Math.min(300, inputWidth * 0.9));
      }
      requestAnimationFrame(() => syncInputHeight());
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const id = requestAnimationFrame(() => syncInputHeight());
    return () => cancelAnimationFrame(id);
  }, [value]);

  const gameId = game?.id;
  useEffect(() => {
    if (contextType !== 'GAME' || !gameId) {
      setGameParticipants(null);
      return;
    }
    let cancelled = false;
    chatApi
      .getGameParticipants(gameId)
      .then((list) => {
        if (!cancelled) setGameParticipants(list);
      })
      .catch(() => {
        if (!cancelled) setGameParticipants(null);
      });
    return () => {
      cancelled = true;
    };
  }, [contextType, gameId]);

  const groupChannelId = groupChannel?.id;
  useEffect(() => {
    if (contextType !== 'GROUP' || !groupChannelId) {
      setGroupParticipants(null);
      return;
    }
    let cancelled = false;
    chatApi
      .getGroupChannelParticipants(groupChannelId)
      .then((list) => {
        if (!cancelled) setGroupParticipants(list);
      })
      .catch(() => {
        if (!cancelled) setGroupParticipants(null);
      });
    return () => {
      cancelled = true;
    };
  }, [contextType, groupChannelId]);

  const mentionableUsers = useMemo((): MentionableUser[] => {
    if (contextType === 'GAME' && game) {
      const participants = gameParticipants ?? game.participants ?? [];
      return buildGameMentionableUsers(
        participants,
        game.parent?.participants,
        chatType
      );
    }
    if (contextType === 'BUG' && bug) {
      return buildBugMentionableUsers(bug);
    }
    if (contextType === 'GROUP' && groupChannel) {
      const participants = groupParticipants ?? groupChannel.participants ?? [];
      return buildGroupMentionableUsers(participants);
    }
    return [];
  }, [
    contextType,
    game,
    bug,
    groupChannel,
    chatType,
    gameParticipants,
    groupParticipants,
  ]);

  const handleChange = (_e: unknown, newValue: string, _newPlainTextValue: string, mentions: MentionData[]) => {
    const ids = mentions.map((m) => m.id);
    onChange(newValue, ids);
  };

  const searchUsers = useCallback(
    (query: string, callback: (items: SuggestionDataItem[]) => void) => {
      const trimmed = query?.trim() ?? '';
      const filtered = trimmed
        ? mentionableUsers.filter((user) => {
            const display = user.display;
            const firstName = user.firstName || '';
            const lastName = user.lastName || '';
            return (
              matchesSearch(trimmed, display) ||
              matchesSearch(trimmed, firstName) ||
              matchesSearch(trimmed, lastName)
            );
          })
        : mentionableUsers;

      callback(
        filtered.map((user) => ({
          id: user.id,
          display: user.display,
          user,
        }))
      );
    },
    [mentionableUsers]
  );

  const customSuggestionsContainer = useCallback(
    (children: React.ReactNode) => <MentionSuggestionsContainer>{children}</MentionSuggestionsContainer>,
    []
  );

  const renderSuggestion = (entry: SuggestionDataItem) => {
    const user =
      (entry as SuggestionDataItem & { user?: MentionableUser }).user ||
      mentionableUsers.find((u) => u.id === entry.id);
    if (!user) return <span>{entry.display}</span>;

    return (
      <div className="flex items-center gap-2">
        <PlayerAvatar player={user} extrasmall={true} fullHideName={true} />
        <span>{entry.display}</span>
      </div>
    );
  };

  const customStyle = {
    control: {
      backgroundColor: 'transparent',
      fontSize: 14,
      fontWeight: 'normal',
      color: 'inherit',
    },
    '&multiLine': {
      control: {
        fontFamily: 'inherit',
        minHeight: 48,
        maxHeight: 120,
        overflow: 'hidden' as const,
        wordBreak: 'break-word' as const,
        overflowWrap: 'break-word' as const,
      },
      highlighter: {
        padding: '12px 16px',
        paddingRight: '80px',
        border: 'none',
        borderRadius: '24px',
        boxSizing: 'border-box' as const,
        minHeight: 48,
        maxHeight: 120,
        overflow: 'hidden' as const,
        wordBreak: 'break-word' as const,
        overflowWrap: 'break-word' as const,
      },
      input: {
        padding: '12px 16px',
        paddingRight: '80px',
        border: 'none',
        borderRadius: '24px',
        outline: 'none',
        backgroundColor: 'transparent',
        color: 'rgb(17, 24, 39)',
        boxSizing: 'border-box' as const,
        minHeight: 48,
        maxHeight: 120,
        overflowX: 'hidden' as const,
        overflowY: 'auto' as const,
        WebkitOverflowScrolling: 'touch',
        resize: 'none' as const,
        wordBreak: 'break-word' as const,
        overflowWrap: 'break-word' as const,
        ...(style || {}),
      },
    },
    suggestions: {
      container: {
        backgroundColor: 'transparent',
        zIndex: 99999,
      },
      list: {
        backgroundColor: 'transparent',
        border: 'none',
        fontSize: 14,
        maxHeight: 'min(200px, calc(var(--vv-height, 100dvh) - var(--keyboard-height, 0px) - 120px))',
        overflowY: 'auto' as const,
        borderRadius: '12px',
        boxShadow: 'none',
        width: `${suggestionsWidth}px`,
        margin: 0,
        padding: 0,
      },
      item: {
        padding: '8px 12px',
        borderBottom: '1px solid rgba(0,0,0,0.15)',
        '&focused': {
          backgroundColor: '#e3f2fd',
        },
      },
    },
  };

  const darkStyle = {
    ...customStyle,
    '&multiLine': {
      ...customStyle['&multiLine'],
      input: {
        ...customStyle['&multiLine'].input,
        backgroundColor: 'transparent',
        border: 'none',
        color: '#f3f4f6',
      },
    },
    suggestions: {
      container: {
        backgroundColor: 'transparent',
        zIndex: 99999,
      },
      list: {
        ...customStyle.suggestions.list,
        color: '#f3f4f6',
        width: `${suggestionsWidth}px`,
      },
      item: {
        ...customStyle.suggestions.item,
        borderBottomColor: '#4b5563',
        '&focused': {
          backgroundColor: '#4b5563',
        },
      },
    },
  };

  const isDark = document.documentElement.classList.contains('dark');
  const finalStyle = isDark ? darkStyle : customStyle;

  const setInputRef = (el: HTMLTextAreaElement | null) => {
    (inputRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
    if (el) syncInputHeight();
  };

  return (
    <div ref={containerRef} className={`mention-input-wrapper min-w-0 ${className}`}>
      <MentionsInput
        value={value}
        onChange={handleChange}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        style={finalStyle}
        allowSuggestionsAboveCursor
        forceSuggestionsAboveCursor
        suggestionsPortalHost={suggestionsPortalHost ?? undefined}
        customSuggestionsContainer={customSuggestionsContainer}
        inputRef={setInputRef}
      >
        <Mention
          trigger="@"
          data={searchUsers}
          displayTransform={(_id: string, display: string) => `@${display}`}
          markup="@[__display__](__id__)"
          regex={/@\[([^\]]+)\]\(([^)]+)\)/}
          renderSuggestion={renderSuggestion}
        />
      </MentionsInput>
    </div>
  );
};
