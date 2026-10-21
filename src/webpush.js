// 웹 푸시 («이 기기에서 알림 받기») + 알림함 — 경매알리미 · 골프예약 · 가게쇼츠가 같은 파일을 쓴다.
// 고칠 때는 세 곳을 똑같이 맞출 것.
//  · 보내기: RFC 8291(aes128gcm 암호화) + RFC 8292(VAPID 서명). 외부 패키지 없이 node:crypto 만 쓴다.
//  · 받는 쪽(브라우저) 주소는 push_subs, 보낸 알림은 notices 표에 둔다 (사이트의 SQLite 에 같이 만든다).
//  · 사이트는 사람을 user_key(문자열) 로만 구분한다. 무엇을 키로 쓸지는 사이트가 정한다.
'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const unb64u = (s) => Buffer.from(String(s || ''), 'base64url');

// ── VAPID 열쇠 ── .env 의 VAPID_PUBLIC / VAPID_PRIVATE 가 있으면 그것, 없으면 dataDir/vapid.json 을 처음 한 번 만든다.
// 열쇠를 바꾸면 이미 켠 기기는 모두 다시 켜야 하므로 vapid.json 을 지우지 말 것.
function loadKeys(dataDir, env = process.env) {
  if (env.VAPID_PUBLIC && env.VAPID_PRIVATE) return { publicKey: env.VAPID_PUBLIC, privateKey: env.VAPID_PRIVATE };
  const f = path.join(dataDir, 'vapid.json');
  try { const k = JSON.parse(fs.readFileSync(f, 'utf8')); if (k.publicKey && k.privateKey) return k; } catch { /* 처음 */ }
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const keys = { publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(pad32(ecdh.getPrivateKey())) };
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(f, JSON.stringify(keys), { mode: 0o600 });
  return keys;
}
function pad32(b) { return b.length >= 32 ? b : Buffer.concat([Buffer.alloc(32 - b.length), b]); }

function signingKey(keys) {
  const pub = unb64u(keys.publicKey);
  return crypto.createPrivateKey({ format: 'jwk', key: {
    kty: 'EC', crv: 'P-256', d: b64u(pad32(unb64u(keys.privateKey))), x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)),
  } });
}

