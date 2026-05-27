export function getClipboardTextForPaste(data: DataTransfer | null): string {
  if (!data) return '';

  const plain = data.getData('text/plain').trim();
  if (plain) return plain;

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
