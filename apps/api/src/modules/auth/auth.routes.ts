import { createHash } from 'node:crypto';
import { Router, type CookieOptions, type Request, type Response } from 'express';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  requestVerificationSchema,
  resetPasswordSchema,
  verifyPhoneSchema,
} from '@nurserylink/shared';
import type { z } from 'zod';
import { ipKeyGenerator } from 'express-rate-limit';
import type { Config } from '../../config.js';
import { requireAuth } from '../../middleware/auth.js';
import { limiter } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import { UnauthorizedError } from '../../lib/errors.js';
import { OTP_TTL_MINUTES, type AuthService, type Session } from './auth.service.js';

export const REFRESH_COOKIE = 'nl_refresh';
/** The admin console's own session, so signing in there never signs the public site in (and back) */
export const ADMIN_REFRESH_COOKIE = 'nl_admin_refresh';
const REFRESH_COOKIE_PATH = '/api/v1/auth';

/**
 * Which app is calling: the admin console sends `X-Client: admin`. Browsers share cookies between
 * ports of one host (localhost:5173 and :5174) and, with COOKIE_DOMAIN, between subdomains.
 */
const cookieFor = (req: Request): string => (req.get('x-client') === 'admin' ? ADMIN_REFRESH_COOKIE : REFRESH_COOKIE);

type Body<S extends z.ZodType> = z.output<S>;
const body = <S extends z.ZodType>(res: Response, _schema: S): Body<S> => (res.locals.validated as { body: Body<S> }).body;

export const authRoutes = (service: AuthService, config: Config): Router => {
  const router = Router();

  const cookieOptions: CookieOptions = {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    // Web and admin are same-site (localhost ports, or subdomains in production), so Lax is enough
    // and still blocks cross-site POSTs from carrying the cookie.
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
    ...(config.COOKIE_DOMAIN ? { domain: config.COOKIE_DOMAIN } : {}),
  };

  const sendSession = (req: Request, res: Response, session: Session, status = 200) => {
    res.cookie(cookieFor(req), session.refreshToken, { ...cookieOptions, expires: session.refreshExpiresAt });
    res.status(status).json({ data: session.tokens });
  };

  const readRefreshCookie = (req: Request): string | undefined => {
    const value = (req.cookies as Record<string, unknown> | undefined)?.[cookieFor(req)];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  };

  const limit = limiter(config.RATE_LIMIT_SCALE);
  // Generous per-IP limits (many users share one mobile-network IP); tighter per-identifier limits
  const perIp = limit({ windowMinutes: 15, limit: 100 });
  const perIdentifier = limit({
    windowMinutes: 15,
    limit: 10,
    key: req => {
      const b = req.body as Record<string, unknown> | undefined;
      const id = b?.identifier ?? b?.phone ?? b?.email;
      // Fall back to the IP, grouped by /56 for IPv6 so rotating addresses cannot bypass the limit
      return typeof id === 'string' ? `id:${id.trim().toLowerCase()}` : `ip:${ipKeyGenerator(req.ip ?? '')}`;
    },
  });

  router.post('/register', perIp, validate({ body: registerSchema }), async (req, res) => {
    const { user, session } = await service.register(body(res, registerSchema));
    if (session) {
      // Phone verification is switched off: signed in straight away
      res.cookie(cookieFor(req), session.refreshToken, { ...cookieOptions, expires: session.refreshExpiresAt });
      res.status(201).json({ data: { user, verification: null, tokens: session.tokens } });
      return;
    }
    res.status(201).json({ data: { user, verification: { sent_to: user.phone, expires_in_minutes: OTP_TTL_MINUTES }, tokens: null } });
  });

  router.post('/verify/request', perIp, validate({ body: requestVerificationSchema }), async (_req, res) => {
    await service.requestVerification(body(res, requestVerificationSchema).phone);
    res.status(202).json({ data: { message: 'If this number is waiting for verification, a new code has been sent.' } });
  });

  router.post('/verify', perIp, perIdentifier, validate({ body: verifyPhoneSchema }), async (req, res) => {
    const { phone, code } = body(res, verifyPhoneSchema);
    sendSession(req, res, await service.verifyPhone(phone, code));
  });

  router.post('/login', perIp, perIdentifier, validate({ body: loginSchema }), async (req, res) => {
    const { identifier, password } = body(res, loginSchema);
    sendSession(req, res, await service.login(identifier, password));
  });

  // Every page load restores the session through /refresh, so it's limited per session (cookie), not
  // per IP: many people share one carrier-grade NAT address. Without a cookie it's a cheap 401.
  const perSession = limit({
    windowMinutes: 1,
    limit: 60,
    key: req => {
      const token = readRefreshCookie(req);
      return token ? `rt:${createHash('sha256').update(token).digest('base64url').slice(0, 22)}` : `ip:${ipKeyGenerator(req.ip ?? '')}`;
    },
  });

  router.post('/refresh', perSession, async (req, res) => {
    const token = readRefreshCookie(req);
    if (!token) throw new UnauthorizedError('Please sign in again');
    try {
      sendSession(req, res, await service.refresh(token));
    } catch (err) {
      // A dead refresh token should not linger in the browser
      res.clearCookie(cookieFor(req), cookieOptions);
      throw err;
    }
  });

  router.post('/logout', async (req, res) => {
    await service.logout(readRefreshCookie(req));
    res.clearCookie(cookieFor(req), cookieOptions);
    res.status(204).end();
  });

  router.post('/password/forgot', perIp, perIdentifier, validate({ body: forgotPasswordSchema }), async (_req, res) => {
    await service.forgotPassword(body(res, forgotPasswordSchema));
    res.status(202).json({ data: { message: 'If an account matches, we have sent a code or a reset link.' } });
  });

  router.post('/password/reset', perIp, perIdentifier, validate({ body: resetPasswordSchema }), async (req, res) => {
    await service.resetPassword(body(res, resetPasswordSchema));
    res.clearCookie(cookieFor(req), cookieOptions);
    res.json({ data: { message: 'Your password has been changed. Please sign in again.' } });
  });

  router.get('/me', requireAuth, async (req, res) => {
    // requireAuth guarantees req.user
    res.json({ data: await service.me(req.user?.id ?? '') });
  });

  return router;
};
