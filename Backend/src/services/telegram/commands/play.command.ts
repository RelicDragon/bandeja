/**
 * PRD 356 — `/play`: create or cancel a play intent from Telegram.
 *
 * Private chat is a two-tap wizard that edits one message in place:
 *   day → time of day → confirmation.
 * Group chat posts a one-line "looking to play" card with an **I'm in too**
 * button, rate limited to one post per user per 6 h per group.
 *
 * All the state lives in the callback data (`pi:…`), never on the server: a
 * bot restart between two taps must not strand the user mid-flow.
 *
 * Intent creation goes through the existing `PlayIntentService.createOrReplace`
 * with the user's primary sport and home city, so the one-OPEN-intent-per
 * city/sport rule, the expiry window and every downstream queue behave exactly
 * as they do from the app.
 */
import { PlayIntentTimeOfDay, Sport } from '@prisma/client';
import { formatInTimeZone } from 'date-fns-tz';
import { InlineKeyboard, Middleware } from 'grammy';
import prisma from '../../../config/database';
import { config } from '../../../config/env';
import { getSportConfig } from '../../../sport/sportRegistry';
import { t } from '../../../utils/translations';
import { buildPlayIntentWhenLabel } from '../../playIntent/playIntentFollowerNotification';
import { PlayIntentService } from '../../playIntent/playIntent.service';
import { liveT } from '../../live/liveCopy';
import { BotContext } from '../types';
import { escapeMarkdown, getUserLanguage } from '../utils';
import { generateLoginLink } from './login.command';
import { claimGroupPlayPost } from '../playGroupPostLimit';

/** `pi:d:<offset>` — the three day buttons. */
export const PLAY_MAX_DAY_OFFSET = 2;

/** Short callback tokens for the four time-of-day choices. */
export const PLAY_TIME_SLOTS = {
  any: PlayIntentTimeOfDay.ANYTIME,
  am: PlayIntentTimeOfDay.MORNING,
  pm: PlayIntentTimeOfDay.AFTERNOON,
  eve: PlayIntentTimeOfDay.EVENING,
} as const;

export type PlayTimeSlot = keyof typeof PLAY_TIME_SLOTS;

const TIME_SLOT_COPY_KEY: Record<PlayTimeSlot, string> = {
  any: 'playIntent.anytime',
  am: 'playIntent.morning',
  pm: 'playIntent.afternoon',
  eve: 'playIntent.evening',
};

const ISO_WEEKDAY_KEYS = [
  'date.shortDay.mon',
  'date.shortDay.tue',
  'date.shortDay.wed',
  'date.shortDay.thu',
  'date.shortDay.fri',
  'date.shortDay.sat',
  'date.shortDay.sun',
] as const;

export type PlayCallback =
  | { kind: 'day'; dayOffset: number }
  | { kind: 'back' }
  | { kind: 'time'; slot: PlayTimeSlot; dayOffset: number }
  | { kind: 'cancel' }
  | { kind: 'again' }
  | { kind: 'join'; intentId: string };

function isTimeSlot(value: string): value is PlayTimeSlot {
  return Object.prototype.hasOwnProperty.call(PLAY_TIME_SLOTS, value);
}

/**
 * Parse a `pi:` callback payload. Returns `null` for anything malformed so the
 * handler can answer the query instead of throwing at the user.
 */
export function parsePlayCallback(data: string): PlayCallback | null {
  if (!data.startsWith('pi:')) return null;
  const parts = data.split(':');

  switch (parts[1]) {
    case 'd': {
      const offset = Number(parts[2]);
      if (!Number.isInteger(offset) || offset < 0 || offset > PLAY_MAX_DAY_OFFSET) return null;
      return { kind: 'day', dayOffset: offset };
    }
    case 'back':
      return parts.length === 2 ? { kind: 'back' } : null;
    case 't': {
      const slot = parts[2] ?? '';
      const offset = Number(parts[3]);
      if (!isTimeSlot(slot)) return null;
      if (!Number.isInteger(offset) || offset < 0 || offset > PLAY_MAX_DAY_OFFSET) return null;
      return { kind: 'time', slot, dayOffset: offset };
    }
    case 'cancel':
      return parts.length === 2 ? { kind: 'cancel' } : null;
    case 'again':
      return parts.length === 2 ? { kind: 'again' } : null;
    case 'join': {
      const intentId = parts.slice(2).join(':');
      return intentId ? { kind: 'join', intentId } : null;
    }
    default:
      return null;
  }
}

/** "Today" / "Tomorrow" / the real weekday name of `now + offset` in the city. */
export function dayLabel(
  dayOffset: number,
  lang: string,
  timezone: string,
  now = new Date(),
): string {
  if (dayOffset === 0) return t('playIntent.today', lang);
  if (dayOffset === 1) return t('playIntent.tomorrow', lang);
  const target = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
  const isoWeekday = Number(formatInTimeZone(target, timezone, 'i'));
  const key = ISO_WEEKDAY_KEYS[Math.max(0, Math.min(isoWeekday - 1, 6))];
  return t(key, lang);
}

