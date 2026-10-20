// 웹 서버 (node:http, 외부 패키지 없음). 127.0.0.1:5720 — 바깥 HTTPS 는 Caddy 가 받아 넘긴다.
const http = require('node:http');
const { PORT, HOST, MAX_USERS, KAKAO_REST_KEY, PUBLIC_BASE } = require('./env');
const { one, all, run, now, log } = require('./db');
const { hashPw, checkPw, encrypt, token } = require('./secure');
const pages = require('./pages');
const notify = require('./notify');
const { ImpactSession, hhmm } = require('./impact');
const { loginUser, attempt, dayLabel, kstToday } = require('./booker');

const COOKIE = 'gab';
const SESSION_DAYS = 60;
const DAYS_AHEAD = 14;
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

// 고를 수 있는 날짜: 내일부터 2주, 월요일(휴무) 빼고
function dateChoices() {
  const out = [];
  for (let i = 1; i <= DAYS_AHEAD; i++) {
    const date = kstToday(i);
    const w = new Date(date + 'T00:00:00Z').getUTCDay();
    if (w === 1) continue;
    out.push({ date, dow: DOW[w], md: `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`, weekend: w === 0 || w === 6 });
  }
  return out;
}

// ── 도우미 ──
function parseCookies(req) {
  const out = {};
  for (const p of String(req.headers.cookie || '').split(';')) {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  }
  return out;
}
async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const c of req) { size += c.length; if (size > 64 * 1024) throw new Error('too big'); chunks.push(c); }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}
function send(res, status, html, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin', ...headers });
  res.end(html);
}
const redirect = (res, to, headers = {}) => { res.writeHead(303, { Location: to, 'Cache-Control': 'no-store', ...headers }); res.end(); };
const back = (res, msg, err = false) => redirect(res, `/app?${err ? 'e' : 'm'}=${encodeURIComponent(msg)}`);
const secure = PUBLIC_BASE.startsWith('https');
const setSession = (tok) => `${COOKIE}=${tok}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure ? '; Secure' : ''}`;

function currentUser(req) {
  const tok = parseCookies(req)[COOKIE];
  if (!tok) return null;
  const s = one('SELECT * FROM sessions WHERE token=?', tok);
  if (!s) return null;
  const u = one('SELECT * FROM users WHERE id=?', s.user_id);
  return u ? { ...u, _session: s } : null;
}

// 임팩트비전 매장 목록 갱신
async function refreshShops(user, session) {
  let s = session;
  if (!s) {
    const r = await loginUser(user);
    if (!r.ok) return { ok: false, msg: `임팩트비전 로그인 실패: ${r.msg}` };
    s = r.session;
  }
  const shops = await s.shops();
  if (!shops.length) return { ok: false, msg: '가입한 매장 목록을 찾지 못했습니다' };
  run('UPDATE users SET shops_json=?, shops_at=? WHERE id=?', JSON.stringify(shops), now(), user.id);
  // 단골 매장이 없으면 첫 매장(또는 하나뿐인 매장)으로
  if (!user.default_shop || !shops.some((x) => x.id === user.default_shop)) {
    if (shops.length === 1 || !user.default_shop) {
      const pick = shops.length === 1 ? shops[0] : null;
      if (pick) run('UPDATE users SET default_shop=?, default_shop_name=? WHERE id=?', pick.id, pick.name, user.id);
    }
  } else {
    const cur = shops.find((x) => x.id === user.default_shop);
    if (cur) run('UPDATE users SET default_shop_name=? WHERE id=?', cur.name, user.id);
  }
  return { ok: true, shops };
}

// 로그인 실패 잠금 (5번 틀리면 15분)
function isLocked(u) { return u && u.locked_until && u.locked_until > now(); }

const slotsCache = new Map(); // user.id → 최근 «빈 시간 보기» 결과 (한 번 보여주고 버림)

