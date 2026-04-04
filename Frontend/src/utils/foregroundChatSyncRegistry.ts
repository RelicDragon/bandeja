let impl: (() => void) | null = null;

export function registerForegroundChatSync(fn: () => void): void {
  impl = fn;
}

export function triggerForegroundChatSync(): void {
  impl?.();
}