export function timeLabel(slot: PlayTimeSlot, lang: string): string {
  return t(TIME_SLOT_COPY_KEY[slot], lang);
}

/** Step 1 — **Today · Tomorrow · {Weekday}**. */
export function buildDayKeyboard(lang: string, timezone: string, now = new Date()): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (let offset = 0; offset <= PLAY_MAX_DAY_OFFSET; offset += 1) {
    keyboard.text(dayLabel(offset, lang, timezone, now), `pi:d:${offset}`);
  }
  return keyboard;
}

/** Step 2 — 2×2 **Anytime · Morning / Afternoon · Evening** plus **← Back**. */
export function buildTimeKeyboard(lang: string, dayOffset: number): InlineKeyboard {
  return new InlineKeyboard()
    .text(timeLabel('any', lang), `pi:t:any:${dayOffset}`)
    .text(timeLabel('am', lang), `pi:t:am:${dayOffset}`)
    .row()
    .text(timeLabel('pm', lang), `pi:t:pm:${dayOffset}`)
    .text(timeLabel('eve', lang), `pi:t:eve:${dayOffset}`)
    .row()
    .text(liveT('play.back', lang), 'pi:back');
}

export type PlayIntentSummaryInput = {
  sport: Sport;
  cityName: string;
  timezone: string;
  dateKeys: string[];
  timeOfDay: PlayIntentTimeOfDay;
  timeOfDays?: PlayIntentTimeOfDay[];
  startTime: string | null;
  endTime: string | null;
};

/** The confirmation block, identical for a fresh intent and an existing one. */
export function buildConfirmationText(
  intent: PlayIntentSummaryInput,
  lang: string,
  now = new Date(),
): string {
  const when = buildPlayIntentWhenLabel(intent, lang, now);
  const sportLabel = t(getSportConfig(intent.sport).labelKey, lang);
  return [
    `*${escapeMarkdown(liveT('play.confirmTitle', lang))}*`,
    `🎾 ${escapeMarkdown(sportLabel)} · ${escapeMarkdown(intent.cityName)}`,
    `📅 ${escapeMarkdown(when)}`,
    '',
    escapeMarkdown(liveT('play.confirmFooter', lang)),
  ].join('\n');
}

export function buildConfirmationKeyboard(lang: string, cancelLabelKey: 'play.cancel' | 'play.stopLooking'): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  if (canUseInlineUrl()) {
    keyboard.url(liveT('play.openInApp', lang), playIntentAppUrl()).row();
  }
  return keyboard.text(liveT(cancelLabelKey, lang), 'pi:cancel');
}

export function buildStoppedKeyboard(lang: string): InlineKeyboard {
  return new InlineKeyboard().text(liveT('play.lookAgain', lang), 'pi:again');
}

/** Deep link to the app's play-intent compose surface (CONTRACT §7.5). */
export function playIntentAppUrl(): string {
  return `${config.frontendUrl}/?playIntentOpen=1`;
}

export function profileAppUrl(): string {
  return `${config.frontendUrl}/profile`;
}

/** Telegram rejects inline URL buttons on loopback hosts (local dev only). */
function canUseInlineUrl(): boolean {
  const url = config.frontendUrl ?? '';
  return !(url.includes('localhost') || url.includes('127.0.0.1'));
}

export type PlayCommandUser = {
  id: string;
  language: string | null;
  /**
   * `User.primarySport` is non-nullable (defaults to PADEL); `primarySportIsSet`
   * is what says the player actually chose one. `null` here means "not chosen",
   * which is the PRD's "no primary sport" error branch.
   */
  primarySport: Sport | null;
  firstName: string | null;
  city: { id: string; name: string; timezone: string } | null;
};

export async function loadPlayCommandUser(telegramId: string): Promise<PlayCommandUser | null> {
  const user = await prisma.user.findUnique({
    where: { telegramId },
    select: {
      id: true,
      language: true,
      primarySport: true,
      primarySportIsSet: true,
      firstName: true,
      currentCity: { select: { id: true, name: true, timezone: true } },
    },
  });
  if (!user) return null;
  return {
    id: user.id,
    language: user.language,
    primarySport: user.primarySportIsSet ? user.primarySport : null,
    firstName: user.firstName,
    city: user.currentCity,
  };
}

/** "Set your city in the app first" + an **Open profile** deep link. */
async function replyNeedsProfile(ctx: BotContext, lang: string): Promise<void> {
  const keyboard = canUseInlineUrl()
    ? new InlineKeyboard().url(liveT('play.openProfile', lang), profileAppUrl())
    : undefined;
  const text = canUseInlineUrl()
    ? liveT('play.needCity', lang)
    : `${liveT('play.needCity', lang)}\n\n${profileAppUrl()}`;
  await ctx.reply(text, { reply_markup: keyboard });
}

