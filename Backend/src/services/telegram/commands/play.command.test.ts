/**
 * PRD 356 — `/play` callback parsing, keyboards, copy and the command's own
 * branches (private / group / unlinked / error).
 *
 * The handler branches are exercised with a mocked grammy context and a stubbed
 * `prisma` — no database is touched. `config/env` is still imported (through
 * `config/database`), so the usual backend env must be present, exactly like
 * `pushInviteActionToken.service.test.ts`.
 *
 * Run: `ts-node --transpile-only src/services/telegram/commands/play.command.test.ts`
 */
import type { MiddlewareFn } from 'grammy';
import assert from 'node:assert/strict';
import { PlayIntentTimeOfDay, Sport } from '@prisma/client';
import prisma from '../../../config/database';
import {
  PLAY_TIME_SLOTS,
  buildConfirmationKeyboard,
  buildConfirmationText,
  buildDayKeyboard,
  buildGroupPostKeyboard,
  buildGroupPostText,
  buildStoppedKeyboard,
  buildTimeKeyboard,
  dayLabel,
  handlePlayCommand,
  parsePlayCallback,
  summaryFromIntent,
} from './play.command';
import {
  claimGroupPlayPostInMemory,
  groupPlayPostKey,
  resetGroupPlayPostLimitForTests,
} from '../playGroupPostLimit';
import { chatRateLimitAllows, resetChatRateLimitForTests } from '../middleware';
import type { BotContext } from '../types';

const NOW = new Date('2026-09-20T09:00:00.000Z'); // a Sunday
const TZ = 'Europe/Belgrade';

/* ---------------- callback parsing ---------------- */
{
  assert.deepEqual(parsePlayCallback('pi:d:0'), { kind: 'day', dayOffset: 0 });
  assert.deepEqual(parsePlayCallback('pi:d:2'), { kind: 'day', dayOffset: 2 });
  assert.equal(parsePlayCallback('pi:d:3'), null, 'the intent window is three days');
  assert.equal(parsePlayCallback('pi:d:-1'), null);
  assert.equal(parsePlayCallback('pi:d:x'), null);

  assert.deepEqual(parsePlayCallback('pi:back'), { kind: 'back' });
  assert.deepEqual(parsePlayCallback('pi:cancel'), { kind: 'cancel' });
  assert.deepEqual(parsePlayCallback('pi:again'), { kind: 'again' });

  assert.deepEqual(parsePlayCallback('pi:t:eve:1'), {
    kind: 'time',
    slot: 'eve',
    dayOffset: 1,
  });
  assert.equal(parsePlayCallback('pi:t:midnight:1'), null);
  assert.equal(parsePlayCallback('pi:t:eve'), null, 'the day must travel with the time');

  assert.deepEqual(parsePlayCallback('pi:join:intent-1'), {
    kind: 'join',
    intentId: 'intent-1',
  });
  assert.equal(parsePlayCallback('pi:join:'), null);

  assert.equal(parsePlayCallback('at:game:confirm'), null, 'another prefix is not ours');
  assert.equal(parsePlayCallback('pi:nonsense'), null);
}

/* ---------------- slot mapping ---------------- */
{
  assert.equal(PLAY_TIME_SLOTS.any, PlayIntentTimeOfDay.ANYTIME);
  assert.equal(PLAY_TIME_SLOTS.am, PlayIntentTimeOfDay.MORNING);
  assert.equal(PLAY_TIME_SLOTS.pm, PlayIntentTimeOfDay.AFTERNOON);
  assert.equal(PLAY_TIME_SLOTS.eve, PlayIntentTimeOfDay.EVENING);
}

