export function isSpotifyLink(url: URL): boolean {
  return /(^|\.)open\.spotify\.com$/i.test(url.hostname) && /^\/(track|album|artist|playlist|episode|show)\//.test(url.pathname);
}
