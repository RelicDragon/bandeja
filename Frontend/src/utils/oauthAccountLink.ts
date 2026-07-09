export type OAuthLinkProvider = 'google' | 'apple' | 'telegram';

export type OAuthLinkResponseData = {
  user: import('@/types').User;
  token?: string;
  refreshToken?: string;
  currentSessionId?: string;
};

export type OAuthLinkMergePending =
  | { provider: 'google'; idToken: string }
  | { provider: 'apple'; identityToken: string; nonce: string };

const MERGE_REQUIRED_CODE = 'auth.oauthLinkMergeRequired';

export function getOAuthLinkMergeRequired(err: unknown): OAuthLinkProvider | null {
  const data = (err as { response?: { data?: { code?: string; message?: string; provider?: string } } })
    ?.response?.data;
  const isMergeRequired =
    data?.code === MERGE_REQUIRED_CODE || data?.message === MERGE_REQUIRED_CODE;
  if (!isMergeRequired) return null;
  if (data.provider === 'apple') return 'apple';
  if (data.provider === 'google') return 'google';
  if (data.provider === 'telegram') return 'telegram';
  return null;
}

export function isOAuthLinkLoginResponse(
  data: OAuthLinkResponseData
): data is OAuthLinkResponseData & { token: string } {
  return typeof data.token === 'string' && data.token.length > 0;
}