/** The confirmation block for an intent row loaded from the DB. */
export function summaryFromIntent(
  intent: {
    sport: Sport;
    dateKeys: string[];
    timeOfDay: PlayIntentTimeOfDay;
    timeOfDays: PlayIntentTimeOfDay[];
    startTime: string | null;
    endTime: string | null;
  },
  city: { name: string; timezone: string },
): PlayIntentSummaryInput {
  return {
    sport: intent.sport,
    cityName: city.name,
    timezone: city.timezone,
    dateKeys: intent.dateKeys,
    timeOfDay: intent.timeOfDay,
    timeOfDays: intent.timeOfDays,
    startTime: intent.startTime,
    endTime: intent.endTime,
  };
}

async function handlePrivatePlay(ctx: BotContext, telegramId: string, telegramLang?: string) {
  const user = await loadPlayCommandUser(telegramId);

  if (!user) {
    // Unlinked: the standard login-link message (loginMessage.service.ts).
    await generateLoginLink(ctx);
    return;
  }

  const lang = getUserLanguage(user.language, telegramLang);

  if (!user.city || !user.primarySport) {
    await replyNeedsProfile(ctx, lang);
    return;
  }

  const existing = await PlayIntentService.getMyActiveIntent(
    user.id,
    user.city.id,
    user.primarySport,
  );

  if (existing) {
    await ctx.reply(buildConfirmationText(summaryFromIntent(existing, user.city), lang), {
      parse_mode: 'Markdown',
      reply_markup: buildConfirmationKeyboard(lang, 'play.stopLooking'),
    });
    return;
  }

  await ctx.reply(liveT('play.askWhen', lang), {
    reply_markup: buildDayKeyboard(lang, user.city.timezone),
  });
}

/** The group card: who is looking, when, where — plus **I'm in too**. */
export function buildGroupPostText(
  firstName: string | null,
  intent: PlayIntentSummaryInput,
  lang: string,
  now = new Date(),
): string {
  const when = buildPlayIntentWhenLabel(intent, lang, now);
  return liveT('play.groupPost', lang, {
    name: escapeMarkdown(firstName ?? '?'),
    when: escapeMarkdown(when),
    city: escapeMarkdown(intent.cityName),
  });
}

export function buildGroupPostKeyboard(lang: string, intentId: string): InlineKeyboard {
  const keyboard = new InlineKeyboard().text(liveT('play.groupJoin', lang), `pi:join:${intentId}`);
  if (canUseInlineUrl()) {
    keyboard.row().url(liveT('play.groupOpenApp', lang), playIntentAppUrl());
  }
  return keyboard;
}

async function handleGroupPlay(ctx: BotContext, telegramId: string, telegramLang?: string) {
  const chatId = ctx.chat?.id?.toString();
  if (!chatId) return;

  const user = await loadPlayCommandUser(telegramId);
  if (!user) {
    // A group is the wrong place for an OTP; point at the private flow instead.
    await ctx.reply(liveT('play.needCity', getUserLanguage(null, telegramLang)));
    return;
  }

  const lang = getUserLanguage(user.language, telegramLang);
  if (!user.city || !user.primarySport) {
    await replyNeedsProfile(ctx, lang);
    return;
  }

  const allowed = await claimGroupPlayPost(chatId, user.id);
  if (!allowed) {
    await ctx.reply(liveT('play.groupRateLimited', lang));
    return;
  }

  const existing = await PlayIntentService.getMyActiveIntent(
    user.id,
    user.city.id,
    user.primarySport,
  );

  /*
   * `/play` in a group *is* the request to play, and a group has no room for a
   * two-step wizard, so a poster without an OPEN intent gets the widest
   * sensible one: today, any time. They can narrow it in the app or with
   * `/play` in DM, which shows this very intent instead of duplicating it.
   */
  const intent =
    existing ??
    (await PlayIntentService.createOrReplace(user.id, {
      cityId: user.city.id,
      sport: user.primarySport,
      dayOffsets: [0],
      timeOfDays: [PlayIntentTimeOfDay.ANYTIME],
    }));

  const summary = summaryFromIntent(intent, user.city);
  await ctx.reply(buildGroupPostText(user.firstName, summary, lang), {
    parse_mode: 'Markdown',
    reply_markup: buildGroupPostKeyboard(lang, intent.id),
  });
}

export const handlePlayCommand: Middleware<BotContext> = async (ctx) => {
  if (!ctx.chat) return;
  const telegramLang = ctx.from?.language_code;

  try {
    if (!ctx.telegramId) {
      await ctx.reply(t('telegram.authError', getUserLanguage(null, telegramLang)));
      return;
    }

    const isGroupChat = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
    if (isGroupChat) {
      await handleGroupPlay(ctx, ctx.telegramId, telegramLang);
      return;
    }
    await handlePrivatePlay(ctx, ctx.telegramId, telegramLang);
  } catch (error) {
    console.error('Error handling play command:', error);
    try {
      await ctx.reply(t('telegram.authError', getUserLanguage(null, telegramLang)));
    } catch (replyError) {
      console.error('Error sending play error message:', replyError);
    }
  }
};
