import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import {
  signToken,
  makeSetCookieHeader,
  makeClearCookieHeader,
  checkRateLimit,
  recordFailedAttempt,
  resetAttempts,
} from '@/lib/auth';

// ─── No hardcoded credentials ───
// All accounts (username, password, role) are stored ONLY in MongoDB.
// Manage them directly in MongoDB Compass.

let dbInitialized = false;

async function initDB(db) {
  if (dbInitialized) return;

  // Only initialize game data if empty — accounts are managed separately via DB
  const gameDataCount = await db.collection('game_data').countDocuments();
  if (gameDataCount === 0) {
    const DEFAULT_TEAMS = [];
    const CLUE_COUNT = 7;
    const initialData = {
      type: 'treasure_hunt_data',
      teams: DEFAULT_TEAMS.map((name, i) => ({
        id: i + 1,
        name,
        morning: new Array(CLUE_COUNT).fill(false),
        afternoon: new Array(CLUE_COUNT).fill(false),
      })),
    };
    await db.collection('game_data').insertOne(initialData);
  }
  dbInitialized = true;
}

// ─── POST /api/auth — Login ───
export async function POST(request) {
  try {
    // Rate limiting → fixes vuln #1 (brute-force)
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';

    const rateCheck = checkRateLimit(ip);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          error: `Too many login attempts. Try again in ${rateCheck.retryAfter} seconds.`,
          retryAfter: rateCheck.retryAfter,
        },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password required' },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db();

    // Initialize DB with default credentials if empty
    await initDB(db);

    const user = await db.collection('accounts').findOne({ username });

    if (!user || user.password !== password) {
      recordFailedAttempt(ip);
      // Generic error — don't reveal if username exists
      return NextResponse.json(
        { error: 'Invalid username or password' },
        { status: 401 }
      );
    }

    // Success — reset rate limit counter
    resetAttempts(ip);

    // Create signed JWT with role → fixes vuln #2, #7, #8
    // Role comes from the server DB, not the client.
    const token = signToken({
      username: user.username,
      role: user.role,
    });

    const response = NextResponse.json({
      success: true,
      user: { username: user.username, role: user.role },
    });

    // Set httpOnly cookie → fixes vuln #7 (token not in localStorage)
    response.headers.set('Set-Cookie', makeSetCookieHeader(token));

    return response;
  } catch (e) {
    console.error(e);
    // Don't leak error details in production
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// ─── DELETE /api/auth — Logout ───
export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.headers.set('Set-Cookie', makeClearCookieHeader());
  return response;
}
