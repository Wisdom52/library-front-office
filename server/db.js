const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL || 'postgres://library_user:library_secret_pw@localhost:5434/library_front_office';

const pool = new Pool({
  connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[PostgreSQL] Unexpected error on idle client:', err.message);
});

async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV !== 'production') {
    // console.log(`[SQL Query] (${duration}ms) ${text.slice(0, 60)}...`);
  }
  return res;
}

async function testConnection(retries = 10, delayMs = 2000) {
  for (let i = 1; i <= retries; i++) {
    try {
      const res = await pool.query('SELECT NOW() as current_time, current_database() as db_name');
      console.log(`[PostgreSQL] Connected to "${res.rows[0].db_name}" successfully at ${res.rows[0].current_time}`);
      return true;
    } catch (err) {
      console.warn(`[PostgreSQL] Connection attempt ${i}/${retries} failed: ${err.message}`);
      if (i < retries) {
        await new Promise((r) => setTimeout(r, delayMs));
      } else {
        console.error('[PostgreSQL] Exhausted all connection attempts.');
        return false;
      }
    }
  }
  return false;
}

module.exports = {
  pool,
  query,
  testConnection,
};
