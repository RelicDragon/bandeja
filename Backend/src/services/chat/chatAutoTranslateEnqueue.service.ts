import { MessageType } from '@prisma/client';
import prisma from '../../config/database';
import { MESSAGE_TRANSCRIPTION_PENDING } from '@bandeja/chat-contract';
import { ChatAutoTranslateService } from './chatAutoTranslate.service';
import { sourceAppearsToBeTargetLanguage } from './translationFrancCheck';
import { TranslationQueueService } from './translationQueue.service';

export class ChatAutoTranslateEnqueueService {
  static async resolveTranslatableText(messageId: string): Promise<string | null> {
    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId },
      select: {
        content: true,
        messageType: true,
        senderId: true,
      },
    });
    if (!message || !message.senderId) return null;

    let sourceText = message.content?.trim() ?? '';
    if (!sourceText && message.messageType === MessageType.VOICE) {
      const tr = await prisma.messageTranscription.findUnique({
        where: { messageId },
        select: { transcription: true },
      });
      if (
        tr?.transcription &&
        tr.transcription !== MESSAGE_TRANSCRIPTION_PENDING
      ) {
        sourceText = tr.transcription.trim();
      }
    }
    return sourceText || null;
  }

  static async enqueueForMessage(messageId: string): Promise<void> {
    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        senderId: true,
        chatContextType: true,
        contextId: true,
        chatType: true,
        messageType: true,
      },
    });
    if (!message?.senderId) return;

    const sourceText = await this.resolveTranslatableText(messageId);
    if (!sourceText) return;

    const languageCodes = await ChatAutoTranslateService.getLanguageCodesForMessage(
      message
    );
    if (languageCodes.length === 0) return;

    const triggerUserId = message.senderId;

    for (const languageCode of languageCodes) {
      if (await sourceAppearsToBeTargetLanguage(sourceText, languageCode)) {
        continue;
      }
      await TranslationQueueService.enqueue({
        messageId,
        languageCode,
        userId: triggerUserId,
        priority: 'normal',
        source: 'auto',
      });
    }
  }

  static async onMessageEdited(messageId: string): Promise<void> {
    await TranslationQueueService.cancelJobsForMessage(messageId);
    await prisma.messageTranslation.deleteMany({ where: { messageId } });
    await this.enqueueForMessage(messageId);
  }

  static async onTranscriptionReady(messageId: string): Promise<void> {
    await this.enqueueForMessage(messageId);
  }
}
