/**
 * PRD 356 — `/live`: what is on court right now.
 *
 * Works in private chats (the user's home city) and in groups exactly like
 * `/games` (the city wired to `City.telegramGroupId`).
 *
 * The bot calls `listLiveGames` **directly** — it must never HTTP round-trip to
 * its own API — so the privacy gate it obeys is literally the same code the
 * Find rail obeys (`services/game/liveGames.service.ts`).
 */
import { InlineKeyboard, Middleware } from 'grammy';
import prisma from '../../../config/database';
import { config } from '../../../config/env';
import { signLiveSpectatorToken } from '../../../utils/jwt';
import { formatSetScoreLine } from '../../game/liveGameSummary';
import { listLiveGames, type LiveRailGame } from '../../game/liveGames.service';
import { liveT } from '../../live/liveCopy';
import { isLocalhostUrl } from '../shared/message-builder';
import { BotContext } from '../types';
import { escapeMarkdown, getUserLanguage } from '../utils';

/** The PRD caps the reply at five blocks so the message stays scannable. */
export const LIVE_COMMAND_MAX_GAMES = 5;
/** Player names are truncated so both sides fit one line on a phone. */
export const LIVE_NAME_MAX_CHARS = 12;

const ELLIPSIS = '…';

/**
 * `escapeMarkdown` plus the backtick.
 *
 * The score blocks are monospace, i.e. backtick-delimited, so a backtick inside
 * a club or player name would close the span and corrupt every following line.
 * `escapeMarkdown` does not cover it (nothing else in the bot uses code spans),
 * and backslash-escaping a backtick is not a thing in Telegram's legacy
 * Markdown — so it is swapped for the look-alike modifier letter instead.
 */
export function escapeLiveMarkdown(text: string): string {
  return escapeMarkdown(text).replace(/`/g, 'ˋ');
}

/** First name, truncated to {@link LIVE_NAME_MAX_CHARS} including the ellipsis. */
export function truncateName(name: string | null | undefined, max = LIVE_NAME_MAX_CHARS): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return '?';
  if (trimmed.length <= max) return trimmed;
  const head = trimmed.slice(0, Math.max(1, max - 1)).trimEnd();
  return `${head}${ELLIPSIS}`;
}

function sideNames(side: LiveRailGame['liveSummary']['sides'][number]): string {
  if (side.players.length === 0) return '?';
  return side.players.map((p) => truncateName(p.firstName)).join(' / ');
}

/** "Started 23 min ago" / "Just started". */
export function startedLabel(startedAt: string | null | undefined, lang: string, now: Date): string {
  if (!startedAt) return liveT('live.startedJustNow', lang);
  const parsed = Date.parse(startedAt);
  if (Number.isNaN(parsed)) return liveT('live.startedJustNow', lang);
  const minutes = Math.floor((now.getTime() - parsed) / 60000);
  if (minutes < 1) return liveT('live.startedJustNow', lang);
  return liveT('live.startedMinutesAgo', lang, { minutes });
}

function venueLine(game: LiveRailGame): string {
  const parts = [game.clubName, game.courtName].filter((p): p is string => Boolean(p));
  if (parts.length === 0) return escapeLiveMarkdown(game.name ?? game.cityName);
  return parts.map(escapeLiveMarkdown).join(' · ');
}

export type LiveMessageWatchLink = { label: string; url: string };

export type LiveMessage = {
  text: string;
  /** One "Watch" URL button per block, in block order. */
  links: LiveMessageWatchLink[];
};

/**
 * Render the `/live` reply. Pure apart from the token signing, so the format is
 * snapshot-testable.
 */
export function buildLiveMessage(
  games: LiveRailGame[],
  cityName: string,
  lang: string,
  options: { now?: Date; signToken?: (gameId: string, matchId: string) => string } = {},
): LiveMessage {
  const now = options.now ?? new Date();
  const signToken = options.signToken ?? signLiveSpectatorToken;
  const visible = games.slice(0, LIVE_COMMAND_MAX_GAMES);

  const header = `*${escapeLiveMarkdown(liveT('live.header', lang, { city: cityName }))}*`;

  if (visible.length === 0) {
    return { text: `${header}\n\n${escapeLiveMarkdown(liveT('live.empty', lang))}`, links: [] };
  }

  const links: LiveMessageWatchLink[] = [];
  const blocks = visible.map((game, index) => {
    const summary = game.liveSummary;
    const score = formatSetScoreLine(summary) || '—';
    const left = sideNames(summary.sides[0]);
    const right = sideNames(summary.sides[1]);

    links.push({
      label: `${index + 1}. ${liveT('live.watchAction', lang)}`,
      url: buildWatchUrl(game.id, summary.matchId, signToken),
    });

    return [
      venueLine(game),
      `${escapeLiveMarkdown(left)}  \`${score}\`  ${escapeLiveMarkdown(right)}`,
      `_${escapeLiveMarkdown(startedLabel(summary.startedAt, lang, now))}_`,
    ].join('\n');
  });

  const footer = `_${escapeLiveMarkdown(liveT('live.footer', lang))}_`;
  return { text: [header, ...blocks, footer].join('\n\n'), links };
}