/* ---------------- keyboards ---------------- */
{
  const day = buildDayKeyboard('en', TZ, NOW).inline_keyboard;
  assert.equal(day.length, 1, 'the three day buttons sit on one row');
  assert.equal(day[0].length, 3);
  assert.deepEqual(
    day[0].map((b) => (b as { text: string }).text),
    ['Today', 'Tomorrow', 'Tue'],
  );
  assert.deepEqual(
    day[0].map((b) => (b as { callback_data: string }).callback_data),
    ['pi:d:0', 'pi:d:1', 'pi:d:2'],
  );

  const time = buildTimeKeyboard('en', 1).inline_keyboard;
  assert.equal(time.length, 3, '2×2 plus the Back row');
  assert.equal(time[0].length, 2);
  assert.equal(time[1].length, 2);
  assert.equal(time[2].length, 1);
  assert.equal((time[2][0] as { text: string }).text, '← Back');
  assert.equal((time[2][0] as { callback_data: string }).callback_data, 'pi:back');
  assert.deepEqual(
    [...time[0], ...time[1]].map((b) => (b as { callback_data: string }).callback_data),
    ['pi:t:any:1', 'pi:t:am:1', 'pi:t:pm:1', 'pi:t:eve:1'],
    'the chosen day travels into every time button',
  );
}

/* ---------------- day labels are real weekdays ---------------- */
{
  assert.equal(dayLabel(0, 'en', TZ, NOW), 'Today');
  assert.equal(dayLabel(1, 'en', TZ, NOW), 'Tomorrow');
  assert.equal(dayLabel(2, 'en', TZ, NOW), 'Tue');
  assert.equal(dayLabel(2, 'ru', TZ, NOW), 'Вт');
}

/* ---------------- confirmation block ---------------- */
{
  const summary = summaryFromIntent(
    {
      sport: Sport.PADEL,
      dateKeys: ['2026-09-21'],
      timeOfDay: PlayIntentTimeOfDay.EVENING,
      timeOfDays: [PlayIntentTimeOfDay.EVENING],
      startTime: null,
      endTime: null,
    },
    { name: 'Belgrade', timezone: TZ },
  );

  const text = buildConfirmationText(summary, 'en', NOW);
  const lines = text.split('\n');
  assert.equal(lines[0], '*✅ You’re looking to play*');
  assert.match(lines[1], /^🎾 .+ · Belgrade$/);
  assert.equal(lines[2], '📅 Tomorrow · Evening');
  assert.equal(lines[4], 'We’ll message you when players or a game match.');
}

/* ---------------- group post ---------------- */
{
  const summary = summaryFromIntent(
    {
      sport: Sport.PADEL,
      dateKeys: ['2026-09-21'],
      timeOfDay: PlayIntentTimeOfDay.EVENING,
      timeOfDays: [PlayIntentTimeOfDay.EVENING],
      startTime: null,
      endTime: null,
    },
    { name: 'Belgrade', timezone: TZ },
  );
  assert.equal(
    buildGroupPostText('Marko', summary, 'en', NOW),
    '🎾 Marko is looking to play Tomorrow · Evening in Belgrade',
  );
  // A name with markdown control characters must not break the post.
  assert.match(buildGroupPostText('Mar*ko', summary, 'en', NOW), /Mar\\\*ko/);
}

/* ---------------- group post limit ---------------- */
{
  resetGroupPlayPostLimitForTests();
  const key = groupPlayPostKey('-100123', 'user-1');
  const t0 = Date.parse('2026-09-20T09:00:00.000Z');
  assert.equal(claimGroupPlayPostInMemory(key, 6 * 3600_000, t0), true);
  assert.equal(claimGroupPlayPostInMemory(key, 6 * 3600_000, t0 + 60_000), false);
  assert.equal(
    claimGroupPlayPostInMemory(key, 6 * 3600_000, t0 + 6 * 3600_000 + 1),
    true,
    'the 6 h window reopens',
  );
  // A different user in the same group is unaffected.
  assert.equal(
    claimGroupPlayPostInMemory(groupPlayPostKey('-100123', 'user-2'), 6 * 3600_000, t0),
    true,
  );
  resetGroupPlayPostLimitForTests();
}

