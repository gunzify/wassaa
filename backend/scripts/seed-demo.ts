// Seed the demo profiles into the configured Postgres database.
// Idempotent: existing phones are skipped. Usage: npm run db:seed
import 'dotenv/config';
import pg from 'pg';
import { DEMO_SEED, seedProfile } from '../src/store/memory';

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error('SUPABASE_DB_URL is not set. Copy backend/.env.example to backend/.env first.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

let inserted = 0;
try {
  for (const seedUser of DEMO_SEED) {
    const p = seedProfile(seedUser);
    const { rowCount } = await client.query(
      `insert into profiles
         (phone, name, birth_date, gender, profession_category, profession_title,
          service, rank, duty_station, city, state, bio, photos, interests,
          dating_goal, tier, verification_status, verified_at, document_type, privacy)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       on conflict (phone) do nothing`,
      [
        p.phone, p.name, p.birthDate, p.gender, p.professionCategory, p.professionTitle,
        p.service ?? null, p.rank ?? null, p.dutyStation ?? null, p.city, p.state, p.bio,
        p.photos, p.interests, p.datingGoal ?? null, p.tier, p.verificationStatus ?? 'not_started',
        p.verifiedAt ?? null, p.documentType ?? null, JSON.stringify(p.privacy)
      ]
    );
    inserted += rowCount ?? 0;
  }
  console.log(`seeded ${inserted} demo profile(s); ${DEMO_SEED.length - inserted} already present`);
} finally {
  await client.end();
}
