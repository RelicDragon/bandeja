import type { EvalCaseFactory, ToolArgs } from '../types';
import type { EvalFixture } from '../fixtures';
import { hasLocalClock, isLocalTime, tool, writeOn } from './helpers';

const patch = (a: ToolArgs) => (a.patch ?? {}) as Record<string, unknown>;
const invites = (key: keyof EvalFixture['users']) => (a: ToolArgs, fx: EvalFixture) =>
  a.gameId === fx.games.tomorrow && Array.isArray(a.userIds) && a.userIds.includes(fx.users[key]);

export const writeCases: EvalCaseFactory = (fx) => [
  // --- join / leave --------------------------------------------------------------------------
  { id: 'writes.join.en', area: 'writes', locale: 'en', message: 'Join me to the Morning americano game.', expect: { write: writeOn('join_game', 'americano') } },
  { id: 'writes.join.ru', area: 'writes', locale: 'ru', message: 'Запиши меня на Morning americano послезавтра утром.', expect: { write: writeOn('join_game', 'americano') } },
  { id: 'writes.join.id', area: 'writes', locale: 'id', message: 'Tolong daftarkan saya ke permainan Morning americano.', expect: { write: writeOn('join_game', 'americano') } },
  { id: 'writes.join.zh', area: 'writes', locale: 'zh', message: '帮我报名后天早上的 Morning americano。', expect: { write: writeOn('join_game', 'americano') } },
  { id: 'writes.leave.sr', area: 'writes', locale: 'sr', message: 'Odjavi me iz igre Thursday ladder, ne mogu da dođem.', expect: { write: writeOn('leave_game', 'full') } },

  // --- cancel ---------------------------------------------------------------------------------
  { id: 'writes.cancel.en', area: 'writes', locale: 'en', message: 'Cancel my game tomorrow evening.', expect: { write: writeOn('cancel_game', 'tomorrow') } },
  { id: 'writes.cancel.ru', area: 'writes', locale: 'ru', message: 'Отмени мою завтрашнюю игру.', expect: { write: writeOn('cancel_game', 'tomorrow') } },
  { id: 'writes.cancel.ja', area: 'writes', locale: 'ja', message: '明日の試合をキャンセルしてください。', expect: { write: writeOn('cancel_game', 'tomorrow') } },
  { id: 'writes.cancel.ar', area: 'writes', locale: 'ar', message: 'من فضلك ألغِ مباراتي غدًا.', expect: { write: writeOn('cancel_game', 'tomorrow') } },
  { id: 'writes.cancel.th', area: 'writes', locale: 'th', message: 'ช่วยยกเลิกเกมของฉันพรุ่งนี้ให้หน่อย', expect: { write: writeOn('cancel_game', 'tomorrow') } },

  // --- update ---------------------------------------------------------------------------------
  {
    id: 'writes.move-time.en',
    area: 'writes',
    locale: 'en',
    message: 'Move my game tomorrow to 20:30.',
    expect: { write: { tool: 'update_game', args: (a, f) => a.gameId === f.games.tomorrow && isLocalTime(patch(a).startTime, f, f.dates.tomorrow, '20:30') } },
  },
  {
    id: 'writes.move-time.sr',
    area: 'writes',
    locale: 'sr',
    message: 'Pomeri moju sutrašnju igru na 20h.',
    expect: { write: { tool: 'update_game', args: (a, f) => a.gameId === f.games.tomorrow && hasLocalClock(patch(a).startTime, f, '20:00') } },
  },

  // --- roster ---------------------------------------------------------------------------------
  { id: 'writes.invite.en', area: 'writes', locale: 'en', message: 'Invite Petar Nikolić to my game tomorrow.', expect: { tools: [tool('search_players')], write: { tool: 'invite_players', args: invites('petar') } } },
  {
    id: 'writes.invite-translit.ru',
    area: 'writes',
    locale: 'ru',
    message: 'Пригласи Елену Попович на мою завтрашнюю игру.',
    expect: { write: { tool: 'invite_players', args: invites('jelena') } },
    note: 'name typed in Russian Cyrillic; stored as Latin "Jelena Popović"',
  },
  { id: 'writes.invite.hi', area: 'writes', locale: 'hi', message: 'कल वाले मेरे गेम में Petar Nikolić को इनवाइट कर दो।', expect: { write: { tool: 'invite_players', args: invites('petar') } } },
  {
    id: 'writes.remove-player.cs',
    area: 'writes',
    locale: 'cs',
    message: 'Odeber Ivana Kovače z mé zítřejší hry.',
    expect: { write: { tool: 'remove_participant', args: (a, f) => a.gameId === f.games.tomorrow && a.playerId === f.users.ivan } },
  },

  // --- create ---------------------------------------------------------------------------------
  {
    id: 'writes.create.en',
    area: 'writes',
    locale: 'en',
    message: `Create a padel game at Zenit Padel Club on ${fx.dates.in3} at 10:00 for 4 players.`,
    expect: { write: { tool: ['create_game', 'create_game_with_booking'], args: (a, f) => Boolean(a.slotRef) || a.clubId === f.clubs.zenit && isLocalTime(a.startTime, f, f.dates.in3, '10:00') } },
  },
  {
    id: 'writes.create.sr',
    area: 'writes',
    locale: 'sr',
    message: 'Napravi novu igru u Dunav Areni prekosutra u 18h.',
    expect: { write: { tool: ['create_game', 'create_game_with_booking'], args: (a, f) => Boolean(a.slotRef) || a.clubId === f.clubs.dunav && isLocalTime(a.startTime, f, f.dates.in2, '18:00') } },
  },

  // --- chat / play intent ---------------------------------------------------------------------
  {
    id: 'writes.chat-post.en',
    area: 'writes',
    locale: 'en',
    message: 'Post in the chat of my game tomorrow: "I\'ll bring new balls".',
    expect: { write: { tool: 'post_to_game_chat', args: (a, f) => a.gameId === f.games.tomorrow && /balls/i.test(String(a.text)) } },
  },
  { id: 'writes.play-intent.en', area: 'writes', locale: 'en', message: "Let people know I'm looking to play padel on Saturday morning.", expect: { write: { tool: 'set_play_intent' } } },
  { id: 'writes.play-intent-cancel.ru', area: 'writes', locale: 'ru', message: 'Отмени мой запрос «ищу игру».', expect: { write: { tool: 'cancel_play_intent' } } },

  // --- questions that must NOT write ----------------------------------------------------------
  { id: 'writes.question-cancel.en', area: 'writes', locale: 'en', message: 'If I cancel my game tomorrow, what happens to the other players? Just asking, don\'t do anything yet.', expect: { write: 'none' } },
  { id: 'writes.question-leave.sr', area: 'writes', locale: 'sr', message: 'Da li mogu da napustim Thursday ladder i šta se onda dešava? Samo pitam.', expect: { write: 'none' } },
  { id: 'writes.question-notify.ru', area: 'writes', locale: 'ru', message: 'Если я перенесу завтрашнюю игру, игроки получат уведомление?', expect: { write: 'none' } },
];
