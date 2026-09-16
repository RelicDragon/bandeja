/**
 * Share/copy payload from the text the viewer currently sees
 * (localized or Show original), plus the game link.
 */
export type DisplayedGameListingShareInput = {
  name: string | null | undefined;
  description: string | null | undefined;
  url: string;
};

export type DisplayedGameListingSharePayload = {
  title?: string;
  text: string;
  url: string;
  /** Clipboard / fallback copy — displayed text then link. */
  clipboardText: string;
};

export function buildDisplayedGameListingSharePayload(
  input: DisplayedGameListingShareInput,
): DisplayedGameListingSharePayload {
  const title = input.name?.trim() || undefined;
  const description = input.description?.trim() || undefined;
  const url = input.url;

  const textLines = [description ?? title, url].filter(Boolean) as string[];
  const clipboardLines = [title, description, url].filter(Boolean) as string[];

  return {
    title,
    text: textLines.join('\n'),
    url,
    clipboardText: clipboardLines.join('\n'),
  };
}
