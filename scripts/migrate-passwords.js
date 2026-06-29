/**
 * One-time migration script: re-hash existing plaintext passwords in MongoDB.
 * 
 * Run this ONCE after deploying the security update:
 *   node scripts/migrate-passwords.js
 * 
 * This script:
 * 1. Connects to your MongoDB
 * 2. Checks if passwords are already hashed (bcrypt hashes start with "$2")
 * 3. If not, hashes them with bcrypt and updates the documents
 * 4. Exits
 * 
 * IMPORTANT: Requires MONGODB_URI in .env.local
 */

const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');
const path = require('path');

// Load .env.local
const fs = require('fs');
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let val = match[2].trim();
      // Remove surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  });
}

async function migrate() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ MONGODB_URI not set. Add it to .env.local');
    process.exit(1);
  }

  const client = new MongoClient(uri);
  await client.connect();
  console.log('✅ Connected to MongoDB');

  const db = client.db();
  const accounts = db.collection('accounts');
  const allAccounts = await accounts.find({}).toArray();

  if (allAccounts.length === 0) {
    console.log('ℹ️  No accounts found. They will be created with hashed passwords on first login.');
    await client.close();
    return;
  }

  let migrated = 0;
  for (const acc of allAccounts) {
    // Check if already hashed (bcrypt hashes start with $2a$ or $2b$)
    if (acc.password && acc.password.startsWith('$2')) {
      console.log(`  ⏭️  ${acc.username} — already hashed, skipping`);
      continue;
    }

    console.log(`  🔄 ${acc.username} — hashing plaintext password...`);
    const hashed = await bcrypt.hash(acc.password, 12);
    await accounts.updateOne(
      { _id: acc._id },
      { $set: { password: hashed } }
    );
    migrated++;
    console.log(`  ✅ ${acc.username} — done`);
  }

  console.log(`\n🎉 Migration complete. ${migrated} password(s) hashed.`);
  await client.close();
}

migrate().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
