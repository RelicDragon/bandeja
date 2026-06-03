export function normalizeClipboardTextForPaste(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';

  const lines = trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length > 1 && lines.every((line) => line === lines[0])) {
    return lines[0];
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length > 1 && parts.every((part) => part === parts[0])) {
    return parts[0];
  }

  return trimmed;
}

export function getClipboardTextForPaste(data: DataTransfer | null): string {
  if (!data) return '';

  const plain = data.getData('text/plain').trim();
  if (plain) return normalizeClipboardTextForPaste(plain);

  const uriList = data.getData('text/uri-list');
  if (uriList.trim()) {
    const line = uriList
      .split('\n')
      .map((entry) => entry.trim())
      .find((entry) => entry && !entry.startsWith('#'));
    if (line) return line;
  }

  const html = data.getData('text/html');
  if (html.trim()) {
    const hrefMatch = html.match(/href=["']([^"']+)["']/i);
    if (hrefMatch?.[1]?.trim()) return hrefMatch[1].trim();
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text) return text;
  }

  return '';
}
