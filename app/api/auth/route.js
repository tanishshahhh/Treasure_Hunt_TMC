import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import fs from 'fs';
import path from 'path';

let dbInitialized = false;

async function initDB(db) {
  if (dbInitialized) return;
  const accountsCount = await db.collection('accounts').countDocuments();
  if (accountsCount === 0) {
    const credsPath = path.join(process.cwd(), 'credentials.json');
    if (fs.existsSync(credsPath)) {
      const raw = fs.readFileSync(credsPath, 'utf8');
      const data = JSON.parse(raw);
      if (data.accounts && data.accounts.length > 0) {
        await db.collection('accounts').insertMany(data.accounts);
      }
    }
  }
  
  const gameDataCount = await db.collection('game_data').countDocuments();
  if (gameDataCount === 0) {
    const DEFAULT_TEAMS = [
      'Team Mavericks', 'Team Titans', 'Team Phoenix', 'Team Spartans',
      'Team Renegades', 'Team Vanguard', 'Team Inferno', 'Team Nexus'
    ];
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
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
