import { describe, expect, it } from 'vitest';
import type { AgentChatDto } from '@shared/agentContract';
import {
  agentChatMonthLabel,
  filterAgentChats,
  groupAgentChats,
  isUntouchedAgentChat,
  normalizeAgentSearch,
} from './agentChatGroups';

const NOW = new Date(2026, 9, 4, 15, 30); // 4 Oct 2026, local time

function chat(id: string, updatedAt: Date, extra: Partial<AgentChatDto> = {}): AgentChatDto {
  return {
    id,
    title: id,
    pinnedAt: null,
    archivedAt: null,
    updatedAt: updatedAt.toISOString(),
    lastMessagePreview: null,
    ...extra,
  } as AgentChatDto;
}

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h);

describe('groupAgentChats', () => {
  it('buckets by local calendar day, then by month', () => {
    const chats = [
      chat('today-late', at(2026, 9, 4, 14)),
      chat('today-early', at(2026, 9, 4, 0)),
      chat('yesterday', at(2026, 9, 3, 23)),
      chat('two-days', at(2026, 9, 2)),
      chat('seven-days', at(2026, 8, 27)),
      chat('eight-days', at(2026, 8, 26)),
      chat('thirty-days', at(2026, 8, 4)),
      chat('august', at(2026, 7, 20)),
      chat('august-early', at(2026, 7, 1)),
      chat('last-year', at(2025, 11, 31)),
    ];
    const groups = groupAgentChats(chats, NOW);
    expect(groups.map((g) => [g.key, g.chats.map((c) => c.id)])).toEqual([
      ['today', ['today-late', 'today-early']],
      ['yesterday', ['yesterday']],
      ['previous7Days', ['two-days', 'seven-days']],
      ['previous30Days', ['eight-days', 'thirty-days']],
      ['month-2026-08', ['august', 'august-early']],
      ['month-2025-12', ['last-year']],
    ]);
    expect(groups[4].month).toEqual(new Date(2026, 7, 1));
  });

  it('puts pinned rows in their own first section only when asked', () => {
    const chats = [
      chat('pinned-old', at(2025, 0, 1), { pinnedAt: at(2026, 9, 1).toISOString() }),
      chat('fresh', at(2026, 9, 4)),
    ];
    expect(groupAgentChats(chats, NOW, { pinned: true }).map((g) => g.key)).toEqual(['pinned', 'today']);
    expect(groupAgentChats(chats, NOW).map((g) => g.key)).toEqual(['today', 'month-2025-01']);
  });

  it('keeps section order even when rows arrive out of order; future / invalid times are today', () => {
    const chats = [
      chat('old', at(2026, 0, 5)),
      chat('future', at(2026, 9, 5)),
      chat('week', at(2026, 8, 30)),
      chat('bad', NOW, { updatedAt: 'nope' }),
    ];
    expect(groupAgentChats(chats, NOW).map((g) => [g.key, g.chats.map((c) => c.id)])).toEqual([
      ['today', ['future', 'bad']],
      ['previous7Days', ['week']],
      ['month-2026-01', ['old']],
    ]);
  });

  it('returns nothing for an empty list', () => {
    expect(groupAgentChats([], NOW)).toEqual([]);
  });
});

describe('agentChatMonthLabel', () => {
  it('omits the year for this year and capitalizes', () => {
    expect(agentChatMonthLabel(new Date(2026, 7, 1), 'en-GB', NOW)).toBe('August');
    expect(agentChatMonthLabel(new Date(2025, 11, 1), 'en-GB', NOW)).toBe('December 2025');
    expect(agentChatMonthLabel(new Date(2026, 2, 1), 'es', NOW)).toBe('Marzo');
  });
});

describe('agent chat search', () => {
  it('normalizes case, accents and whitespace', () => {
    expect(normalizeAgentSearch('  Équipe   PÁDEL ')).toBe('equipe padel');
    expect(normalizeAgentSearch('Ёлка Čeština')).toBe('елка cestina');
  });

  it('matches every word across title and preview, diacritic-insensitive', () => {
    const chats = [
      { id: 'a', title: 'Partido del viernes', lastMessagePreview: 'Reservé la pista 3' },
      { id: 'b', title: 'Weather', lastMessagePreview: 'Rain at 18:00' },
      { id: 'c', title: null, lastMessagePreview: null },
    ];
    expect(filterAgentChats(chats, 'reserve').map((c) => c.id)).toEqual(['a']);
    expect(filterAgentChats(chats, 'VIERNES pista').map((c) => c.id)).toEqual(['a']);
    expect(filterAgentChats(chats, 'rain weather').map((c) => c.id)).toEqual(['b']);
    expect(filterAgentChats(chats, 'nothing')).toEqual([]);
    expect(filterAgentChats(chats, '   ').map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });

  it('uses the given preview resolver', () => {
    const chats = [{ id: 'a', title: 'x', lastMessagePreview: '[booking:abc] Court booked' }];
    expect(filterAgentChats(chats, 'abc', (c) => c.lastMessagePreview.replace(/\[[^\]]+\]\s*/g, ''))).toEqual([]);
  });
});

describe('isUntouchedAgentChat', () => {
  const base = { title: null, lastMessagePreview: null, activeRun: null, pinnedAt: null };
  it('is a chat with no title, message, run or pin', () => {
    expect(isUntouchedAgentChat(base)).toBe(true);
    expect(isUntouchedAgentChat({ ...base, title: '  ' })).toBe(true);
  });
  it('is anything the user touched', () => {
    expect(isUntouchedAgentChat({ ...base, title: 'Plans' })).toBe(false);
    expect(isUntouchedAgentChat({ ...base, lastMessagePreview: 'hi' })).toBe(false);
    expect(isUntouchedAgentChat({ ...base, activeRun: { id: 'r', status: 'QUEUED' } })).toBe(false);
    expect(isUntouchedAgentChat({ ...base, pinnedAt: '2026-10-01T00:00:00.000Z' })).toBe(false);
  });
});