// ── 라우트 ──
async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  const M = req.method;
  const user = currentUser(req);

  if (p === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
  if (M === 'GET' && p === '/') return send(res, 200, pages.landing({ loggedIn: !!user }));
  if (M === 'GET' && p === '/login') return user ? redirect(res, '/app') : send(res, 200, pages.loginPage());

  if (M === 'POST' && p === '/login') {
    const b = await readBody(req);
    const login = String(b.get('login') || '').trim();
    const pw = String(b.get('pw') || '');
    if (!/^[\w가-힣.-]{2,20}$/.test(login)) return send(res, 200, pages.loginPage({ error: '아이디는 2~20자 (한글·영문·숫자·_ . -) 로 해 주세요.', login }));
    if (pw.length < 4) return send(res, 200, pages.loginPage({ error: '비밀번호는 4자 이상이어야 합니다.', login }));
    let u = one('SELECT * FROM users WHERE login=?', login);
    if (isLocked(u)) return send(res, 200, pages.loginPage({ error: '비밀번호를 여러 번 틀려 15분 동안 잠겼습니다.', login }));
    let isNew = false;
    if (!u) {
      const n = one('SELECT COUNT(*) n FROM users').n;
      if (n >= MAX_USERS) return send(res, 200, pages.loginPage({ error: '가입 인원이 다 찼습니다. 운영자에게 문의해 주세요.', login }));
      run('INSERT INTO users(login,pw_hash,created_at) VALUES(?,?,?)', login, hashPw(pw), now());
      u = one('SELECT * FROM users WHERE login=?', login);
      isNew = true;
      notify.owner(`🙋 임팩트비전 자동예약 새 가입 — ${login} (${now()})\n${PUBLIC_BASE}`);
    } else if (!checkPw(pw, u.pw_hash)) {
      const fails = (u.fail_count || 0) + 1;
      const lock = fails >= 5 ? new Date(Date.now() + 9 * 3600e3 + 15 * 60e3).toISOString().replace('T', ' ').slice(0, 19) : null;
      run('UPDATE users SET fail_count=?, locked_until=? WHERE id=?', lock ? 0 : fails, lock, u.id);
      return send(res, 200, pages.loginPage({ error: `비밀번호가 틀렸습니다.${lock ? ' 15분 동안 잠깁니다.' : ` (${fails}/5)`} 잊으셨다면 <a href="/reset-request?who=${encodeURIComponent(login)}">운영자에게 초기화 요청</a>`, login }));
    }
    run('UPDATE users SET fail_count=0, locked_until=NULL WHERE id=?', u.id);
    const tok = token();
    run('INSERT INTO sessions(token,user_id,created_at) VALUES(?,?,?)', tok, u.id, now());
    // 로그인할 때마다 매장 목록을 뒤에서 새로 고친다 (하루 한 번)
    if (u.iv_pw_enc && (!u.shops_at || u.shops_at < kstToday(0))) refreshShops(u).catch(() => {});
    return redirect(res, isNew ? '/app?m=' + encodeURIComponent('가입을 환영합니다! 먼저 임팩트비전 계정을 연결해 주세요.') : '/app', { 'Set-Cookie': setSession(tok) });
  }

  if (M === 'GET' && p === '/reset-request') {
    const who = String(url.searchParams.get('who') || '').slice(0, 20);
    if (who && one('SELECT id FROM users WHERE login=?', who)) await notify.owner(`🔑 비밀번호 초기화 요청 — ${who}\n서버에서: node scripts/admin.js reset ${who}`);
    return send(res, 200, pages.messagePage('요청했습니다', '운영자에게 초기화 요청을 보냈습니다. 초기화되면 알려 드릴게요.', '/login'));
  }

  if (M === 'POST' && p === '/logout') {
    if (user) run('DELETE FROM sessions WHERE token=?', user._session.token);
    return redirect(res, '/', { 'Set-Cookie': `${COOKIE}=; Path=/; Max-Age=0` });
  }

  // 카카오 콜백은 세션 쿠키로 사람을 찾는다 (state 대조)
  if (M === 'GET' && p === '/kakao/callback') {
    const st = String(url.searchParams.get('state') || '');
    const s = st && one('SELECT * FROM sessions WHERE kakao_state=?', st);
    if (!s) return send(res, 400, pages.messagePage('연결 실패', '세션이 맞지 않습니다. 사이트에 다시 로그인한 뒤 연결해 주세요.'));
    run('UPDATE sessions SET kakao_state=NULL WHERE token=?', s.token);
    const code = url.searchParams.get('code');
    if (!code) return send(res, 400, pages.messagePage('연결 취소', `카카오 연결을 하지 않았습니다. ${pages.esc(url.searchParams.get('error_description') || '')}`));
    const t = await notify.kakaoToken({ grant_type: 'authorization_code', redirect_uri: notify.kakaoRedirect(), code });
    if (!t.access_token) return send(res, 400, pages.messagePage('연결 실패', `카카오가 알려준 이유: ${pages.esc(JSON.stringify(t).slice(0, 300))}`));
    run('UPDATE users SET kakao_refresh=?, kakao_at=? WHERE id=?', t.refresh_token, now(), s.user_id);
    const sent = await notify.kakaoSendWithAccess(t.access_token, '⛳ 임팩트비전 자동예약 연결 완료\n앞으로 자정 예약 결과를 여기로 알려 드립니다.');
    return back(res, sent.ok ? '카카오톡 연결 완료 — «나와의 채팅»에 시험 메시지를 보냈습니다.' : `카카오톡은 연결됐지만 시험 메시지 실패: ${sent.why}`, !sent.ok);
  }

  // ── 여기부터 로그인 필요 ──
  if (!user) return redirect(res, '/login');

  if (M === 'GET' && p === '/app') {
    const shops = user.shops_json ? JSON.parse(user.shops_json) : [];
    const requests = all("SELECT * FROM requests WHERE user_id=? AND (status='대기' OR updated_at >= ?) ORDER BY target_date, id", user.id, kstToday(-30));
    requests.sort((a, b) => (a.status === '대기') - (b.status === '대기') || 0);
    const slotsView = slotsCache.get(user.id);
    slotsCache.delete(user.id);
    return send(res, 200, pages.appPage({
      user, shops, requests: requests.filter((r) => r.status === '대기').concat(requests.filter((r) => r.status !== '대기').reverse()),
      flash: url.searchParams.get('m') || url.searchParams.get('e') || '', flashErr: url.searchParams.has('e'),
      kakaoReady: !!KAKAO_REST_KEY, slotsView, today: kstToday(0), dateChoices: dateChoices(), dayLabel,
    }));
  }

  if (M === 'GET' && p === '/kakao/start') {
    if (!KAKAO_REST_KEY) return back(res, '카카오 연결이 아직 준비되지 않았습니다.', true);
    const st = token(16);
    run('UPDATE sessions SET kakao_state=? WHERE token=?', st, user._session.token);
    return redirect(res, notify.kakaoAuthUrl(st));
  }

  if (M !== 'POST') return send(res, 404, pages.messagePage('없는 페이지', '주소를 확인해 주세요.', '/'));
  const b = await readBody(req);

  if (p === '/app/iv') {
    const id = String(b.get('iv_id') || '').trim();
    const pw = String(b.get('iv_pw') || '');
    if (!id || !pw) return back(res, '아이디와 비밀번호를 모두 입력해 주세요.', true);
    const s = new ImpactSession(user.id);
    let r;
    try { r = await s.login(id, pw); } catch (e) { r = { ok: false, msg: e.message }; }
    if (!r.ok) return back(res, `임팩트비전 로그인 실패 — ${r.msg} (저장하지 않았습니다)`, true);
    run('UPDATE users SET iv_id=?, iv_pw_enc=?, iv_ok_at=?, iv_err=NULL WHERE id=?', id, encrypt(pw), now(), user.id);
    log(user.id, null, '임팩트비전 계정 저장');
    const sh = await refreshShops({ ...user, iv_id: id }, s).catch((e) => ({ ok: false, msg: e.message }));
    return back(res, sh.ok ? `임팩트비전 계정을 저장했습니다. 매장 ${sh.shops.length}곳을 불러왔어요.` : `계정은 저장했지만 매장 목록을 못 불러왔습니다: ${sh.msg}`, !sh.ok);
  }

  if (p === '/app/shops/refresh') {
    const sh = await refreshShops(user).catch((e) => ({ ok: false, msg: e.message }));
    return back(res, sh.ok ? `매장 ${sh.shops.length}곳을 불러왔습니다.` : sh.msg, !sh.ok);
  }

  if (p === '/app/shop') {
    const shops = user.shops_json ? JSON.parse(user.shops_json) : [];
    const pick = shops.find((x) => x.id === b.get('shop'));
    if (!pick) return back(res, '매장을 골라 주세요.', true);
    run('UPDATE users SET default_shop=?, default_shop_name=? WHERE id=?', pick.id, pick.name, user.id);
    return back(res, `단골 매장을 «${pick.name}»(으)로 저장했습니다.`);
  }

  if (p === '/app/req') {
    const shops = user.shops_json ? JSON.parse(user.shops_json) : [];
    const shop = shops.find((x) => x.id === b.get('shop'));
    if (!shop) return back(res, '매장을 골라 주세요.', true);
    const allowed = new Set(dateChoices().map((d) => d.date));
    const dates = [...new Set(b.getAll('date'))].filter((d) => allowed.has(d));
    if (!dates.length) return back(res, '날짜를 하나 이상 골라 주세요 (내일부터 2주, 월요일 제외).', true);
    // 1시간 단위, 09:00 ~ 21:00 만
    const times = [...new Set([b.get('t1'), b.get('t2'), b.get('t3')].map(hhmm).filter((t) => /^(09|1\d|20|21):00$/.test(t)))];
    if (!times.length) return back(res, '1순위 시간을 골라 주세요.', true);
    if (one("SELECT COUNT(*) n FROM requests WHERE user_id=? AND status='대기'", user.id).n + dates.length > 20) return back(res, '대기 중인 예약은 한 사람당 20건까지입니다.', true);
    let added = 0;
    for (const d of dates) {
      if (one("SELECT id FROM requests WHERE user_id=? AND target_date=? AND status='대기'", user.id, d)) continue;
      run('INSERT INTO requests(user_id,target_date,shop_id,shop_name,times_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?)', user.id, d, shop.id, shop.name, JSON.stringify(times), now(), now());
      added++;
    }
    if (shop.id !== user.default_shop) run('UPDATE users SET default_shop=?, default_shop_name=? WHERE id=?', shop.id, shop.name, user.id);
    return back(res, `${added}건을 걸어 두었습니다 — ${dates.map(dayLabel).join(', ')} · ${times.join(' → ')}`);
  }

  let m = p.match(/^\/app\/req\/(\d+)\/(cancel|try)$/);
  if (m) {
    const r = one('SELECT * FROM requests WHERE id=? AND user_id=?', Number(m[1]), user.id);
    if (!r || r.status !== '대기') return back(res, '대기 중인 예약이 아닙니다.', true);
    if (m[2] === 'cancel') {
      run("UPDATE requests SET status='취소', updated_at=? WHERE id=?", now(), r.id);
      return back(res, `${dayLabel(r.target_date)} 예약 요청을 지웠습니다.`);
    }
    const lr = await loginUser(user).catch((e) => ({ ok: false, msg: e.message }));
    if (!lr.ok) return back(res, `임팩트비전 로그인 실패: ${lr.msg}`, true);
    const res2 = await attempt(lr.session, r, { quiet: true });
    if (res2.state === 'booked') return back(res, `⛳ 예약 성공! ${dayLabel(r.target_date)} ${res2.time}${res2.dry ? ' (시험 모드 — 실제 예약 안 함)' : ''}`);
    return back(res, res2.state === 'notopen' ? `아직 ${dayLabel(r.target_date)} 시간표가 열리지 않았습니다. 자정에 다시 시도합니다.` : `지금은 못 잡았습니다: ${res2.msg}. 자정에 다시 시도합니다.`, true);
  }

  if (p === '/app/check') {
    const date = String(b.get('date') || '');
    const ok = date === kstToday(0) || dateChoices().some((d) => d.date === date);
    if (!ok) return back(res, '날짜를 골라 주세요.', true);
    let view;
    try {
      const lr = await loginUser(user);
      if (!lr.ok) throw new Error(`임팩트비전 로그인 실패: ${lr.msg}`);
      const slots = await lr.session.slots(user.default_shop, date);
      view = { date, times: [...new Set(slots.filter((s) => !s.sday || s.sday === date).map((s) => s.ss + (s.se ? '~' + s.se : '')))].sort() };
    } catch (e) { view = { date, times: [], error: e.message }; }
    slotsCache.set(user.id, view);
    return redirect(res, '/app#check');
  }

  if (p === '/app/discord') {
    const u = String(b.get('discord') || '').trim();
    if (!u) { run('UPDATE users SET discord_url=NULL WHERE id=?', user.id); return back(res, '디스코드 알림을 껐습니다.'); }
    if (!notify.DISCORD_RE.test(u)) return back(res, '디스코드 웹훅 주소 형식이 아닙니다.', true);
    const t = await notify.discord(u, `⛳ 임팩트비전 자동예약 — ${user.login} 님 알림 연결 완료`);
    if (!t.ok) return back(res, `시험 알림 실패(저장 안 함): ${t.why}`, true);
    run('UPDATE users SET discord_url=? WHERE id=?', u, user.id);
    return back(res, '디스코드 웹훅을 저장했고 시험 알림을 보냈습니다.');
  }

  if (p === '/app/notify/test') {
    const out = await notify.toUser(user, `⛳ 임팩트비전 자동예약 시험 알림 (${now().slice(5, 16)})`);
    return back(res, out.map(([k, r]) => `${k} ${r.ok ? '성공' : '실패(' + r.why + ')'}`).join(' · ') || '연결된 알림이 없습니다.', out.some(([, r]) => !r.ok));
  }

  if (p === '/app/kakao/unlink') {
    run('UPDATE users SET kakao_refresh=NULL, kakao_at=NULL WHERE id=?', user.id);
    return back(res, '카카오톡 연결을 끊었습니다.');
  }

  if (p === '/app/password') {
    if (!checkPw(String(b.get('old') || ''), user.pw_hash)) return back(res, '지금 비밀번호가 틀렸습니다.', true);
    const nw = String(b.get('new') || '');
    if (nw.length < 4) return back(res, '새 비밀번호는 4자 이상이어야 합니다.', true);
    run('UPDATE users SET pw_hash=? WHERE id=?', hashPw(nw), user.id);
    run('DELETE FROM sessions WHERE user_id=? AND token<>?', user.id, user._session.token);
    return back(res, '비밀번호를 바꿨습니다.');
  }

  return send(res, 404, pages.messagePage('없는 페이지', '주소를 확인해 주세요.', '/'));
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    console.error(e);
    if (!res.headersSent) send(res, 500, pages.messagePage('오류', `잠시 뒤 다시 시도해 주세요. (${pages.esc(e.message)})`));
  });
});
if (require.main === module) server.listen(PORT, HOST, () => console.log(`임팩트비전 자동예약 http://${HOST}:${PORT}`));
module.exports = { server, dateChoices };
