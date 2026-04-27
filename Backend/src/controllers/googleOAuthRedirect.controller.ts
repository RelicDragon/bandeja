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
  const url = generateGoogleAuthUrl(lang);
  res.redirect(url);
});

export const googleOAuthCallback = asyncHandler(async (req: Request, res: Response) => {
  const frontendLogin = `${config.frontendUrl}/login`;

  // Google may redirect back with ?error= when user denies consent
  if (req.query.error) {
    const errorMsg = typeof req.query.error === 'string' ? req.query.error : 'unknown';
    res.redirect(`${frontendLogin}?google_error=${encodeURIComponent(errorMsg)}`);
    return;
  }

  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const code = typeof req.query.code === 'string' ? req.query.code : '';

  if (!state || !code) {
    res.redirect(`${frontendLogin}?google_error=${encodeURIComponent('missing_params')}`);
    return;
  }

  try {
    const { codeVerifier, language } = consumeState(state);
    const googleToken = await exchangeCodeForGoogleToken(code, codeVerifier);
    const oneTimeCode = storeOneTimeCode(googleToken, language);
    res.redirect(`${frontendLogin}?google_code=${encodeURIComponent(oneTimeCode)}`);
  } catch (err: any) {
    const msg = err?.message || 'auth_failed';
    res.redirect(`${frontendLogin}?google_error=${encodeURIComponent(msg)}`);
  }
});

export const googleOAuthExchange = asyncHandler(async (req: Request, res: Response) => {
  const { code } = req.body;
  const { googleToken, language } = consumeOneTimeCode(code);

  const { user, isNewUser } = await loginOrRegisterWithGoogleToken(googleToken, {
    language,
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
