// 임팩트비전 모바일 사이트(my.impactvision.co.kr/m_v3) 를 사람 대신 조작한다.
// 사이트 흐름 (2026-10-20 화면 소스로 확인):
//   로그인    POST /m_v3/mauth.php  proc=msignin&pushid=&mbid=&mbpass=   (세션 쿠키 + Referer 없으면 «비정상접근»)
//   매장·시간 GET  /m_v3/source-file/reserve.php?search_id=<매장>&search_day=<YYYY-MM-DD>
//   확인 창   GET  /m_v3/source-file/reserve_time.php?method=confirm&sday=&ss=&se=&sid=&schidx=
//   예약      POST /m_v3/source-file/reserve_exe.php?mod=add   (#reserve-confirm 폼 + 약관 동의) → JSON {result:'F', msg} 면 실패
// 로그인 뒤 화면(매장 목록·시간표)은 아직 실제로 보지 못해 아래 해석은 추정이 섞여 있다.
// 그래서 받은 화면을 data/snap/ 에 남겨 두고, 해석이 틀리면 그걸 보고 고친다.
const fs = require('node:fs');
const path = require('node:path');
const { DATA_DIR, DRY_RUN } = require('./env');

const BASE = 'https://my.impactvision.co.kr';
const HOME = `${BASE}/m_v3/?url=`;
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const decodeEnt = (s) => String(s)
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ');
const stripTags = (s) => decodeEnt(String(s).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

function attrs(tag) {
  const out = {};
  for (const m of tag.matchAll(/([a-zA-Z_:][-\w:.]*)\s*(?:=\s*("([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    out[m[1].toLowerCase()] = decodeEnt(m[3] ?? m[4] ?? m[5] ?? '');
  }
  return out;
}

// HH:MM 으로 맞춘다 ("9:00" → "09:00")
function hhmm(t) {
  const m = String(t || '').match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
}

// ── 화면 해석 (시험하기 쉽게 따로 뺀다) ─────────────────────────────

function parseLoginResult(html) {
  const alert = (html.match(/alert\(\s*["']([^"']+)["']/) || [])[1];
  if (alert && /history\.go\(-1\)|history\.back/.test(html)) return { ok: false, msg: alert };
  if (/비정상접근/.test(html) && html.length < 200) return { ok: false, msg: '비정상접근 (사이트가 요청을 거절)' };
  return { ok: true, msg: alert || '' };
}

// 가입 매장 목록: <select id="joinshop"> 의 option
function parseShops(html) {
  const sel = html.match(/<select[^>]*(?:id|name)\s*=\s*["']?(?:joinshop|search_id)["']?[^>]*>([\s\S]*?)<\/select>/i);
  const shops = [];
  if (sel) {
    for (const m of sel[1].matchAll(/<option([^>]*)>([\s\S]*?)<\/option>/gi)) {
      const a = attrs(m[1]);
      const name = stripTags(m[2]);
      if (a.value && !/선택/.test(name)) shops.push({ id: a.value, name: name || a.value });
    }
  }
  return shops;
}

// 시간표: 화면 어딘가에 박힌 reserve_time.php?... 주소들을 모은다
function parseSlots(html) {
  const seen = new Set();
  const slots = [];
  for (const m of decodeEnt(html).matchAll(/reserve_time\.php\?([^"'\s<>)]+)/g)) {
    const q = new URLSearchParams(m[1]);
    if (q.get('method') && q.get('method') !== 'confirm') continue;
    const key = m[1];
    if (seen.has(key)) continue;
    seen.add(key);
    slots.push({ query: m[1], sday: q.get('sday') || '', ss: hhmm(q.get('ss')), se: hhmm(q.get('se')), sid: q.get('sid') || '', schidx: q.get('schidx') || '' });
  }
  return slots;
}

// 폼 하나를 jQuery serialize() 처럼 모은다. 약관 동의(agree) 체크박스는 체크한 것으로 친다.
function parseForm(html, formId) {
  const re = new RegExp(`<form[^>]*id\\s*=\\s*["']?${formId}["']?[^>]*>([\\s\\S]*?)</form>`, 'i');
  const f = html.match(re);
  if (!f) return null;
  const body = f[1];
  const fields = [];
  for (const m of body.matchAll(/<input\b([^>]*)>/gi)) {
    const a = attrs(m[1]);
    if (!a.name || 'disabled' in a) continue;
    const type = (a.type || 'text').toLowerCase();
    if (['submit', 'button', 'image', 'reset', 'file'].includes(type)) continue;
    const isAgree = /agree/i.test(a.name) || /agree/i.test(a.id || '');
    if ((type === 'checkbox' || type === 'radio') && !('checked' in a) && !isAgree) continue;
    fields.push([a.name, a.value ?? (type === 'checkbox' ? 'on' : '')]);
  }
  for (const m of body.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi)) {
    const a = attrs(m[1]);
    if (!a.name) continue;
    const opts = [...m[2].matchAll(/<option([^>]*)>([\s\S]*?)<\/option>/gi)].map((o) => ({ a: attrs(o[1]), text: stripTags(o[2]) }));
    const pick = opts.find((o) => 'selected' in o.a) || opts[0];
    if (pick) fields.push([a.name, pick.a.value ?? pick.text]);
  }
  for (const m of body.matchAll(/<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/gi)) {
    const a = attrs(m[1]);
    if (a.name) fields.push([a.name, decodeEnt(m[2])]);
  }
  return fields;
}

// ── 세션 ─────────────────────────────────────────────────────────

class ImpactSession {
  constructor(tag = '') {
    this.jar = new Map();
    this.tag = tag;
  }

  cookieHeader() {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  async req(url, { method = 'GET', body, xhr = false, referer = HOME, timeout = 15000 } = {}) {
    const headers = { 'User-Agent': UA, Referer: referer, Origin: BASE, 'Accept-Language': 'ko-KR,ko;q=0.9' };
    if (this.jar.size) headers.Cookie = this.cookieHeader();
    if (xhr) headers['X-Requested-With'] = 'XMLHttpRequest';
    if (body) headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
    let u = url.startsWith('http') ? url : BASE + url;
    for (let hop = 0; hop < 5; hop++) {
      const res = await fetch(u, { method, headers: { ...headers, ...(this.jar.size ? { Cookie: this.cookieHeader() } : {}) }, body, redirect: 'manual', signal: AbortSignal.timeout(timeout) });
      for (const c of res.headers.getSetCookie?.() || []) {
        const [kv] = c.split(';');
        const i = kv.indexOf('=');
        if (i > 0) this.jar.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim());
      }
      const loc = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && loc) {
        u = new URL(loc, u).toString().replace(/^http:/, 'https:');
        method = 'GET';
        body = undefined;
        delete headers['Content-Type'];
        continue;
      }
      return { status: res.status, text: await res.text(), url: u };
    }
    throw new Error('리다이렉트가 너무 많다');
  }

  snap(name, text) {
    try {
      const dir = path.join(DATA_DIR, 'snap', String(this.tag || 'anon'));
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${name}.html`), text);
    } catch { /* 진단용이라 실패해도 그만 */ }
  }

  async login(id, pw) {
    await this.req(HOME); // 세션 쿠키
    const body = new URLSearchParams({ proc: 'msignin', pushid: '', mbid: id, mbpass: pw }).toString();
    const r = await this.req('/m_v3/mauth.php', { method: 'POST', body });
    this.snap('login', r.text);
    const res = parseLoginResult(r.text);
    if (!res.ok) return res;
    // 로그인 화면이 다시 나오면 실패로 본다
    const home = await this.req(HOME);
    this.snap('home', home.text);
    if (/id\s*=\s*["']loginform["']/.test(home.text)) return { ok: false, msg: '로그인 뒤에도 로그인 화면이 나온다 (아이디·비밀번호 확인)' };
    return { ok: true, msg: '' };
  }

  async reservePage(shopId = '', day = '') {
    const qs = shopId || day ? `?search_id=${encodeURIComponent(shopId)}&search_day=${encodeURIComponent(day)}` : '';
    const r = await this.req(`/m_v3/source-file/reserve.php${qs}`, { xhr: true });
    this.snap(`reserve${shopId ? '-' + shopId : ''}${day ? '-' + day : ''}`, r.text);
    if (/비정상접근/.test(r.text) && r.text.length < 200) throw new Error('예약 화면 거절 (비정상접근)');
    return r.text;
  }

  async shops() {
    return parseShops(await this.reservePage());
  }

  async slots(shopId, day) {
    return parseSlots(await this.reservePage(shopId, day));
  }

  // 시간 순위대로 예약을 시도한다.
  // 반환 state: booked(성공) · notopen(그날 시간표가 아직 없음) · full(원하는 시간이 모두 안 됨)
  async book(shopId, day, times, { onLog = () => {} } = {}) {
    const slots = (await this.slots(shopId, day)).filter((s) => !s.sday || s.sday === day);
    if (!slots.length) return { state: 'notopen', msg: `${day} 예약 가능한 시간이 화면에 없음` };
    const reasons = [];
    for (const want of times.map(hhmm).filter(Boolean)) {
      const cands = slots.filter((s) => s.ss === want);
      if (!cands.length) { reasons.push(`${want} 빈자리 없음`); continue; }
      for (const s of cands) {
        const c = await this.req(`/m_v3/source-file/reserve_time.php?${s.query}`, { xhr: true });
        this.snap(`confirm-${day}-${want.replace(':', '')}`, c.text);
        const fields = parseForm(c.text, 'reserve-confirm');
        if (!fields) { reasons.push(`${want} 확인 창을 못 읽음`); continue; }
        const body = new URLSearchParams(fields).toString();
        if (DRY_RUN) {
          onLog(`[시험] ${want} 예약 직전에서 멈춤: ${body}`);
          return { state: 'booked', time: want, dry: true, msg: '시험 모드 — 실제 예약 안 함' };
        }
        const r = await this.req('/m_v3/source-file/reserve_exe.php?mod=add', { method: 'POST', body, xhr: true });
        this.snap(`exe-${day}-${want.replace(':', '')}`, r.text);
        let j;
        try { j = JSON.parse(r.text.trim()); } catch { j = null; }
        if (j && j.result !== 'F') return { state: 'booked', time: want, end: s.se, msg: j.msg || '접수 완료' };
        const why = j ? (j.msg || '실패') : `알 수 없는 응답: ${stripTags(r.text).slice(0, 120)}`;
        reasons.push(`${want} ${why}`);
        onLog(`${want} 실패: ${why}`);
      }
    }
    return { state: 'full', msg: reasons.join(' · ') };
  }
}

module.exports = { ImpactSession, parseShops, parseSlots, parseForm, parseLoginResult, hhmm };
