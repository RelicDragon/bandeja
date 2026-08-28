import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { MentionsInput, Mention, SuggestionDataItem, MentionData } from 'react-mentions';
import { MentionSuggestionsContainer } from './MentionSuggestionsContainer';
import {
  buildBugMentionableUsers,
  buildGameMentionableUsers,
  buildGroupMentionableUsers,
  type MentionableUser,
} from '@/utils/mentionableUsers';
import { buildMentionSuggestionItems } from '@/utils/mentionSuggestionItems';
import {
  resolveGameMentionParticipants,
  resolveGroupMentionParticipants,
  nudgeMentionSuggestionQuery,
} from '@/utils/resolveMentionParticipants';
import { isActiveMentionQuery } from '@/utils/mentionQueryActive';
import { renderMentionSuggestionEntry, syncMentionTextareaHeight } from '@/utils/mentionInputDom';
import { chatApi, ChatContextType, GroupChannel } from '@/api/chat';
import { Game, Bug } from '@/types';
import type { GameParticipant } from '@/types';
import type { GroupChannelParticipant } from '@/api/chat';
import {
  expandMentionIds,
} from '@/utils/mentionAll';
import { getClipboardTextForPaste } from '@/utils/clipboardText';
import { useAuthStore } from '@/store/authStore';

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
  const pasteCleanupRef = useRef<(() => void) | null>(null);
  const mentionQueryCleanupRef = useRef<(() => void) | null>(null);
  const mentionableUsersRef = useRef<MentionableUser[]>([]);
  const hadMentionableUsersRef = useRef(false);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const [suggestionsWidth, setSuggestionsWidth] = useState(300);
  const [gameParticipants, setGameParticipants] = useState<GameParticipant[] | null>(null);
  const [groupParticipants, setGroupParticipants] = useState<GroupChannelParticipant[] | null>(null);

  const syncInputHeight = useCallback(() => {
    syncMentionTextareaHeight(inputRef.current);
  }, []);

  useEffect(() => {
    const updateWidth = () => {
      const inputWidth = containerRef.current?.offsetWidth;
      if (!inputWidth) return;
      const next = Math.min(300, Math.round(inputWidth * 0.9));
      setSuggestionsWidth((prev) => (prev === next ? prev : next));
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    const node = containerRef.current;
    if (node) observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const refreshOpenMention = () => {
      const el = inputRef.current;
      if (!el) return;
      const caret = el.selectionStart ?? el.value.length;
      if (!isActiveMentionQuery(el.value, caret)) return;
      nudgeMentionSuggestionQuery(el);
    };

    vv.addEventListener('resize', refreshOpenMention);
    vv.addEventListener('scroll', refreshOpenMention);
    return () => {
      vv.removeEventListener('resize', refreshOpenMention);
      vv.removeEventListener('scroll', refreshOpenMention);
    };
  }, []);

  useEffect(() => {
    syncInputHeight();
  }, [value, syncInputHeight]);

  const attachMentionQueryListener = useCallback((textarea: HTMLTextAreaElement) => {
    mentionQueryCleanupRef.current?.();

    const refreshIfNeeded = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const caret = textarea.selectionStart ?? textarea.value.length;
          if (!isActiveMentionQuery(textarea.value, caret)) return;
          nudgeMentionSuggestionQuery(textarea);
        });
      });
    };

    textarea.addEventListener('input', refreshIfNeeded);
    mentionQueryCleanupRef.current = () => {
      textarea.removeEventListener('input', refreshIfNeeded);
    };
  }, []);

  const attachPasteHandler = useCallback((textarea: HTMLTextAreaElement) => {
    pasteCleanupRef.current?.();

    const handlePasteCapture = (e: ClipboardEvent) => {
      const data = e.clipboardData;
      if (!data) return;

      if (data.getData('text/react-mentions')) return;

      const text = getClipboardTextForPaste(data);
      if (!text) return;

      e.preventDefault();
      e.stopPropagation();

      textarea.focus();
      document.execCommand('insertText', false, text);
    };

    textarea.addEventListener('paste', handlePasteCapture, true);
    pasteCleanupRef.current = () => textarea.removeEventListener('paste', handlePasteCapture, true);
  }, []);

  useEffect(() => () => {
    pasteCleanupRef.current?.();
    mentionQueryCleanupRef.current?.();
  }, []);

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
      const participants = resolveGameMentionParticipants(game, gameParticipants);
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
      const participants = resolveGroupMentionParticipants(groupChannel, groupParticipants);
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

  mentionableUsersRef.current = mentionableUsers;

  const mentionableUserIds = useMemo(
    () => mentionableUsers.map((u) => u.id),
    [mentionableUsers]
  );

  useEffect(() => {
    const hadUsers = hadMentionableUsersRef.current;
    hadMentionableUsersRef.current = mentionableUsers.length > 0;
    if (hadUsers || mentionableUsers.length === 0) return;

    const el = inputRef.current;
    if (!el) return;
    const caret = el.selectionStart ?? value.length;
    if (!isActiveMentionQuery(value || el.value, caret)) return;
    nudgeMentionSuggestionQuery(el, { requireFocus: false });
  }, [mentionableUsers, value]);

  const handleChange = (
    _e: unknown,
    newValue: string,
    _newPlainTextValue: string,
    mentions: MentionData[]
  ) => {
    const ids = expandMentionIds(
      mentions.map((m) => m.id),
      mentionableUserIds,
      currentUserId
    );
    onChange(newValue, ids);
  };

  const handleKeyDownWrapped = useCallback(
    (e: React.KeyboardEvent<Element>) => {
      onKeyDown?.(e);
    },
    [onKeyDown]
  );

  const searchUsers = useCallback((query: string, callback: (items: SuggestionDataItem[]) => void) => {
    const items = buildMentionSuggestionItems(query, mentionableUsersRef.current);
    callback(items);
    return items;
  }, []);

  const customSuggestionsContainer = useCallback(
    (children: React.ReactNode) => <MentionSuggestionsContainer>{children}</MentionSuggestionsContainer>,
    []
  );

  const renderSuggestion = useCallback(
    (entry: SuggestionDataItem) => renderMentionSuggestionEntry(entry, mentionableUsers),
    [mentionableUsers]
  );

  const inputStyleOverride = useMemo(() => style ?? {}, [style]);

  const customStyle = useMemo(() => ({
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
        ...inputStyleOverride,
      },
    },
    suggestions: {
      container: {
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
        borderBottom: '1px solid rgba(0, 0, 0, 0.15)',
        '&focused': {
          backgroundColor: '#e3f2fd',
        },
      },
    },
  }), [inputStyleOverride, suggestionsWidth]);

  const isDark = document.documentElement.classList.contains('dark');
  const finalStyle = useMemo(() => {
    if (!isDark) return customStyle;
    return {
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
        ...customStyle.suggestions,
        list: {
          ...customStyle.suggestions.list,
          color: '#f3f4f6',
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
  }, [customStyle, isDark]);

  const setInputRef = (el: HTMLTextAreaElement | null) => {
    (inputRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
    pasteCleanupRef.current?.();
    pasteCleanupRef.current = null;
    mentionQueryCleanupRef.current?.();
    mentionQueryCleanupRef.current = null;
    if (el) {
      syncInputHeight();
      attachPasteHandler(el);
      attachMentionQueryListener(el);
    }
  };

  return (
    <div ref={containerRef} className={`mention-input-wrapper min-w-0 ${className}`}>
      <MentionsInput
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDownWrapped}
        placeholder={placeholder}
        disabled={disabled}
        style={finalStyle}
        allowSuggestionsAboveCursor
        customSuggestionsContainer={customSuggestionsContainer}
        inputRef={setInputRef}
      >
        <Mention
          trigger="@"
          data={searchUsers}
          displayTransform={(_id: string, display: string) => `@${display}`}
          markup="@[__display__](__id__)"
          regex={/@\[([^\]]+)\]\(([^)]+)\)/}
          appendSpaceOnAdd
          renderSuggestion={renderSuggestion}
        />
      </MentionsInput>
    </div>
  );
};