/* ---------------- per-chat command rate limit ---------------- */
{
  resetChatRateLimitForTests();
  const t0 = Date.now();
  for (let i = 0; i < 10; i += 1) {
    assert.equal(chatRateLimitAllows('chat-1', 10, t0 + i), true, `call ${i} allowed`);
  }
  assert.equal(chatRateLimitAllows('chat-1', 10, t0 + 10), false, '11th call in a minute drops');
  assert.equal(chatRateLimitAllows('chat-2', 10, t0 + 10), true, 'other chats unaffected');
  assert.equal(
    chatRateLimitAllows('chat-1', 10, t0 + 61_000),
    true,
    'the window rolls forward',
  );
  resetChatRateLimitForTests();
}

/* ---------------- handler branches, with prisma stubbed ---------------- */
type Reply = { text: string; options?: Record<string, unknown> };

function fakeCtx(
  chatType: 'private' | 'supergroup',
  replies: Reply[],
  telegramId: string | undefined = '555',
): BotContext {
  return {
    chat: { id: chatType === 'private' ? 555 : -100999, type: chatType },
    from: { id: 555, language_code: 'en' },
    telegramId,
    lang: 'en',
    message: { message_id: 1 },
    reply: async (text: string, options?: Record<string, unknown>) => {
      replies.push({ text, options });
      return { message_id: replies.length };
    },
    api: {
      deleteMessage: async () => true,
      sendMessage: async () => ({ message_id: 1 }),
    },
  } as unknown as BotContext;
}

/**
 * `handlePlayCommand` is declared as grammy's `Middleware<BotContext>`, which is a
 * union of a function and an object form; only the function form is callable.
 */
const runPlayCommand = handlePlayCommand as MiddlewareFn<BotContext>;

