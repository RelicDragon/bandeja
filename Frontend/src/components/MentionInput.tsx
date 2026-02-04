import React, { useRef, useEffect, useState, useMemo } from 'react';
import { MentionsInput, Mention, SuggestionDataItem, MentionData } from 'react-mentions';
import { ChatContextType, GroupChannel } from '@/api/chat';
import { Game, Bug, BasicUser } from '@/types';
import { normalizeChatType } from '@/utils/chatType';
import { PlayerAvatar } from './PlayerAvatar';
import { matchesSearch } from '@/utils/transliteration';

interface MentionableUser extends BasicUser {
  display: string;
}

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
  const [suggestionsWidth, setSuggestionsWidth] = useState(300);

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        const inputWidth = containerRef.current.offsetWidth;
        setSuggestionsWidth(Math.min(300, inputWidth * 0.9));
      }
    };
    
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    
    return () => observer.disconnect();
  }, []);


  const mentionableUsers = useMemo((): MentionableUser[] => {
    if (contextType === 'GAME' && game) {
      const users: MentionableUser[] = [];
      const userIds = new Set<string>();
      const normalizedChatType = chatType ? normalizeChatType(chatType as any) : 'PUBLIC';

      if (normalizedChatType === 'PUBLIC') {
        game.participants?.forEach(p => {
          if (p.user && !userIds.has(p.user.id)) {
            userIds.add(p.user.id);
            users.push({
              ...p.user,
              display: `${p.user.firstName || ''} ${p.user.lastName || ''}`.trim() || 'Unknown',
            });
          }
        });
        game.participants
          ?.filter(p => p.status === 'INVITED')
          .forEach(p => {
            if (p.user && !userIds.has(p.user.id)) {
              userIds.add(p.user.id);
              users.push({
                ...p.user,
                display: `${p.user.firstName || ''} ${p.user.lastName || ''}`.trim() || 'Unknown',
              });
            }
          });
        
        game.parent?.participants
          ?.filter(p => p.role === 'ADMIN' || p.role === 'OWNER')
          .forEach(p => {
            if (p.user && !userIds.has(p.user.id)) {
              userIds.add(p.user.id);
              users.push({
                ...p.user,
                display: `${p.user.firstName || ''} ${p.user.lastName || ''}`.trim() || 'Unknown',
              });
            }
          });
      } else if (normalizedChatType === 'ADMINS') {
        game.participants
          ?.filter(p => p.role === 'ADMIN' || p.role === 'OWNER')
          .forEach(p => {
            if (p.user && !userIds.has(p.user.id)) {
              userIds.add(p.user.id);
              users.push({
                ...p.user,
                display: `${p.user.firstName || ''} ${p.user.lastName || ''}`.trim() || 'Unknown',
              });
            }
          });
        
        game.parent?.participants
          ?.filter(p => p.role === 'ADMIN' || p.role === 'OWNER')
          .forEach(p => {
            if (p.user && !userIds.has(p.user.id)) {
              userIds.add(p.user.id);
              users.push({
                ...p.user,
                display: `${p.user.firstName || ''} ${p.user.lastName || ''}`.trim() || 'Unknown',
              });
            }
          });
      } else if (normalizedChatType === 'PRIVATE') {
        game.participants
          ?.filter(p => p.status === 'PLAYING')
          .forEach(p => {
            if (p.user && !userIds.has(p.user.id)) {
              userIds.add(p.user.id);
              users.push({
                ...p.user,
                display: `${p.user.firstName || ''} ${p.user.lastName || ''}`.trim() || 'Unknown',
              });
            }
          });
        
        game.participants
          ?.filter(p => p.role === 'ADMIN' || p.role === 'OWNER')
          .forEach(p => {
            if (p.user && !userIds.has(p.user.id)) {
              userIds.add(p.user.id);
              users.push({
                ...p.user,
                display: `${p.user.firstName || ''} ${p.user.lastName || ''}`.trim() || 'Unknown',
              });
            }
          });
        
        game.parent?.participants
          ?.filter(p => p.role === 'ADMIN' || p.role === 'OWNER')
          .forEach(p => {
            if (p.user && !userIds.has(p.user.id)) {
              userIds.add(p.user.id);
              users.push({
                ...p.user,
                display: `${p.user.firstName || ''} ${p.user.lastName || ''}`.trim() || 'Unknown',
              });
            }
          });
      } else if (normalizedChatType === 'PHOTOS') {
        game.participants?.forEach(p => {
          if (p.user && !userIds.has(p.user.id)) {
            userIds.add(p.user.id);
            users.push({
              ...p.user,
              display: `${p.user.firstName || ''} ${p.user.lastName || ''}`.trim() || 'Unknown',
            });
          }
        });
        
        game.parent?.participants
          ?.filter(p => p.role === 'ADMIN' || p.role === 'OWNER')
          .forEach(p => {
            if (p.user && !userIds.has(p.user.id)) {
              userIds.add(p.user.id);
              users.push({
                ...p.user,
                display: `${p.user.firstName || ''} ${p.user.lastName || ''}`.trim() || 'Unknown',
              });
            }
          });
      }

      console.log('[MentionInput] GAME mentionableUsers:', users.length, users);
      return users;
    } else if (contextType === 'BUG' && bug) {
      const users: MentionableUser[] = [];
      const userIds = new Set<string>();

      if (bug.sender && !userIds.has(bug.sender.id)) {
        userIds.add(bug.sender.id);
        users.push({
          ...bug.sender,
          display: `${bug.sender.firstName || ''} ${bug.sender.lastName || ''}`.trim() || 'Unknown',
        });
      }

      bug.participants?.forEach(p => {
        if (p.user && !userIds.has(p.user.id)) {
          userIds.add(p.user.id);
          users.push({
            ...p.user,
            display: `${p.user.firstName || ''} ${p.user.lastName || ''}`.trim() || 'Unknown',
          });
        }
      });

      return users;
    } else if (contextType === 'GROUP' && groupChannel) {
      const users: MentionableUser[] = [];
      const userIds = new Set<string>();

      groupChannel.participants?.forEach(p => {
        if (p.user && !userIds.has(p.user.id)) {
          userIds.add(p.user.id);
          users.push({
            ...p.user,
            display: `${p.user.firstName || ''} ${p.user.lastName || ''}`.trim() || 'Unknown',
          });
        }
      });

      return users;
    } else if (contextType === 'USER') {
      return [];
    }

    return [];
  }, [contextType, game, bug, groupChannel, chatType]);

  const handleChange = (_e: any, newValue: string, _newPlainTextValue: string, mentions: MentionData[]) => {
    const ids = mentions.map(m => m.id);
    onChange(newValue, ids);
  };

  const searchUsers = (query: string, callback: (items: SuggestionDataItem[]) => void) => {
    console.log('[MentionInput] searchUsers called with query:', query, 'mentionableUsers count:', mentionableUsers.length);
    
    if (!query || query.trim() === '') {
      const suggestions: SuggestionDataItem[] = mentionableUsers.map(user => ({
        id: user.id,
        display: user.display,
        user: user,
      }));
      console.log('[MentionInput] Returning all suggestions:', suggestions.length);
      callback(suggestions);
      return;
    }

    const filtered = mentionableUsers.filter(user => {
      const display = user.display;
      const firstName = user.firstName || '';
      const lastName = user.lastName || '';
      return matchesSearch(query, display) || matchesSearch(query, firstName) || matchesSearch(query, lastName);
    });

    const suggestions: SuggestionDataItem[] = filtered.map(user => ({
      id: user.id,
      display: user.display,
      user: user,
    }));

    console.log('[MentionInput] Returning filtered suggestions:', suggestions.length);
    callback(suggestions);
  };

  const renderSuggestion = (entry: SuggestionDataItem) => {
    const user = (entry as any).user || mentionableUsers.find(u => u.id === entry.id);
    if (!user) return <span>{entry.display}</span>;
    
    return (
      <div className="flex items-center gap-2">
        <PlayerAvatar
          player={user}
          extrasmall={true}
          fullHideName={true}
        />
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
      },
      highlighter: {
        padding: '12px 16px',
        paddingRight: '80px',
        border: 'none',
        borderRadius: '16px',
        boxSizing: 'border-box' as const,
        minHeight: 48,
        maxHeight: 120,
        overflow: 'hidden' as const,
      },
      input: {
        padding: '12px 16px',
        paddingRight: '80px',
        border: 'none',
        borderRadius: '16px',
        outline: 'none',
        backgroundColor: 'transparent',
        color: 'rgb(17, 24, 39)',
        boxSizing: 'border-box' as const,
        minHeight: 48,
        maxHeight: 120,
        overflow: 'hidden' as const,
        resize: 'none' as const,
        ...(style || {}),
      },
    },
    suggestions: {
      container: {
        backgroundColor: 'transparent',
        zIndex: 99999,
      },
      list: {
        backgroundColor: 'white',
        border: '1px solid rgba(0,0,0,0.15)',
        fontSize: 14,
        maxHeight: '200px',
        overflowY: 'auto' as const,
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        width: `${suggestionsWidth}px`,
        position: 'relative' as const,
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
        backgroundColor: '#374151',
        borderColor: '#4b5563',
        color: '#f3f4f6',
        width: `${suggestionsWidth}px`,
        position: 'relative' as const,
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

  return (
    <div ref={containerRef} className={`mention-input-wrapper ${className}`}>
      <MentionsInput
        value={value}
        onChange={handleChange}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        style={finalStyle}
        allowSuggestionsAboveCursor
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

