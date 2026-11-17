import crypto from 'node:crypto';
import type { Request } from 'express';
import type { PortalSessionPayload } from './types';

export const PORTAL_SESSION_COOKIE = 'marhaba_mgmt_session';
export const PORTAL_SESSION_SECRET =
  process.env.MGMT_SESSION_SECRET || 'marhaba-mwi-demo-hmac-secret-2026-not-for-prod';

export const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

// Simple in-memory sliding-window login rate limiter per IP/identifier
const loginAttemptMap = new Map<string, { count: number; resetAt: number }>();

export function checkLoginRateLimit(key: string, maxAttempts = 25, windowMs = 60_000): boolean {
  const now = Date.now();
  const entry = loginAttemptMap.get(key);
  if (!entry || now > entry.resetAt) {
    loginAttemptMap.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxAttempts) {
    return false;
  }
  entry.count += 1;
  return true;
}

export function resetLoginRateLimit(key: string) {
  loginAttemptMap.delete(key);
}

export function hashPasswordPbkdf2(password: string, salt?: string): string {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.pbkdf2Sync(password, actualSalt, 12000, 32, 'sha256').toString('hex');
  return `pbkdf2:${actualSalt}:${derived}`;
}

export function verifyPasswordSecret(input: string, storedSecret: string): boolean {
  if (storedSecret.startsWith('pbkdf2:')) {
    const [, salt, hash] = storedSecret.split(':');
    if (!salt || !hash) return false;
    const candidate = crypto.pbkdf2Sync(input, salt, 12000, 32, 'sha256').toString('hex');
    const a = Buffer.from(candidate, 'utf8');
    const b = Buffer.from(hash, 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  const a = Buffer.from(input, 'utf8');
  const b = Buffer.from(storedSecret, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function signPortalToken(payload: PortalSessionPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', PORTAL_SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifyPortalToken(token: string): PortalSessionPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [encoded, sig] = parts;
    const expected = crypto.createHmac('sha256', PORTAL_SESSION_SECRET).update(encoded).digest('base64url');
    const a = Buffer.from(sig, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as PortalSessionPayload;
    if (!parsed.uid || !parsed.exp || Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function parsePortalCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      out[k] = decodeURIComponent(v);
    }
  }
  return out;
}

export function extractBearerOrCookieToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookies = parsePortalCookies(req.headers.cookie);
  return cookies[PORTAL_SESSION_COOKIE] || null;
}
