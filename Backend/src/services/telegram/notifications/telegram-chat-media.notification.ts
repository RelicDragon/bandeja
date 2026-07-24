import { Api, InputFile } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { config } from '../../../config/env';
import { t } from '../../../utils/translations';
import { convertMarkdownMessageToHTML, escapeHTML, escapeMarkdown, trimTextForTelegram } from '../utils';
import {
  ChatNotificationMediaPreview,
  resolveChatNotificationMediaPreview,
  type ChatMessageForMediaPreview,
} from '../../shared/chat-notification-media-preview';
import { S3Service } from '../../s3.service';

export interface TelegramChatMediaButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface SendTelegramChatMediaNotificationParams {
  telegramId: string;
  message: ChatMessageForMediaPreview;
  senderName: string;
  captionPrefix: string;
  buttons: TelegramChatMediaButton[][];
  lang: string;
  senderLineStyle?: 'dm' | 'context';
}

function isLocalhostUrl(url: string): boolean {
  return url.includes('localhost') || url.includes('127.0.0.1');
}

function buildCaption(senderName: string, body: string, senderLineStyle: 'dm' | 'context'): string {
  const prefix = senderLineStyle === 'dm' ? '💬' : '👤';
  return `${prefix} *${escapeMarkdown(senderName)}*: ${escapeMarkdown(body)}`;
}

function resolveMediaUrl(message: ChatMessageForMediaPreview): string | undefined {
  const raw = message.mediaUrls?.[0]?.trim();
  if (!raw) {
    return undefined;
  }
  if (raw.startsWith('https://')) {
    return raw;
  }
  const key = raw.startsWith('/') ? raw.substring(1) : raw;
  return S3Service.getCloudFrontUrl(key);
}

function resolveVideoUrl(message: ChatMessageForMediaPreview): string | undefined {
  return resolveMediaUrl(message);
}

function buildSendOptions(
  caption: string,
  buttons: TelegramChatMediaButton[][],
  lang: string
): { caption: string; parse_mode: 'Markdown' | 'HTML'; reply_markup?: InlineKeyboard } {
  const isLocalhost = isLocalhostUrl(config.frontendUrl);
  const urlButtons = buttons.flat().filter((btn) => btn.url);
  const callbackButtons = buttons.flat().filter((btn) => btn.callback_data);

  if (!isLocalhost) {
    return {
      caption,
      parse_mode: 'Markdown',
      reply_markup: buildInlineKeyboard(buttons),
    };
  }

  let finalCaption = convertMarkdownMessageToHTML(caption);
  if (urlButtons.length > 0) {
    const btn = urlButtons[0];
    const linkText = escapeHTML(btn.text || t('telegram.viewChat', lang));
    finalCaption += `\n\n🔗 <a href="${escapeHTML(btn.url!)}">${linkText}</a>`;
  }

  const keyboard = new InlineKeyboard();
  if (callbackButtons.length > 0) {
    keyboard.row(
      ...callbackButtons.map((button) =>
        InlineKeyboard.text(button.text, button.callback_data ?? '')
      )
    );
  }

  return {
    caption: finalCaption,
    parse_mode: 'HTML',
    reply_markup: callbackButtons.length > 0 ? keyboard : undefined,
  };
}

async function sendTextFallback(
  api: Api,
  params: SendTelegramChatMediaNotificationParams,
  preview: ChatNotificationMediaPreview
): Promise<void> {
  const senderLineStyle = params.senderLineStyle ?? 'dm';
  const caption = buildCaption(params.senderName, preview.body, senderLineStyle);
  const fullCaption = params.captionPrefix
    ? `${params.captionPrefix}\n${caption}`
    : caption;
  const sendOptions = buildSendOptions(fullCaption, params.buttons, params.lang);
  const trimmed = trimTextForTelegram(sendOptions.caption, false);
  await api.sendMessage(params.telegramId, trimmed, {
    parse_mode: sendOptions.parse_mode,
    ...(sendOptions.reply_markup ? { reply_markup: sendOptions.reply_markup } : {}),
  });
}

