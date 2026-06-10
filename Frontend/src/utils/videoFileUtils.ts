import { isCapacitor } from './capacitor';

const VIDEO_EXTENSIONS = ['.mp4', '.m4v', '.mov', '.webm', '.mkv', '.avi', '.3gp'] as const;

export function inferVideoMimeType(fileName: string, mimeType = ''): string | null {
  const type = mimeType.trim().toLowerCase();
  if (type.startsWith('video/')) return type;

  const name = fileName.trim().toLowerCase();
  if (name.endsWith('.mov')) return 'video/quicktime';
  if (name.endsWith('.m4v')) return 'video/x-m4v';
  if (name.endsWith('.mp4')) return 'video/mp4';
  if (name.endsWith('.webm')) return 'video/webm';
  if (name.endsWith('.mkv')) return 'video/x-matroska';
  if (name.endsWith('.avi')) return 'video/x-msvideo';
  if (name.endsWith('.3gp')) return 'video/3gpp';

  if (type === 'application/octet-stream' && VIDEO_EXTENSIONS.some((ext) => name.endsWith(ext))) {
    return inferVideoMimeType(fileName, '');
  }

  return null;
}

export function isValidVideo(file: File): boolean {
  if (file.size <= 0 || file.size > 200 * 1024 * 1024) return false;
  if (inferVideoMimeType(file.name, file.type)) return true;
  // iOS WKWebView file input often omits MIME type for gallery videos.
  return isCapacitor();
}

export function withNormalizedVideoMime(file: File): File {
  let mime = inferVideoMimeType(file.name, file.type);
  if (!mime && isCapacitor() && file.size > 0) {
    mime = 'video/mp4';
  }
  if (!mime || file.type === mime) return file;
  return new File([file], file.name, { type: mime, lastModified: file.lastModified });
}
