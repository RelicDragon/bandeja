import { formatDate } from '@/utils/dateFormat';
import { formatGameTime, ResolvedDisplaySettings } from '@/utils/displayPreferences';
import { parseMentions } from '@/utils/parseMentions';
import { parseUrls } from '@/utils/parseUrls';
import { ParsedContentPart } from './types';

export function parseContentWithMentionsAndUrls(text: string): ParsedContentPart[] {
  const mentionParts = parseMentions(text);
  const result: ParsedContentPart[] = [];

  mentionParts.forEach(part => {
    if (part.type === 'mention') {
      result.push(part);
    } else {
      const urlParts = parseUrls(part.content);
      result.push(...urlParts);
    }
  });

  return result;
}

export function formatMessageTime(
  dateString: string,
  displaySettings: ResolvedDisplaySettings | null
): string {
  const date = new Date(dateString);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (messageDate.getTime() === today.getTime()) {
    return displaySettings ? formatGameTime(dateString, displaySettings) : formatDate(date, 'HH:mm');
  }
  const timePart = displaySettings ? formatGameTime(dateString, displaySettings) : formatDate(date, 'HH:mm');
  return `${formatDate(date, 'MMM d')} ${timePart}`;
}

export interface ImageGridLayout {
  gridTemplateColumns: string;
  gridTemplateRows: string;
  gap: string;
  singleImage?: boolean;
  firstImageSpan?: boolean;
}

export function getImageGridLayout(count: number): ImageGridLayout {
  if (count === 1) {
    return { gridTemplateColumns: '1fr', gridTemplateRows: 'auto', gap: '0', singleImage: true };
  }
  if (count === 2) {
    return { gridTemplateColumns: '1fr 1fr', gridTemplateRows: 'auto', gap: '0' };
  }
  if (count === 3) {
    return {
      gridTemplateColumns: '1fr 1fr',
      gridTemplateRows: 'auto auto',
      gap: '0',
      firstImageSpan: true,
    };
  }
  if (count === 4) {
    return { gridTemplateColumns: '1fr 1fr', gridTemplateRows: 'auto auto', gap: '0' };
  }
  if (count >= 5 && count <= 6) {
    return { gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'auto auto', gap: '0' };
  }
  return { gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'auto', gap: '0' };
}
