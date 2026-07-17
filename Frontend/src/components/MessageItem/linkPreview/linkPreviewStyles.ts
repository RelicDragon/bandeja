import type { ContentVariant } from '../MessageContentBody';

/** Nested preview surfaces — match chat bubble chrome (blue own / neutral other). */
export function linkPreviewSurfaceClass(variant: ContentVariant, standalone = false): string {
  if (variant === 'own') {
    if (standalone) {
      return 'border-blue-400/30 bg-gradient-to-br from-blue-500 to-blue-600 dark:from-blue-600 dark:to-blue-700 text-white shadow-sm shadow-blue-900/10';
    }
    return 'border-white/20 bg-white/15 text-white';
  }
  if (variant === 'channel') {
    return 'border-gray-200/90 dark:border-gray-600/70 bg-gray-50/90 dark:bg-gray-800/60 text-gray-800 dark:text-gray-100';
  }
  return 'border-gray-200/70 dark:border-gray-600/50 bg-black/[0.03] dark:bg-white/[0.06] text-gray-800 dark:text-gray-100';
}

export function linkPreviewMutedClass(variant: ContentVariant): string {
  if (variant === 'own') return 'text-blue-100/85';
  return 'text-gray-500 dark:text-gray-400';
}

export function linkPreviewAccentClass(variant: ContentVariant, isBandeja: boolean): string {
  if (variant === 'own') return 'bg-white/55';
  if (isBandeja) return 'bg-blue-500 dark:bg-blue-400';
  return 'bg-gray-300 dark:bg-gray-500';
}

export function linkPreviewBadgeClass(variant: ContentVariant): string {
  if (variant === 'own') return 'bg-white/20 text-white';
  return 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-200';
}