// Authorization 헤더 — 푸시 서비스(구글·애플·MS·모질라)가 «이 사이트가 보낸 것» 임을 확인한다
function vapidAuth(endpoint, keys, subject, key = signingKey(keys)) {
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64u(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }));
  const sig = crypto.sign('sha256', Buffer.from(head + '.' + body), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${keys.publicKey}`;
}

// 받는 기기만 풀 수 있게 내용을 암호화한다 (RFC 8291, 레코드 하나)
function encrypt(p256dh, auth, payload) {
  const uaPub = unb64u(p256dh);
  const secret = unb64u(auth);
  if (uaPub.length !== 65 || secret.length < 16) throw new Error('구독 열쇠 모양이 이상합니다');
  const ecdh = crypto.createECDH('prime256v1');
  const asPub = ecdh.generateKeys();
  const shared = ecdh.computeSecret(uaPub);
  const salt = crypto.randomBytes(16);
  const hmac = (k, d) => crypto.createHmac('sha256', k).update(d).digest();
  const ikm = hmac(hmac(secret, shared), Buffer.concat([Buffer.from('WebPush: info\0'), uaPub, asPub, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01', 'binary')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01', 'binary')).subarray(0, 12);
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const ct = Buffer.concat([c.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const head = Buffer.alloc(21);
  salt.copy(head, 0);
  head.writeUInt32BE(4096, 16);
  head[20] = asPub.length;
  return Buffer.concat([head, asPub, ct]);
}

// 한 기기로 보낸다. gone=true 면 그 기기는 알림을 끄거나 앱을 지운 것이니 주소를 지운다.
async function sendOne(sub, data, keys, subject, key) {
  const body = encrypt(sub.p256dh, sub.auth, JSON.stringify(data));
  try {
    const r = await fetch(sub.endpoint, {
      method: 'POST',
      headers: { Authorization: vapidAuth(sub.endpoint, keys, subject, key), TTL: '86400', Urgency: 'high',
        'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream' },
      body, signal: AbortSignal.timeout(10000),
    });
    const why = r.status < 300 ? '' : `${r.status} ${(await r.text().catch(() => '')).slice(0, 200)}`;
    return { ok: r.status < 300, status: r.status, gone: r.status === 404 || r.status === 410, why };
  } catch (e) { return { ok: false, status: 0, gone: false, why: e.message }; }
}

// ── 사이트에 붙이는 묶음 ──
// db: node:sqlite DatabaseSync · dataDir: 열쇠를 둘 폴더 · subject: 'https://사이트주소' (푸시 서비스가 연락할 곳)
// defaults: { title, icon, url } 알림의 기본값 · keep: 사람마다 알림함에 남길 개수
function createHub({ db, dataDir, subject, defaults = {}, keep = 100, env = process.env }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY, user_key TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
      device_key TEXT NOT NULL, ua TEXT, created_at TEXT NOT NULL, last_ok_at TEXT, last_error TEXT);
    CREATE INDEX IF NOT EXISTS ix_push_subs_user ON push_subs (user_key);
    CREATE TABLE IF NOT EXISTS notices (id INTEGER PRIMARY KEY, user_key TEXT NOT NULL, title TEXT, body TEXT NOT NULL, url TEXT,
      created_at TEXT NOT NULL, read_at TEXT);
    CREATE INDEX IF NOT EXISTS ix_notices_user ON notices (user_key, id);
  `);
  const keys = loadKeys(dataDir, env);
  const key = signingKey(keys);
  const nowIso = () => new Date().toISOString();
  const q = (sql) => db.prepare(sql);

  function subscribe(userKey, sub, ua = '') {
    const s = sub && sub.keys ? { endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth } : sub || {};
    if (!/^https:\/\/[^\s]{10,1000}$/.test(String(s.endpoint || '')) || !s.p256dh || !s.auth) throw new Error('구독 정보가 올바르지 않습니다');
    if (unb64u(s.p256dh).length !== 65) throw new Error('구독 열쇠가 올바르지 않습니다');
    const old = q('SELECT device_key FROM push_subs WHERE endpoint = ?').get(s.endpoint);
    const deviceKey = old ? old.device_key : crypto.randomBytes(18).toString('base64url');
    q(`INSERT INTO push_subs (endpoint, user_key, p256dh, auth, device_key, ua, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET user_key = excluded.user_key, p256dh = excluded.p256dh, auth = excluded.auth, ua = excluded.ua`)
      .run(s.endpoint, String(userKey), s.p256dh, s.auth, deviceKey, String(ua || '').slice(0, 300), nowIso());
    return { deviceKey };
  }
  const unsubscribe = (userKey, endpoint) => q('DELETE FROM push_subs WHERE user_key = ? AND endpoint = ?').run(String(userKey), String(endpoint || ''));
  const devices = (userKey) => q('SELECT COUNT(*) AS n FROM push_subs WHERE user_key = ?').get(String(userKey)).n;
  // 기기 열쇠로 사람 찾기 (알림을 눌러 열린 화면처럼 로그인 정보가 없을 때)
  const userByDevice = (deviceKey) => (q('SELECT user_key FROM push_subs WHERE device_key = ?').get(String(deviceKey || '')) || {}).user_key || null;

  // 알림함에 남기고, 켜 둔 기기 모두로 보낸다. 실패해도 예외를 던지지 않는다.
  async function notify(userKey, msg, { store = true } = {}) {
    const uk = String(userKey);
    const title = String(msg.title || defaults.title || '알림').slice(0, 80);
    const body = String(msg.body || '').slice(0, 1500);
    let id = null;
    if (store) {
      id = Number(q('INSERT INTO notices (user_key, title, body, url, created_at) VALUES (?, ?, ?, ?, ?)').run(uk, title, body, msg.url || null, nowIso()).lastInsertRowid);
      q('DELETE FROM notices WHERE user_key = ? AND id NOT IN (SELECT id FROM notices WHERE user_key = ? ORDER BY id DESC LIMIT ?)').run(uk, uk, keep);
    }
    const subs = q('SELECT * FROM push_subs WHERE user_key = ?').all(uk);
    const out = { devices: subs.length, ok: 0, gone: 0, errors: [] };
    await Promise.all(subs.map(async (s) => {
      const url = typeof msg.url === 'function' ? msg.url(s) : (msg.url || defaults.url || '/');
      const data = { title, body: body.slice(0, 600), url, tag: msg.tag || 'notice-' + (id || Date.now()), icon: msg.icon || defaults.icon, badge: msg.badge || defaults.badge };
      const r = await sendOne(s, data, keys, subject, key);
      if (r.ok) { out.ok++; q('UPDATE push_subs SET last_ok_at = ?, last_error = NULL WHERE endpoint = ?').run(nowIso(), s.endpoint); }
      else if (r.gone) { out.gone++; q('DELETE FROM push_subs WHERE endpoint = ?').run(s.endpoint); }
      else { out.errors.push(r.why); q('UPDATE push_subs SET last_error = ? WHERE endpoint = ?').run(r.why.slice(0, 300), s.endpoint); }
    }));
    return out;
  }

  const list = (userKey, limit = 50) => q('SELECT id, title, body, url, created_at, read_at FROM notices WHERE user_key = ? ORDER BY id DESC LIMIT ?').all(String(userKey), limit);
  const unread = (userKey) => q('SELECT COUNT(*) AS n FROM notices WHERE user_key = ? AND read_at IS NULL').get(String(userKey)).n;
  const readAll = (userKey) => q('UPDATE notices SET read_at = ? WHERE user_key = ? AND read_at IS NULL').run(nowIso(), String(userKey));
  const forget = (userKey) => { q('DELETE FROM push_subs WHERE user_key = ?').run(String(userKey)); q('DELETE FROM notices WHERE user_key = ?').run(String(userKey)); };
  const rename = (from, to) => { q('UPDATE push_subs SET user_key = ? WHERE user_key = ?').run(String(to), String(from)); q('UPDATE notices SET user_key = ? WHERE user_key = ?').run(String(to), String(from)); };

  const TEST_BODY = '테스트 알림입니다. 이 알림이 보이면 폰 알림이 정상입니다.';

  // 화면(push-client.js)이 부르는 동작들. 사이트 라우터는 «로그인한 사람의 user_key» 만 알아내서 넘긴다.
  //   action: key | subscribe | unsubscribe | test | notices | read-all
  // 돌려주는 값: { status, json }
  async function api(action, userKey, body = {}, ua = '') {
    if (action === 'key') return { status: 200, json: { publicKey: keys.publicKey } };
    if (userKey == null || userKey === '') return { status: 401, json: { ok: false, error: '로그인이 필요합니다.' } };
    try {
      if (action === 'subscribe') { const r = subscribe(userKey, body.subscription || body, ua); return { status: 200, json: { ok: true, devices: devices(userKey), deviceKey: r.deviceKey } }; }
      if (action === 'unsubscribe') { unsubscribe(userKey, body.endpoint); return { status: 200, json: { ok: true, devices: devices(userKey) } }; }
      if (action === 'test') { const r = await notify(userKey, { body: TEST_BODY, tag: 'test' }); return { status: 200, json: { ok: r.ok, devices: r.devices, errors: r.errors } }; }
      if (action === 'notices') return { status: 200, json: { ok: true, unread: unread(userKey), devices: devices(userKey), items: list(userKey) } };
      if (action === 'read-all') { readAll(userKey); return { status: 200, json: { ok: true } }; }
    } catch (e) { return { status: 400, json: { ok: false, error: e.message } }; }
    return { status: 404, json: { ok: false, error: '없는 동작입니다.' } };
  }

  return { keys, subscribe, unsubscribe, devices, userByDevice, notify, list, unread, readAll, forget, rename, api, TEST_BODY };
}

module.exports = { createHub, loadKeys, encrypt, vapidAuth, sendOne, b64u, unb64u };