void (async () => {
  const originalUserFind = prisma.user.findUnique;
  const originalOtpFind = prisma.telegramOtp.findFirst;

  try {
    /* unlinked → the standard login-link flow */
    {
      prisma.user.findUnique = (async () => null) as unknown as typeof prisma.user.findUnique;
      // The login flow bails on its own 60 s cooldown, which keeps this test
      // free of OTP writes while still proving we routed into it.
      prisma.telegramOtp.findFirst = (async () => ({
        id: 'otp-1',
        createdAt: new Date(),
      })) as unknown as typeof prisma.telegramOtp.findFirst;

      const replies: Reply[] = [];
      await runPlayCommand(fakeCtx('private', replies), async () => undefined);
      assert.equal(replies.length, 1, 'the unlinked user gets exactly one reply');
      assert.equal(
        replies[0].text.includes('looking to play'),
        false,
        'no intent copy is shown to an unlinked user',
      );
    }

    /* linked but no city → "Set your city in the app first" + Open profile */
    {
      prisma.user.findUnique = (async () => ({
        id: 'user-1',
        language: 'en',
        primarySport: Sport.PADEL,
        primarySportIsSet: true,
        firstName: 'Marko',
        currentCity: null,
      })) as unknown as typeof prisma.user.findUnique;

      const replies: Reply[] = [];
      await runPlayCommand(fakeCtx('private', replies), async () => undefined);
      assert.equal(replies.length, 1);
      assert.match(replies[0].text, /Set your city in the app first/);
    }

    /* linked, no primary sport chosen → same guidance */
    {
      prisma.user.findUnique = (async () => ({
        id: 'user-1',
        language: 'en',
        primarySport: Sport.PADEL,
        primarySportIsSet: false,
        firstName: 'Marko',
        currentCity: { id: 'city-1', name: 'Belgrade', timezone: TZ },
      })) as unknown as typeof prisma.user.findUnique;

      const replies: Reply[] = [];
      await runPlayCommand(fakeCtx('private', replies), async () => undefined);
      assert.match(replies[0].text, /Set your city in the app first/);
    }

    /* no telegram id → the generic auth error, never a crash */
    {
      const replies: Reply[] = [];
      await runPlayCommand(fakeCtx('private', replies, undefined), async () => undefined);
      assert.equal(replies.length, 1);
    }

    /* a thrown prisma error is caught and answered, not leaked */
    {
      prisma.user.findUnique = (async () => {
        throw new Error('db down');
      }) as unknown as typeof prisma.user.findUnique;

      const replies: Reply[] = [];
      await runPlayCommand(fakeCtx('private', replies), async () => undefined);
      assert.equal(replies.length, 1, 'the error branch still answers the user');
    }

    /* group chat, user without a city → guidance, no group post */
    {
      prisma.user.findUnique = (async () => ({
        id: 'user-1',
        language: 'en',
        primarySport: Sport.PADEL,
        primarySportIsSet: true,
        firstName: 'Marko',
        currentCity: null,
      })) as unknown as typeof prisma.user.findUnique;

      const replies: Reply[] = [];
      await runPlayCommand(fakeCtx('supergroup', replies), async () => undefined);
      assert.equal(replies.length, 1);
      assert.match(replies[0].text, /Set your city in the app first/);
      assert.equal(
        replies[0].text.includes('is looking to play'),
        false,
        'nothing is posted to the group',
      );
    }

    // -----------------------------------------------------------------------
    // Every button the wizard renders must parse back to the branch that
    // handles it.
    //
    // The `pi:` if-chain in `handlers/callback.handler.ts` dispatches on
    // `parsePlayCallback(...).kind`, so a keyboard that emits callback data the
    // parser rejects shows the user "Invalid request" and strands the flow —
    // a class of bug no amount of testing the two sides separately can catch.
    // -----------------------------------------------------------------------
    {
      /** grammy's button union only carries `callback_data` on the callback variant. */
      const callbackDataOf = (button: unknown): string | null => {
        const data = (button as { callback_data?: unknown }).callback_data;
        return typeof data === 'string' ? data : null;
      };

      const keyboards: Array<{ name: string; rows: unknown[][] }> = [
        { name: 'day', rows: buildDayKeyboard('en', TZ, NOW).inline_keyboard },
        { name: 'time', rows: buildTimeKeyboard('en', 1).inline_keyboard },
        {
          name: 'confirm',
          rows: buildConfirmationKeyboard('en', 'play.cancel').inline_keyboard,
        },
        {
          name: 'confirm-existing',
          rows: buildConfirmationKeyboard('en', 'play.stopLooking').inline_keyboard,
        },
        { name: 'stopped', rows: buildStoppedKeyboard('en').inline_keyboard },
        { name: 'group', rows: buildGroupPostKeyboard('en', 'intent-42').inline_keyboard },
      ];

      const seenKinds = new Set<string>();
      for (const keyboard of keyboards) {
        for (const row of keyboard.rows) {
          for (const button of row) {
            // URL buttons ("Open in app") never reach the callback handler.
            const data = callbackDataOf(button);
            if (!data) continue;
            assert.ok(
              data.startsWith('pi:'),
              `${keyboard.name}: every callback button uses the registered prefix`,
            );
            const parsed = parsePlayCallback(data);
            assert.ok(parsed, `${keyboard.name}: "${data}" must parse, or the tap dead-ends`);
            seenKinds.add(parsed!.kind);
          }
        }
      }

      // The branch handles exactly these five kinds; each must be reachable
      // from a real button, and none may be orphaned.
      assert.deepEqual(
        [...seenKinds].sort(),
        ['again', 'back', 'cancel', 'day', 'join', 'time'].sort(),
        'every handled kind is produced by some keyboard',
      );

      // The registration regex only forwards `pi:`-prefixed data.
      const firstDayButton = callbackDataOf(buildDayKeyboard('en', TZ, NOW).inline_keyboard[0][0]);
      assert.ok(
        firstDayButton && /^(sg|rm|ia|rum|rg|rbm|uti|sip|at|sr|wx|pi):/.test(firstDayButton),
        'the wizard prefix is one the bot actually subscribes to',
      );
    }

    console.log('play.command.test.ts: ok');
  } finally {
    prisma.user.findUnique = originalUserFind;
    prisma.telegramOtp.findFirst = originalOtpFind;
    await prisma.$disconnect().catch(() => undefined);
  }
})();
