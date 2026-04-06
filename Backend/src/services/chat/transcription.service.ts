import path from 'path';
import OpenAI from 'openai';
import { parseBuffer } from 'music-metadata';
import { ChatSyncEventType, Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { ChatSyncEventService } from './chatSyncEvent.service';
import { config } from '../../config/env';
import { ApiError } from '../../utils/ApiError';
import { logLlmUsage } from '../ai/llmUsageLog.service';
import { LLM_REASON } from '../ai/llmReasons';
import { S3Service } from '../s3.service';
import { MESSAGE_TRANSCRIPTION_NO_SPEECH, MESSAGE_TRANSCRIPTION_PENDING } from './transcriptionPending';

export const TRANSCRIPTION_MAX_DURATION_MS = 3 * 60 * 1000;

const TRANSCRIPTION_POLL_MS = 250;
const TRANSCRIPTION_FOLLOWER_MAX_WAIT_MS = 15 * 60 * 1000;
const TRANSCRIPTION_STALE_PENDING_MS = 20 * 60 * 1000;
const TRANSCRIPTION_CLAIM_MAX_PASSES = 32;

function isPrismaUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

function logOpenAiTranscriptionError(e: unknown): void {
  const err = e as {
    message?: string;
    status?: number;
    code?: string;
    type?: string;
    error?: { message?: string; code?: string };
    response?: { status?: number; data?: unknown };
  };
  console.error('[transcription] openai_audio_error_details', {
    message: err.message,
    status: err.status ?? err.response?.status,
    code: err.code,
    type: err.type,
    nested: err.error,
    responseData: err.response?.data,
  });
}

function filenameFromAudioUrl(audioUrl: string): string {
  try {
    const u =
      audioUrl.startsWith('http://') || audioUrl.startsWith('https://')
        ? audioUrl
        : `https://dummy/${audioUrl.replace(/^\//, '')}`;
    const pathname = new URL(u).pathname;
    const base = path.basename(pathname);
    if (base && base.includes('.')) return base;
  } catch {
    /* ignore */
  }
  return 'audio.webm';
}

async function assertParsedAudioWithinMaxDuration(
  buffer: Buffer,
  contentType: string | undefined,
  logCtx: { messageId: string; userId: string; audioKey: string }
): Promise<void> {
  try {
    const meta = await parseBuffer(new Uint8Array(buffer), {
      mimeType: contentType,
      size: buffer.length,
    });
    const sec = meta.format.duration;
    if (
      typeof sec === 'number' &&
      Number.isFinite(sec) &&
      sec * 1000 > TRANSCRIPTION_MAX_DURATION_MS
    ) {
      console.warn('[transcription] parsed_audio_too_long', {
        ...logCtx,
        parsedMs: Math.round(sec * 1000),
        maxMs: TRANSCRIPTION_MAX_DURATION_MS,
      });
      throw new ApiError(400, 'Audio longer than 3 minutes cannot be transcribed');
    }
  } catch (e) {
    if (e instanceof ApiError) throw e;
    console.warn('[transcription] duration_parse_failed', {
      ...logCtx,
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

export class TranscriptionService {
  private static async waitForPendingTranscription(
    messageId: string
  ): Promise<
    | { status: 'ready'; transcription: string; languageCode: string | null }
    | { status: 'gone' }
    | { status: 'timeout' }
  > {
    const deadline = Date.now() + TRANSCRIPTION_FOLLOWER_MAX_WAIT_MS;
    while (Date.now() < deadline) {
      const row = await prisma.messageTranscription.findUnique({
        where: { messageId },
      });
      if (!row) {
        console.warn('[transcription] follower_pending_row_gone', { messageId });
        return { status: 'gone' };
      }
      if (row.transcription !== MESSAGE_TRANSCRIPTION_PENDING) {
        return {
          status: 'ready',
          transcription: row.transcription,
          languageCode: row.languageCode,
        };
      }
      await new Promise((r) => setTimeout(r, TRANSCRIPTION_POLL_MS));
    }
    console.warn('[transcription] follower_wait_timeout', {
      messageId,
      maxWaitMs: TRANSCRIPTION_FOLLOWER_MAX_WAIT_MS,
    });
    return { status: 'timeout' };
  }

  private static async transcribeWithWhisper(
    audioUrl: string,
    userId: string,
    messageId: string
  ): Promise<{ text: string; language: string | null }> {
    if (!config.openai.apiKey) {
      console.error('[transcription] missing_openai_api_key', { userId, audioKey: S3Service.extractS3Key(audioUrl) });
      throw new ApiError(503, 'Transcription service is temporarily unavailable. Please try again later.');
    }

    const openai = new OpenAI({ apiKey: config.openai.apiKey });
    let buffer: Buffer;
    let contentType: string | undefined;
    try {
      const out = await S3Service.getObjectBuffer(audioUrl);
      buffer = out.buffer;
      contentType = out.contentType;
    } catch (e: unknown) {
      console.error('[transcription] s3_fetch_audio_failed', {
        userId,
        audioKey: S3Service.extractS3Key(audioUrl),
        isApiError: e instanceof ApiError,
        statusCode: e instanceof ApiError ? e.statusCode : undefined,
        message: e instanceof ApiError ? e.message : (e as Error)?.message,
        raw: e,
      });
      throw e;
    }

    await assertParsedAudioWithinMaxDuration(buffer, contentType, {
      messageId,
      userId,
      audioKey: S3Service.extractS3Key(audioUrl),
    });

    const name = filenameFromAudioUrl(audioUrl);
    const file = new File([new Uint8Array(buffer)], name, { type: contentType || 'application/octet-stream' });

    console.info('[transcription] whisper_request', {
      userId,
      bytes: buffer.length,
      filename: name,
    });

    let res: Awaited<ReturnType<OpenAI['audio']['transcriptions']['create']>>;
    try {
      res = await openai.audio.transcriptions.create({
        file,
        model: 'whisper-1',
        response_format: 'verbose_json',
        prompt: `If the audio contains no intelligible human speech (silence, noise only, or unintelligible), respond with exactly this single token and nothing else: ${MESSAGE_TRANSCRIPTION_NO_SPEECH}`,
      });
    } catch (e: unknown) {
      logOpenAiTranscriptionError(e);
      console.error('[transcription] whisper_api_call_failed', { userId, audioKey: S3Service.extractS3Key(audioUrl), raw: e });
      throw new ApiError(503, 'Transcription service is temporarily unavailable. Please try again later.');
    }

    const rawText = typeof res.text === 'string' ? res.text.trim() : '';
    const language = typeof (res as { language?: string }).language === 'string'
      ? (res as { language: string }).language
      : null;

    const strippedNoSpeech = rawText.replace(/^["'`]+|["'`]+$/g, '').trim();
    const text =
      !rawText || strippedNoSpeech === MESSAGE_TRANSCRIPTION_NO_SPEECH
        ? MESSAGE_TRANSCRIPTION_NO_SPEECH
        : rawText;

    console.info('[transcription] whisper_response', {
      userId,
      outChars: text.length,
      language,
      noSpeech: text === MESSAGE_TRANSCRIPTION_NO_SPEECH,
    });

    await logLlmUsage({
      provider: 'openai',
      model: 'whisper-1',
      reason: LLM_REASON.VOICE_TRANSCRIPTION,
      userId,
      input: JSON.stringify({ audioUrl: S3Service.extractS3Key(audioUrl), bytes: buffer.length }),
      output: text,
      inputTokens: null,
      outputTokens: null,
    });

    return { text, language };
  }

  static async getOrCreateTranscription(
    messageId: string,
    userId: string,
    audioUrl: string,
    audioDurationMs?: number | null
  ): Promise<{ transcription: string; languageCode: string | null; syncSeq?: number }> {
    if (!audioUrl?.trim()) {
      console.error('[transcription] missing_audio_url', { messageId, userId });
      throw new ApiError(400, 'Voice message has no audio');
    }

    for (let pass = 0; pass < TRANSCRIPTION_CLAIM_MAX_PASSES; pass++) {
      const existing = await prisma.messageTranscription.findUnique({
        where: { messageId },
      });

      if (existing && existing.transcription !== MESSAGE_TRANSCRIPTION_PENDING) {
        return {
          transcription: existing.transcription,
          languageCode: existing.languageCode,
        };
      }

      try {
        await prisma.messageTranscription.create({
          data: {
            messageId,
            transcription: MESSAGE_TRANSCRIPTION_PENDING,
            createdBy: userId,
          },
        });
      } catch (e) {
        if (!isPrismaUniqueViolation(e)) {
          console.error('[transcription] claim_create_unexpected_error', {
            messageId,
            userId,
            pass,
            code: e instanceof Prisma.PrismaClientKnownRequestError ? e.code : undefined,
            raw: e,
          });
          throw e;
        }
        const waited = await this.waitForPendingTranscription(messageId);
        if (waited.status === 'ready') {
          return {
            transcription: waited.transcription,
            languageCode: waited.languageCode,
          };
        }
        if (waited.status === 'gone') {
          console.warn('[transcription] claim_race_retry', { messageId, userId, pass, reason: 'pending_row_gone' });
          continue;
        }
        const stale = await prisma.messageTranscription.deleteMany({
          where: {
            messageId,
            transcription: MESSAGE_TRANSCRIPTION_PENDING,
            createdAt: { lt: new Date(Date.now() - TRANSCRIPTION_STALE_PENDING_MS) },
          },
        });
        console.warn('[transcription] follower_timeout_stale_pending_cleanup', {
          messageId,
          userId,
          pass,
          deletedCount: stale.count,
        });
        continue;
      }

      try {
        if (audioDurationMs == null) {
          console.warn('[transcription] missing_stored_duration', { messageId, userId });
          throw new ApiError(400, 'Voice message duration is required for transcription');
        }
        if (audioDurationMs > TRANSCRIPTION_MAX_DURATION_MS) {
          console.warn('[transcription] audio_too_long', {
            messageId,
            userId,
            audioDurationMs,
            maxMs: TRANSCRIPTION_MAX_DURATION_MS,
          });
          throw new ApiError(400, 'Audio longer than 3 minutes cannot be transcribed');
        }
        const chatMsg = await prisma.chatMessage.findUnique({
          where: { id: messageId },
          select: { chatContextType: true, contextId: true },
        });
        if (!chatMsg) {
          throw new ApiError(404, 'Message not found');
        }
        const { text, language } = await this.transcribeWithWhisper(audioUrl, userId, messageId);
        const audioTranscription = { transcription: text, languageCode: language };
        const syncSeq = await prisma.$transaction(async (tx) => {
          await tx.messageTranscription.update({
            where: { messageId },
            data: {
              transcription: text,
              languageCode: language,
            },
          });
          return ChatSyncEventService.appendEventInTransaction(
            tx,
            chatMsg.chatContextType,
            chatMsg.contextId,
            ChatSyncEventType.MESSAGE_TRANSCRIPTION_UPDATED,
            { messageId, audioTranscription }
          );
        });
        return { transcription: text, languageCode: language, syncSeq };
      } catch (err) {
        const cleared = await prisma.messageTranscription.deleteMany({
          where: {
            messageId,
            transcription: MESSAGE_TRANSCRIPTION_PENDING,
          },
        });
        console.error('[transcription] claim_holder_failed_cleared_pending', {
          messageId,
          userId,
          pass,
          audioKey: S3Service.extractS3Key(audioUrl),
          pendingRowsRemoved: cleared.count,
          isApiError: err instanceof ApiError,
          statusCode: err instanceof ApiError ? err.statusCode : undefined,
          clientMessage: err instanceof ApiError ? err.message : undefined,
          errorMessage: err instanceof Error ? err.message : String(err),
          raw: err,
        });
        throw err;
      }
    }

    console.error('[transcription] claim_loop_exhausted', {
      messageId,
      userId,
      maxPasses: TRANSCRIPTION_CLAIM_MAX_PASSES,
      audioKey: S3Service.extractS3Key(audioUrl),
    });
    throw new ApiError(503, 'Transcription timed out. Please try again in a moment.');
  }
}
