import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';

const DEFAULT_ACCOUNTS = [
  {
    role: 'admin',
    username: 'admin',
    password: 'TMC@admin2026',
    permissions: 'Full access: view all, edit scores, manage teams, both sessions',
  },
  {
    role: 'volunteer',
    username: 'volunteer',
    password: 'TMC@vol2026',
    permissions: 'Can mark/unmark clue progress only. Cannot edit team names.',
  },
  {
    role: 'user',
    username: 'user',
    password: 'TMC@user2026',
    permissions: 'View-only: scoreboard and progress bar. No editing.',
  },
];

let dbInitialized = false;

async function initDB(db) {
  if (dbInitialized) return;
  const accountsCount = await db.collection('accounts').countDocuments();
  if (accountsCount === 0) {
    await db.collection('accounts').insertMany(DEFAULT_ACCOUNTS);
  }
  
  const gameDataCount = await db.collection('game_data').countDocuments();
  if (gameDataCount === 0) {
    const DEFAULT_TEAMS = [];
    const CLUE_COUNT = 7;
    const initialData = { 
      type: 'treasure_hunt_data',
      teams: DEFAULT_TEAMS.map((name, i) => ({
        id: i + 1, name,
        morning: new Array(CLUE_COUNT).fill(false),
        afternoon: new Array(CLUE_COUNT).fill(false),
      }))
    };
    await db.collection('game_data').insertOne(initialData);
  }
  dbInitialized = true;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { username, password } = body;
    
    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password required' }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db();
    
    // Initialize DB with default credentials if empty
    await initDB(db);

    const user = await db.collection('accounts').findOne({ username });
    
    if (!user || user.password !== password) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
    }

    return NextResponse.json({ 
      success: true, 
      user: { username: user.username, role: user.role } 
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal Server Error', details: e.message }, { status: 500 });
  }
}