/**
 * Public watch URL (the read-only TV board) carrying a freshly minted spectator
 * token. Not `/broadcast` — that page is the OBS overlay, not something to watch.
 */
export function buildWatchUrl(
  gameId: string,
  matchId: string,
  signToken: (gameId: string, matchId: string) => string = signLiveSpectatorToken,
): string {
  const token = signToken(gameId, matchId);
  const params = new URLSearchParams({ matchId, spectatorToken: token });
  return `${config.frontendUrl}/games/${gameId}/watch?${params.toString()}`;
}

function watchKeyboard(links: LiveMessageWatchLink[]): InlineKeyboard | undefined {
  if (links.length === 0) return undefined;
  const keyboard = new InlineKeyboard();
  links.forEach((link, index) => {
    keyboard.url(link.label, link.url);
    if (index < links.length - 1) keyboard.row();
  });
  return keyboard;
}

/**
 * Telegram rejects inline URL buttons pointing at localhost, so in local dev
 * the Watch links are appended to the message body instead. Production keeps
 * the buttons (`buildMessageWithButtons` only preserves the *first* URL button
 * in its localhost branch, which would drop four of the five here).
 */
function withLocalhostFallback(message: LiveMessage): LiveMessage {
  if (!isLocalhostUrl(config.frontendUrl) || message.links.length === 0) return message;
  const appended = message.links
    .map((link) => `🔗 [${escapeLiveMarkdown(link.label)}](${link.url})`)
    .join('\n');
  return { text: `${message.text}\n\n${appended}`, links: [] };
}

export const handleLiveCommand: Middleware<BotContext> = async (ctx) => {
  if (!ctx.chat) return;

  const telegramLang = ctx.from?.language_code;
  const isGroupChat = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
  let userLang = getUserLanguage(null, telegramLang);

  try {
    let cityId: string | null = null;
    let cityName = '';
    let viewerUserId: string | null = null;

    if (isGroupChat) {
      const city = await prisma.city.findFirst({
        where: { telegramGroupId: ctx.chat.id.toString(), isActive: true },
        select: { id: true, name: true },
      });
      if (!city) {
        await ctx.reply(liveT('live.noCity', userLang));
        return;
      }
      cityId = city.id;
      cityName = city.name;
    } else {
      if (!ctx.telegramId) {
        await ctx.reply(liveT('live.noCity', userLang));
        return;
      }
      const user = await prisma.user.findUnique({
        where: { telegramId: ctx.telegramId },
        select: {
          id: true,
          language: true,
          currentCityId: true,
          currentCity: { select: { id: true, name: true } },
        },
      });
      if (!user) {
        await ctx.reply(liveT('live.noCity', userLang));
        return;
      }
      userLang = getUserLanguage(user.language, telegramLang);
      if (!user.currentCity) {
        await ctx.reply(liveT('live.noCity', userLang));
        return;
      }
      viewerUserId = user.id;
      cityId = user.currentCity.id;
      cityName = user.currentCity.name;
    }

    const games = await listLiveGames({
      cityId,
      viewerUserId,
      limit: LIVE_COMMAND_MAX_GAMES,
    });

    const message = withLocalhostFallback(buildLiveMessage(games, cityName, userLang));
    await ctx.reply(message.text, {
      parse_mode: 'Markdown',
      reply_markup: watchKeyboard(message.links),
    });
  } catch (error) {
    console.error('Error handling live command:', error);
    try {
      await ctx.reply(liveT('live.empty', userLang));
    } catch (replyError) {
      console.error('Error sending live error message:', replyError);
    }
  }
};
