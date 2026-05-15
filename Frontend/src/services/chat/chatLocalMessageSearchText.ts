import transliterate from '@sindresorhus/transliterate';
import type { ChatMessage } from '@/api/chat';

function normalizeForSearch(text: string | null): string | null {
  if (!text?.trim()) return null;
  try {
    return transliterate(text).toLowerCase().trim();
  } catch {
    return text.toLowerCase().trim();
  }
}

function extractSearchableContent(content: string | null, pollQuestion?: string): string | null {
  if (!content?.trim() && !pollQuestion?.trim()) return null;
  if (content?.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(content!) as { text?: string; question?: string };
      return parsed.text ?? parsed.question ?? pollQuestion ?? null;
    } catch {
      return content;
    }
  }
  if (content?.trim().startsWith('[TYPE:')) return pollQuestion?.trim() || null;
  return content?.trim() || pollQuestion?.trim() || null;
}

function formatDurationSearchLabel(durationMs: number): string {
  const totalSec = Math.floor(durationMs / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function computeVoiceContentSearchable(audioDurationMs: number): string | null {
  return normalizeForSearch(`voice message ${formatDurationSearchLabel(audioDurationMs)}`);
}

function computeVideoContentSearchable(videoDurationMs: number): string | null {
  return normalizeForSearch(`video message ${formatDurationSearchLabel(videoDurationMs)}`);
}

export function computeChatLocalSearchText(m: ChatMessage): string | null {
  const pollQ = m.poll?.question;
  const extracted = extractSearchableContent(m.content ?? null, pollQ);
  const fromText = extracted ? normalizeForSearch(extracted) : null;
  if (m.messageType === 'VOICE' && m.audioDurationMs != null && m.audioDurationMs > 0) {
    const voice = computeVoiceContentSearchable(m.audioDurationMs);
    if (fromText && voice) return `${fromText} ${voice}`;
    return voice ?? fromText;
  }
  if (m.messageType === 'VIDEO' && m.videoDurationMs != null && m.videoDurationMs > 0) {
    const video = computeVideoContentSearchable(m.videoDurationMs);
    if (fromText && video) return `${fromText} ${video}`;
    return video ?? fromText;
  }
  return fromText;
}

export function normalizeChatLocalSearchQuery(q: string): string | null {
  return normalizeForSearch(q.trim());
}
