import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../env';
import { timingSafeEqual } from './crypto';

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const expected = c.env.ADMIN_TOKEN;
  if (!expected) return c.json({ error: 'admin_not_configured' }, 503);
  const header = c.req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token || !timingSafeEqual(token, expected)) return c.json({ error: 'unauthorized' }, 401);
  await next();
};
