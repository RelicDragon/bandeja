const PROVIDER_HOSTS = ['giphy.com', 'klipy.com', 'tenor.com', 'tenor.co'] as const;

export function isGifProviderHostedUrl(raw: string): boolean {
  try {
    const hostname = new URL(raw).hostname.toLocaleLowerCase().replace(/\.$/, '');
    return PROVIDER_HOSTS.some(
      (providerHost) => hostname === providerHost || hostname.endsWith(`.${providerHost}`)
    );
  } catch {
    return false;
  }
}
