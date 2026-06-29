import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { requireAuth } from '@/lib/auth';

let dbInitialized = false;

async function initDB(db) {
  if (dbInitialized) return;
  const gameDataCount = await db.collection('game_data').countDocuments();
  if (gameDataCount === 0) {
    const DEFAULT_TEAMS = []; // Start empty, add teams via Admin dashboard
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

// ─── Input Validation ───
const CLUE_COUNT = 7;
const MAX_TEAMS = 50;
const MAX_TEAM_NAME_LENGTH = 100;

function validateTeamsPayload(teams) {
  if (!Array.isArray(teams)) return 'teams must be an array';
  if (teams.length > MAX_TEAMS) return `Maximum ${MAX_TEAMS} teams allowed`;

  for (const team of teams) {
    if (typeof team.id !== 'number' || team.id < 1) return 'Invalid team ID';
    if (typeof team.name !== 'string' || team.name.length === 0 || team.name.length > MAX_TEAM_NAME_LENGTH) {
      return `Team name must be 1-${MAX_TEAM_NAME_LENGTH} characters`;
    }
    // Sanitize — strip HTML to prevent XSS via team names
    if (/<[^>]*>/.test(team.name)) return 'Team names cannot contain HTML';

    for (const session of ['morning', 'afternoon']) {
      if (!Array.isArray(team[session])) return `${session} must be an array`;
      if (team[session].length !== CLUE_COUNT) return `${session} must have exactly ${CLUE_COUNT} entries`;
      if (!team[session].every((v) => typeof v === 'boolean')) return `${session} values must be booleans`;
    }
  }
  return null; // valid
}

// ─── GET /api/data — Read game state ───
// Requires authentication (any role) → fixes vuln #3 (unprotected API)
export async function GET(request) {
  try {
    const auth = requireAuth(request);
    if (auth.error) return auth.error;

    const client = await clientPromise;
    const db = client.db();

    await initDB(db);

    const data = await db
      .collection('game_data')
      .findOne({ type: 'treasure_hunt_data' });

    // Strip MongoDB internal _id before sending
    if (data && data._id) {
      delete data._id;
    }

    return NextResponse.json(data);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// ─── POST /api/data — Write game state ───
// Only admin and volunteer can mutate data → fixes vuln #4 (score tampering)
export async function POST(request) {
  try {
    // Server-side role check → fixes vuln #2, #3, #8
    const auth = requireAuth(request, { roles: ['admin', 'volunteer'] });
    if (auth.error) return auth.error;

    const body = await request.json();

    // Validate the incoming payload → prevents arbitrary data injection
    const validationError = validateTeamsPayload(body.teams);
    if (validationError) {
      return NextResponse.json(
        { error: validationError },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db();

    await initDB(db);

    // Ensure we are updating the existing document
    await db.collection('game_data').updateOne(
      { type: 'treasure_hunt_data' },
      { $set: { teams: body.teams } }
    );

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
