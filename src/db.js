// SQLite (node:sqlite, 외부 패키지 없음)
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { DATA_DIR } = require('./env');

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(process.env.DB_PATH || path.join(DATA_DIR, 'golf.db'));
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  login TEXT UNIQUE NOT NULL,
  pw_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  iv_id TEXT, iv_pw_enc TEXT, iv_ok_at TEXT, iv_err TEXT,
  shops_json TEXT, shops_at TEXT,
  default_shop TEXT, default_shop_name TEXT,
  discord_url TEXT,
  kakao_refresh TEXT, kakao_at TEXT,
  fail_count INTEGER DEFAULT 0, locked_until TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, created_at TEXT NOT NULL, kakao_state TEXT
);
CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  target_date TEXT NOT NULL,          -- YYYY-MM-DD
  shop_id TEXT NOT NULL, shop_name TEXT,
  times_json TEXT NOT NULL,           -- ["19:00","19:30","20:00"] 순위대로
  status TEXT NOT NULL DEFAULT '대기', -- 대기 · 성공 · 실패 · 취소
  booked_time TEXT, result_msg TEXT,
  attempts INTEGER DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY, at TEXT NOT NULL, user_id INTEGER, request_id INTEGER, msg TEXT
);
`);

// 나중에 더한 칸 (2026-10-21 타석)
for (const [t, col] of [
  ['users', 'bays_json TEXT'],        // 단골 매장의 타석 이름들 ["1번","2번",...,"5번 우타"]
  ['users', 'pref_bays_json TEXT'],   // 마지막으로 고른 선호 타석 (다음 예약의 기본값)
  ['users', 'any_bay INTEGER DEFAULT 1'],
  ['requests', 'bays_json TEXT'],     // 선호 타석 순서
  ['requests', 'any_bay INTEGER DEFAULT 1'], // 선호 타석이 안 되면 다른 타석도 OK
  ['requests', 'booked_bay TEXT'],
]) {
  try { db.exec(`ALTER TABLE ${t} ADD COLUMN ${col}`); } catch { /* 이미 있음 */ }
}

const now = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 19);
const one = (sql, ...a) => db.prepare(sql).get(...a);
const all = (sql, ...a) => db.prepare(sql).all(...a);
const run = (sql, ...a) => db.prepare(sql).run(...a);

function log(userId, requestId, msg) {
  run('INSERT INTO logs(at,user_id,request_id,msg) VALUES(?,?,?,?)', now(), userId ?? null, requestId ?? null, String(msg).slice(0, 2000));
}

module.exports = { db, now, one, all, run, log };
