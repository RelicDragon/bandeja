import type { GifProvider } from './giphySearch.service';

export const GIF_PROVIDER_FAILURE_COOLDOWN_MS = 60_000;

const unavailableUntil = new Map<GifProvider, number>();

export function isGifProviderCoolingDown(
  provider: GifProvider,
  now = Date.now()
): boolean {
  return (unavailableUntil.get(provider) ?? 0) > now;
}

export function recordGifProviderFailure(
  provider: GifProvider,
  now = Date.now()
): void {
  unavailableUntil.set(provider, now + GIF_PROVIDER_FAILURE_COOLDOWN_MS);
}

export function recordGifProviderSuccess(provider: GifProvider): void {
  unavailableUntil.delete(provider);
}

export function resetGifProviderHealthForTests(): void {
  unavailableUntil.clear();
}
