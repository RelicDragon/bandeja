import { config } from '../../../config/env';
import { t } from '../../../utils/translations';
import { escapeHTML, convertMarkdownMessageToHTML } from '../utils';

export interface TelegramButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface TelegramMessageOptions {
  parse_mode?: 'Markdown' | 'HTML';
  reply_markup?: any;
}

function isLocalhostUrl(url: string): boolean {
  return url.includes('localhost') || url.includes('127.0.0.1');
}

export function buildMessageWithButtons(
  message: string,
  buttons: TelegramButton[][],
  lang: string
): { message: string; options: TelegramMessageOptions } {
  const isLocalhost = isLocalhostUrl(config.frontendUrl);
  const urlButtons = buttons.flat().filter(btn => btn.url);
  const callbackButtons = buttons.flat().filter(btn => btn.callback_data);

  let parseMode: 'Markdown' | 'HTML' = 'Markdown';
  let finalMessage = message;
  const replyMarkup: any = { inline_keyboard: [] };

  if (isLocalhost) {
    parseMode = 'HTML';
    finalMessage = convertMarkdownMessageToHTML(message);
    
    if (urlButtons.length > 0) {
      const viewGameText = escapeHTML(t('telegram.viewGame', lang));
      const url = urlButtons[0].url!;
      finalMessage += `\n\n🔗 <a href="${escapeHTML(url)}">${viewGameText}</a>`;
    }
    
    if (callbackButtons.length > 0) {
      replyMarkup.inline_keyboard = [callbackButtons];
    }
  } else {
    replyMarkup.inline_keyboard = buttons;
  }

  const options: TelegramMessageOptions = {
    parse_mode: parseMode
  };
  
  if (replyMarkup.inline_keyboard && replyMarkup.inline_keyboard.length > 0) {
    options.reply_markup = replyMarkup;
  }

  return {
    message: finalMessage,
    options
  };
}

