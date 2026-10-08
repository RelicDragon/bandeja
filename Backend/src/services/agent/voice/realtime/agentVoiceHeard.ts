/**
 * Barge-in bookkeeping for agent voice v2: which part of a spoken reply the user actually
 * heard (from the client's `playedMs`), and the stored reply cut down to it. Pure.
 */
import { AGENT_VOICE_OUTPUT_SAMPLE_RATE } from '@bandeja/shared/agentVoiceRealtime';
import { pcmDurationMs } from './agentVoicePcm';

/** Marker at the end of a reply cut short by the user talking over it. */
export const AGENT_VOICE_CUT_MARKER = '…';

/** Rough speech rate for a sentence whose audio had not fully arrived yet. */
const MS_PER_CHAR_ESTIMATE = 65;

/** One spoken item of a turn, in playback order. */
export type AgentVoiceSpokenItem = {
  kind: 'reply' | 'progress' | 'confirm';
  /** Speakable text (estimate base when the audio is incomplete). */
  text: string;
  /** Reply items: the markdown slice `[rawStart, rawEnd)` of the run's streamed text. */
  rawStart: number;
  rawEnd: number;
  /** Audio bytes sent to the client. */
  bytesSent: number;
  /** All of its audio was produced (and sent). */
  complete: boolean;
};

/**
 * Offset into the run's streamed text up to which the reply was heard: whole reply sentences
 * whose audio was played, plus the played share of the sentence playing at `playedMs`, cut back
 * to a word boundary. Fillers / confirm prompts take audio time but add no reply text.
 */
export function heardReplyOffset(items: readonly AgentVoiceSpokenItem[], playedMs: number, streamedText: string): number {
  let left = Math.max(0, playedMs);
  let heard = 0;
  for (const item of items) {
    if (item.bytesSent <= 0) break;
    const itemMs = pcmDurationMs(item.bytesSent, AGENT_VOICE_OUTPUT_SAMPLE_RATE);
    if (item.kind !== 'reply') {
      if (left < itemMs) break;
      left -= itemMs;
      continue;
    }
    if (left >= itemMs && item.complete) {
      heard = item.rawEnd;
      left -= itemMs;
      continue;
    }
    const totalMs = item.complete ? itemMs : Math.max(itemMs, item.text.length * MS_PER_CHAR_ESTIMATE);
    const share = Math.min(1, Math.min(left, itemMs) / totalMs);
    const raw = streamedText.slice(item.rawStart, item.rawEnd);
    let cut = Math.floor(raw.length * share);
    if (cut < raw.length) {
      const space = raw.lastIndexOf(' ', cut);
      cut = space > 0 ? space : 0;
    }
    heard = item.rawStart + cut;
    break;
  }
  return heard;
}

/**
 * A stored reply message's text cut to what was heard. `messageStart` is where the message's
 * text sits in the run's streamed text. Null = it was heard completely (keep as is).
 */
export function truncateHeardText(text: string, messageStart: number, heardOffset: number): string | null {
  const keep = heardOffset - messageStart;
  if (keep >= text.length) return null;
  const head = text.slice(0, Math.max(0, keep)).replace(/[\s,;:–—-]+$/u, '');
  if (!head) return AGENT_VOICE_CUT_MARKER;
  // "Two games tomorrow. …" after a whole sentence, "The best one is at…" mid-sentence.
  return /[.!?。！？…]$/u.test(head) ? `${head} ${AGENT_VOICE_CUT_MARKER}` : `${head}${AGENT_VOICE_CUT_MARKER}`;
}
