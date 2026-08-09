import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { config } from '../config/env';
import { issuedRefreshJsonPayload } from '../utils/refreshWebCookie';
import {
  generateGoogleAuthUrl,
  consumeState,
  exchangeCodeForGoogleToken,
  storeOneTimeCode,
  consumeOneTimeCode,
} from '../services/google/googleOAuthRedirect.service';
import {
  loginOrRegisterWithGoogleToken,
  finalizeGoogleLogin,
} from '../services/auth/oauthLogin.service';

export const googleOAuthRedirect = asyncHandler(async (req: Request, res: Response) => {
  const lang = typeof req.query.lang === 'string' ? req.query.lang : 'en';
  const primarySport = req.query.primarySport;
  const redirectUri = typeof req.query.redirect_uri === 'string' ? req.query.redirect_uri : undefined;
  const url = generateGoogleAuthUrl(lang, primarySport, redirectUri);
  res.redirect(url);
});

export const googleOAuthCallback = asyncHandler(async (req: Request, res: Response) => {
  const fallbackLogin = `${config.frontendUrl}/login`;

  // Google may redirect back with ?error= when user denies consent
  if (req.query.error) {
    const stateRaw = typeof req.query.state === 'string' ? req.query.state : '';
    if (stateRaw) {
      try {
        const { redirectUri } = consumeState(stateRaw);
        const frontendLogin = new URL(redirectUri).origin + '/login';
        const errorMsg = typeof req.query.error === 'string' ? req.query.error : 'unknown';
        res.redirect(`${frontendLogin}?google_error=${encodeURIComponent(errorMsg)}`);
        return;
      } catch {
        // fall through to fallback
      }
    }
    const errorMsg = typeof req.query.error === 'string' ? req.query.error : 'unknown';
    res.redirect(`${fallbackLogin}?google_error=${encodeURIComponent(errorMsg)}`);
    return;
  }

  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const code = typeof req.query.code === 'string' ? req.query.code : '';

  if (!state || !code) {
    res.redirect(`${fallbackLogin}?google_error=${encodeURIComponent('missing_params')}`);
    return;
  }

  try {
    const { codeVerifier, language, primarySport, primarySportIsSet, redirectUri } = consumeState(state);
    const frontendLogin = new URL(redirectUri).origin + '/login';
    try {
      const googleToken = await exchangeCodeForGoogleToken(code, codeVerifier, redirectUri);
      const oneTimeCode = storeOneTimeCode(googleToken, language, primarySport, primarySportIsSet);
      res.redirect(`${frontendLogin}?google_code=${encodeURIComponent(oneTimeCode)}`);
    } catch (err: any) {
      const msg = err?.message || 'auth_failed';
      res.redirect(`${frontendLogin}?google_error=${encodeURIComponent(msg)}`);
    }
  } catch (err: any) {
    const msg = err?.message || 'auth_failed';
    res.redirect(`${fallbackLogin}?google_error=${encodeURIComponent(msg)}`);
  }
});

export const googleOAuthExchange = asyncHandler(async (req: Request, res: Response) => {
  const { code } = req.body;
  const { googleToken, language, primarySport, primarySportIsSet } = consumeOneTimeCode(code);

  const { user, isNewUser } = await loginOrRegisterWithGoogleToken(googleToken, {
    language,
    primarySport,
    primarySportIsSet,
  });
  const result = await finalizeGoogleLogin(user.id, isNewUser, req);

  res.status(result.statusCode).json({
    success: true,
    data: {
      user: result.user,
      token: result.token,
      ...issuedRefreshJsonPayload(req, res, {
        refreshToken: result.refreshToken,
        currentSessionId: result.currentSessionId,
      }),
    },
  });
});