function buildInlineKeyboard(buttons: TelegramChatMediaButton[][]): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const row of buttons) {
    const keyboardRow = row.map((button) => {
      if (button.url) {
        return InlineKeyboard.url(button.text, button.url);
      }
      return InlineKeyboard.text(button.text, button.callback_data ?? '');
    });
    keyboard.row(...keyboardRow);
  }
  return keyboard;
}

export async function sendTelegramChatMediaNotification(
  api: Api,
  params: SendTelegramChatMediaNotificationParams
): Promise<void> {
  const preview = resolveChatNotificationMediaPreview(params.message, params.lang);
  const mediaCaptionStyle: 'dm' | 'context' = 'dm';
  const captionBody = buildCaption(params.senderName, preview.body, mediaCaptionStyle);
  const fullCaption = params.captionPrefix
    ? `${params.captionPrefix}\n${captionBody}`
    : captionBody;
  const sendOptions = buildSendOptions(fullCaption, params.buttons, params.lang);
  const trimmedCaption = trimTextForTelegram(sendOptions.caption, false);

  const messageType = params.message.messageType;
  console.log('[telegram-media-preview]', { messageType: messageType ?? 'TEXT' });

  try {
    if (preview.previewImageUrl && messageType !== 'VIDEO' && messageType !== 'DOCUMENT') {
      await api.sendPhoto(params.telegramId, preview.previewImageUrl, {
        caption: trimmedCaption,
        parse_mode: sendOptions.parse_mode,
        ...(sendOptions.reply_markup ? { reply_markup: sendOptions.reply_markup } : {}),
      });
      return;
    }

    if (messageType === 'VIDEO') {
      const videoUrl = resolveVideoUrl(params.message);
      if (videoUrl) {
        const videoOptions = {
          caption: trimmedCaption,
          parse_mode: sendOptions.parse_mode,
          ...(preview.previewImageUrl ? { thumbnail: preview.previewImageUrl } : {}),
          ...(sendOptions.reply_markup ? { reply_markup: sendOptions.reply_markup } : {}),
        } as Parameters<Api['sendVideo']>[2];
        try {
          await api.sendVideo(params.telegramId, videoUrl, videoOptions);
          return;
        } catch (videoUrlError) {
          console.warn('[telegram-media-preview] video URL send failed, trying buffer upload');
          const rawMedia = params.message.mediaUrls?.[0]?.trim();
          if (rawMedia) {
            const { buffer } = await S3Service.getObjectBuffer(rawMedia);
            await api.sendVideo(
              params.telegramId,
              new InputFile(buffer, 'video.mp4'),
              videoOptions
            );
            return;
          }
          throw videoUrlError;
        }
      }
    }

    if (messageType === 'DOCUMENT') {
      const docUrl = resolveMediaUrl(params.message);
      const fileName =
        typeof params.message.documentFileName === 'string' &&
        params.message.documentFileName.trim()
          ? params.message.documentFileName.trim()
          : 'document';
      if (docUrl) {
        const docOptions = {
          caption: trimmedCaption,
          parse_mode: sendOptions.parse_mode,
          ...(sendOptions.reply_markup ? { reply_markup: sendOptions.reply_markup } : {}),
        } as Parameters<Api['sendDocument']>[2];
        try {
          await api.sendDocument(params.telegramId, docUrl, docOptions);
          return;
        } catch (docUrlError) {
          console.warn('[telegram-media-preview] document URL send failed, trying buffer upload');
          const rawMedia = params.message.mediaUrls?.[0]?.trim();
          if (rawMedia) {
            const { buffer } = await S3Service.getObjectBuffer(rawMedia);
            await api.sendDocument(
              params.telegramId,
              new InputFile(buffer, fileName),
              docOptions
            );
            return;
          }
          throw docUrlError;
        }
      }
    }

    await sendTextFallback(api, params, preview);
  } catch (error) {
    console.warn('[telegram-media-preview] media send failed, falling back to text');
    await sendTextFallback(api, params, preview);
    if (error instanceof Error) {
      console.warn('[telegram-media-preview]', error.message);
    }
  }
}
