type SetTokenFn = (token: string) => void;

let applyAccessToken: SetTokenFn | null = null;

export function registerAuthAccessTokenSink(fn: SetTokenFn): void {
  applyAccessToken = fn;
}

export function applyAccessTokenFromRefresh(token: string): void {
  applyAccessToken?.(token);
}
