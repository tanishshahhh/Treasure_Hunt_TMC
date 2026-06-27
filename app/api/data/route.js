import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import fs from 'fs';
import path from 'path';

let dbInitialized = false;

async function initDB(db) {
  if (dbInitialized) return;
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

export async function GET() {
  try {
    const client = await clientPromise;
    const db = client.db();
    
    await initDB(db);

    const data = await db.collection('game_data').findOne({ type: 'treasure_hunt_data' });
    
    return NextResponse.json(data);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const [username, password] = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');

    const client = await clientPromise;
    const db = client.db();
    
    await initDB(db);

    const user = await db.collection('accounts').findOne({ username });
    if (!user || user.password !== password) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    // Ensure we are updating the existing document
    await db.collection('game_data').updateOne(
      { type: 'treasure_hunt_data' },
      { $set: { teams: body.teams } }
    );
    
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
