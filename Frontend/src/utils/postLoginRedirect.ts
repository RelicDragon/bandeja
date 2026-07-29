const POST_LOGIN_PATH_KEY = 'bandeja_post_login_path';

export function rememberPostLoginPath(path: string): void {
  if (!path.startsWith('/') || path.startsWith('//')) return;
  sessionStorage.setItem(POST_LOGIN_PATH_KEY, path);
}

export function readPostLoginPath(): string {
  const path = sessionStorage.getItem(POST_LOGIN_PATH_KEY);
  return path?.startsWith('/') && !path.startsWith('//') ? path : '/';
}

export function consumePostLoginPath(): string {
  const path = readPostLoginPath();
  sessionStorage.removeItem(POST_LOGIN_PATH_KEY);
  return path;
}

export function clearPostLoginPath(): void {
  sessionStorage.removeItem(POST_LOGIN_PATH_KEY);
}
