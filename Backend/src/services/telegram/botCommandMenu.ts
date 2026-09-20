/**
 * PRD 356 — the bot's "/" command menu.
 *
 * There was no `setMyCommands` call anywhere in the repo before this, so the
 * menu was empty and every command was invisible unless you already knew it.
 *
 * `setMyCommands` **replaces** the whole list for a scope, so this registers
 * every command the bot actually handles, not just the two new ones. It is
 * called once at startup with a default (English) list plus one localized list
 * per supported bot language.
 */
import type { LanguageCode } from 'grammy/types';
import type { Bot } from 'grammy';
import { LIVE_COPY_LANGUAGES, liveT, type LiveCopyKey } from '../live/liveCopy';

export type BotMenuCommand = { command: string; descriptionKey: LiveCopyKey };

/** Order is what Telegram shows in the "/" popup. */
export const BOT_MENU_COMMANDS: BotMenuCommand[] = [
  { command: 'play', descriptionKey: 'play.menuDescription' },
  { command: 'live', descriptionKey: 'live.menuDescription' },
  { command: 'games', descriptionKey: 'menu.games' },
  // PRD 351 — personal referral link.
  { command: 'invite', descriptionKey: 'menu.invite' },
  { command: 'my', descriptionKey: 'menu.my' },
  { command: 'login', descriptionKey: 'menu.login' },
  { command: 'auth', descriptionKey: 'menu.auth' },
  { command: 'start', descriptionKey: 'menu.start' },
];

/** Telegram rejects a command description longer than 256 characters. */
const MAX_DESCRIPTION = 256;

export function buildBotCommandList(lang: string): { command: string; description: string }[] {
  return BOT_MENU_COMMANDS.map(({ command, descriptionKey }) => ({
    command,
    description: liveT(descriptionKey, lang).slice(0, MAX_DESCRIPTION),
  }));
}

/**
 * Push the menu to Telegram: the default list first, then one per language.
 *
 * Never throws — a failed menu update must not stop the bot from serving
 * messages, and Telegram will keep the previous list until the next boot.
 */
export async function registerBotCommandMenu(bot: Bot): Promise<void> {
  try {
    await bot.api.setMyCommands(buildBotCommandList('en'));
  } catch (error) {
    console.error('Failed to register default bot command menu:', error);
    return;
  }

  for (const lang of LIVE_COPY_LANGUAGES) {
    if (lang === 'en') continue;
    try {
      await bot.api.setMyCommands(buildBotCommandList(lang), {
        language_code: lang as LanguageCode,
      });
    } catch (error) {
      console.error(`Failed to register bot command menu for ${lang}:`, error);
    }
  }
}
