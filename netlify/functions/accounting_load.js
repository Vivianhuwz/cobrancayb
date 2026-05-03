const { Pool } = require('pg');

const STORAGE_KEY = 'yunshouzhang_accountRecords';
const TABLE_NAME = 'cloud_kv';

let pool;

function getPool() {
  if (pool) return pool;
  const connectionString = process.env.NEON_DATABASE_URL;
  if (!connectionString) {
    throw Object.assign(new Error('缺少 NEON_DATABASE_URL 环境变量'), { code: 'MISSING_NEON_DATABASE_URL' });
  }
  pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  return pool;
}

async function ensureTable(client) {
  await client.query(
    `CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
      key TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );
}

function getHeader(event, name) {
  const headers = event && event.headers ? event.headers : {};
  const direct = headers[name];
  if (direct) return direct;
  const lower = headers[name.toLowerCase()];
  if (lower) return lower;
  return '';
}

function verifyToken(event) {
  const expected = process.env.SYNC_TOKEN;
  if (!expected) return;
  const provided = getHeader(event, 'x-sync-token');
  if (!provided || provided !== expected) {
    throw Object.assign(new Error('未授权：sync token 不正确'), { code: 'UNAUTHORIZED' });
  }
}

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify(payload)
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'content-type,x-sync-token',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'GET') {
    return json(405, { ok: false, error: 'METHOD_NOT_ALLOWED', message: '仅支持 GET' });
  }

  try {
    verifyToken(event);

    const p = getPool();
    const client = await p.connect();
    try {
      await ensureTable(client);
      const result = await client.query(
        `SELECT data, updated_at FROM ${TABLE_NAME} WHERE key = $1 LIMIT 1`,
        [STORAGE_KEY]
      );
      if (!result.rows || result.rows.length === 0) {
        return json(200, { ok: true, data: null, updatedAt: null });
      }
      return json(200, { ok: true, data: result.rows[0].data, updatedAt: result.rows[0].updated_at });
    } finally {
      client.release();
    }
  } catch (error) {
    const code = error && error.code ? error.code : 'SERVER_ERROR';
    const message = error && error.message ? error.message : '服务器错误';
    const statusCode = code === 'UNAUTHORIZED' ? 401 : 500;
    return json(statusCode, { ok: false, error: code, message });
  }
};
