// 기기 알림(웹 푸시)·알림함 경로 점검 — 임시 폴더의 새 DB 로 실제 서버를 띄워 본다
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'golf-push-'));
Object.assign(process.env, { DATA_DIR: dir, DB_PATH: path.join(dir, 'golf.db'), OWNER_WEBHOOK: '', FEED_WEBHOOK: '', PUBLIC_BASE: 'http://localhost' });
const { server } = require('../src/web');
const notify = require('../src/notify');
const { one } = require('../src/db');

let base;
test.before(() => new Promise((r) => server.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; r(); })));
test.after(() => server.close());

const post = (p, body, cookie) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body || {}) })
  .then(async (r) => ({ status: r.status, json: await r.json() }));
const fakeSub = () => {
  const e = crypto.createECDH('prime256v1'); e.generateKeys();
  return { endpoint: 'https://push.invalid/send/' + crypto.randomBytes(8).toString('hex'), keys: { p256dh: e.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') } };
};

async function signup(login) {
  const r = await fetch(base + '/login', { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ login, pw: 'pass1234' }) });
  return r.headers.get('set-cookie').split(';')[0];
}

test('기기 알림용 파일과 앱 정보', async () => {
  const sw = await fetch(base + '/sw.js');
  assert.equal(sw.status, 200);
  assert.match(sw.headers.get('content-type'), /javascript/);
  assert.equal(sw.headers.get('service-worker-allowed'), '/');
  assert.match(await sw.text(), /showNotification/);
  assert.match(await (await fetch(base + '/push-client.js')).text(), /PushBox/);
  const m = await (await fetch(base + '/manifest.webmanifest')).json();
  assert.equal(m.display, 'standalone');
  assert.equal(m.icons.length, 2);
  const ic = await fetch(base + '/icon-192.png');
  assert.equal(ic.headers.get('content-type'), 'image/png');
});

test('열쇠는 로그인 없이, 등록은 로그인해야', async () => {
  const k = await post('/push/key');
  assert.equal(k.status, 200);
  assert.equal(Buffer.from(k.json.publicKey, 'base64url').length, 65);
  assert.equal((await post('/push/subscribe', { subscription: fakeSub() })).status, 401);
  assert.equal((await post('/push/notices')).status, 401);
  // JSON 이 아니면 받지 않는다
  const f = await fetch(base + '/push/key', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' });
  assert.equal(f.status, 415);
});

test('등록 → 알림이 알림함에 남고 기기 알림 결과가 붙는다 → 모두 읽음', async () => {
  const cookie = await signup('pushtester');
  const user = one('SELECT * FROM users WHERE login=?', 'pushtester');
  // 기기가 없으면 결과 목록에 «이 기기 알림» 이 없지만 알림함에는 남는다
  let out = await notify.toUser(user, '⛳ 예약 성공 시험');
  assert.deepEqual(out, []);
  const s = await post('/push/subscribe', { subscription: fakeSub() }, cookie);
  assert.equal(s.json.ok, true);
  assert.equal(s.json.devices, 1);
  out = await notify.toUser(user, '😢 예약 실패 시험');
  assert.equal(out.length, 1);
  assert.equal(out[0][0], '이 기기 알림');
  assert.equal(out[0][1].ok, false); // 가짜 주소라 못 보냄
  const n = await post('/push/notices', {}, cookie);
  assert.equal(n.json.unread, 2);
  assert.deepEqual(n.json.items.map((i) => i.body), ['😢 예약 실패 시험', '⛳ 예약 성공 시험']);
  assert.equal(n.json.items[0].title, '임팩트비전 자동예약');
  await post('/push/read-all', {}, cookie);
  assert.equal((await post('/push/notices', {}, cookie)).json.unread, 0);
  const page = await fetch(base + '/notices', { headers: { Cookie: cookie } });
  assert.match(await page.text(), /PushBox\.inbox/);
  const app = await (await fetch(base + '/app', { headers: { Cookie: cookie } })).text();
  assert.match(app, /id="push-box"/);
  assert.match(app, /href="\/notices"/);
  assert.match(app, /rel="manifest"/);
});

test('알림함 페이지는 로그인해야', async () => {
  const r = await fetch(base + '/notices', { redirect: 'manual' });
  assert.equal(r.status, 303);
  assert.equal(r.headers.get('location'), '/login');
});
