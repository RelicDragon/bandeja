import prisma from '../../config/database';
import { ChatContextType } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';
import { TRANSLATE_TO_LANGUAGE_CODES } from './translation.service';

export class ChatTranslationPreferenceService {
  static async get(
    userId: string,
    chatContextType: ChatContextType,
    contextId: string
  ): Promise<string | null> {
    const row = await prisma.chatTranslationPreference.findUnique({
      where: {
        userId_chatContextType_contextId: {
          userId,
          chatContextType,
          contextId
        }
      }
    });
    return row?.translateToLanguage ?? null;
  }

  static async set(
    userId: string,
    chatContextType: ChatContextType,
    contextId: string,
    translateToLanguage: string | null
  ): Promise<string | null> {
    const code = translateToLanguage?.trim().toLowerCase() || null;
    if (code && !TRANSLATE_TO_LANGUAGE_CODES.includes(code)) {
      throw new ApiError(400, `Invalid translateToLanguage. Allowed: ${TRANSLATE_TO_LANGUAGE_CODES.join(', ')}`);
    }
    const row = await prisma.chatTranslationPreference.upsert({
      where: {
        userId_chatContextType_contextId: {
          userId,
          chatContextType,
          contextId
        }
      },
      update: { translateToLanguage: code },
      create: {
        userId,
        chatContextType,
        contextId,
        translateToLanguage: code
      }
    });
    return row.translateToLanguage;
  }
}
