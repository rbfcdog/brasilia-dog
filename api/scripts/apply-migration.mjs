// Apply a SQL migration file directly to the remote Supabase Postgres
// using the Supabase pooler URL (IPv4-compatible). This avoids the Supabase CLI
// and psql, using only Node.js libraries.
//
// Usage: node --env-file=.env scripts/apply-migration.mjs <path-to-sql>
//
// Does not log any secret values.

import { setDefaultResultOrder } from 'node:dns';
setDefaultResultOrder('ipv4first');

import { readFileSync } from 'node:fs';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('Missing DATABASE_URL. Check .env.');
  process.exit(1);
}

// Rewrite the connection string to use the IPv4-compatible pooler hostname.
// The direct DB host (db.<ref>.supabase.co) is IPv6-only in many environments.
// The pooler (aws-0-<region>.pooler.supabase.com) supports IPv4.
const originalUrl = new URL(databaseUrl);
// hostname format: db.<project-ref>.supabase.co
const projectRef = originalUrl.hostname.split('.')[1];
const poolerHost = 'aws-0-us-east-1.pooler.supabase.com';
const poolerUrl = `postgresql://postgres.${projectRef}:${originalUrl.password}@${poolerHost}:6543/postgres`;

const migrationPath = process.argv[2];

if (!migrationPath) {
  console.error('Usage: node scripts/apply-migration.mjs <path-to-sql>');
  process.exit(1);
}

const sql = readFileSync(migrationPath, 'utf8');

const pool = new Pool({
  connectionString: poolerUrl,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

try {
  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log(`Applied: ${migrationPath}`);
  } finally {
    client.release();
  }
} catch (err) {
  console.error(`Failed to apply ${migrationPath}:`, err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
