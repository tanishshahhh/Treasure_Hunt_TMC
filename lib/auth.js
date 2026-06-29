import jwt from 'jsonwebtoken';

// ─── JWT Secret ───
// Must be set via environment variable in production (Vercel project settings).
// Falls back to a random string in dev so the app doesn't crash on first run.
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me-in-production-' + Math.random();

const TOKEN_EXPIRY = '8h'; // sessions last 8 hours (one event day)

// ─── JWT Token Management ───
export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

// ─── Cookie Helpers ───
const COOKIE_NAME = 'tmc_session';

export function getSessionCookie(request) {
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  return match ? match[1] : null;
}

export function makeSetCookieHeader(token) {
  const isProduction = process.env.NODE_ENV === 'production';
  const parts = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',            // Not accessible from JS → fixes vuln #7
    'SameSite=Strict',     // CSRF protection
    `Max-Age=${8 * 60 * 60}`, // 8 hours
  ];
  if (isProduction) parts.push('Secure'); // HTTPS only in prod
  return parts.join('; ');
}

export function makeClearCookieHeader() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}

// ─── Server-Side Auth Middleware ───
// Call this in any API route to enforce authentication and optionally a required role.
// Returns { user } on success, or a NextResponse error you can return immediately.
import { NextResponse } from 'next/server';

export function requireAuth(request, { roles } = {}) {
  const token = getSessionCookie(request);
  if (!token) {
    return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  }

  const user = verifyToken(token);
  if (!user) {
    return { error: NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 }) };
  }

  // Role enforcement → fixes vuln #2, #3, #8
  if (roles && !roles.includes(user.role)) {
    return { error: NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 }) };
  }

  return { user };
}

// ─── Rate Limiting (in-memory) ───
// Tracks failed login attempts per IP. Resets after WINDOW_MS.
// Fixes vuln #1 — brute-force / credential stuffing.
const LOGIN_ATTEMPTS = new Map(); // key: IP → { count, firstAttempt }
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15-minute lockout window

export function checkRateLimit(ip) {
  const now = Date.now();
  const record = LOGIN_ATTEMPTS.get(ip);

  if (!record) return { allowed: true, remaining: MAX_ATTEMPTS };

  // Reset if window has expired
  if (now - record.firstAttempt > WINDOW_MS) {
    LOGIN_ATTEMPTS.delete(ip);
    return { allowed: true, remaining: MAX_ATTEMPTS };
  }

  if (record.count >= MAX_ATTEMPTS) {
    const retryAfter = Math.ceil((WINDOW_MS - (now - record.firstAttempt)) / 1000);
    return { allowed: false, remaining: 0, retryAfter };
  }

  return { allowed: true, remaining: MAX_ATTEMPTS - record.count };
}

export function recordFailedAttempt(ip) {
  const now = Date.now();
  const record = LOGIN_ATTEMPTS.get(ip);

  if (!record || now - record.firstAttempt > WINDOW_MS) {
    LOGIN_ATTEMPTS.set(ip, { count: 1, firstAttempt: now });
  } else {
    record.count += 1;
  }
}

export function resetAttempts(ip) {
  LOGIN_ATTEMPTS.delete(ip);
}
