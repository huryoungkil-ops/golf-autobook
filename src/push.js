// 기기 알림(웹 푸시) + 알림함 — 공통 모듈 webpush.js 를 이 사이트에 붙인다. 사람 구분은 users.id.
// 열쇠는 data/vapid.json (처음 한 번 생김). 지우면 이미 켠 기기가 모두 다시 켜야 하니 지우지 말 것.
const { db } = require('./db');
const { DATA_DIR, PUBLIC_BASE } = require('./env');
const { createHub } = require('./webpush');

let hub = null;
module.exports = () => hub || (hub = createHub({
  db, dataDir: DATA_DIR, subject: PUBLIC_BASE.startsWith('https://') ? PUBLIC_BASE : 'https://impactvision.mooo.com',
  defaults: { title: '임팩트비전 자동예약', icon: '/icon-192.png', badge: '/icon-192.png', url: '/notices' },
}));
