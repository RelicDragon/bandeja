import type { InternalAxiosRequestConfig } from 'axios';

const KEY = '__padelpulseAuthCredentialGen';

let generation = 0;

export function bumpApiAuthCredentialGeneration(): void {
  generation += 1;
}

export function getApiAuthCredentialGeneration(): number {
  return generation;
}

export function stampApiAuthCredentialGeneration(config: InternalAxiosRequestConfig): void {
  (config as Record<string, unknown>)[KEY] = generation;
}

export function isStaleApiAuthCredentialGeneration(config: unknown): boolean {
  const g = (config as Record<string, unknown>)[KEY];
  if (typeof g !== 'number') return false;
  return g !== generation;
}
