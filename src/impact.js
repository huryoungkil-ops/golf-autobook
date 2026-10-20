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

// 시간표 (2026-10-20 실제 화면으로 확인): 1시간마다 <div class="reserve-box" source-file="reserve_time.php?method=confirm&sday=&ss=&se=&sid=&schidx=">
// 안쪽 <div class="circle-reserve" title="LOCK|9807|1">잠금</div> — 아직 안 열린 시간은 LOCK/«잠금».
// 열린 뒤의 상태 이름은 아직 못 봤다 → LOCK 이 아니면 시도해 보고, 확인 창·예약 응답으로 판정한다.
function parseSlots(html) {
  const seen = new Set();
  const slots = [];
  const text = decodeEnt(html);
  const links = [...text.matchAll(/reserve_time\.php\?([^"'\s<>)]+)/g)];
  links.forEach((m, i) => {
    // 이 시간 칸 = 이 주소부터 다음 주소 전까지 (상태 동그라미가 그 안에 있다)
    const part = text.slice(m.index, i + 1 < links.length ? links[i + 1].index : undefined);
    const q = new URLSearchParams(m[1]);
    if (q.get('method') && q.get('method') !== 'confirm') return;
    if (seen.has(m[1])) return;
    seen.add(m[1]);
    const circle = part.match(/<div\b([^>]*\bcircle-reserve\b[^>]*)>([\s\S]*?)<\/div>/i);
    const code = circle ? String(attrs(circle[1]).title || '').split('|')[0] : '';
    const label = circle ? stripTags(circle[2]) : '';
    const locked = /^LOCK$/i.test(code) || /잠금/.test(label);
    const closed = /마감|완료|불가|예약됨|FULL|CLOSE/i.test(`${code} ${label}`);
    slots.push({ query: m[1], sday: q.get('sday') || '', ss: hhmm(q.get('ss')), se: hhmm(q.get('se')), sid: q.get('sid') || '', schidx: q.get('schidx') || '', code, label, locked, closed });
  });
  return slots;
}

// 예약 확인 창: 타석(client_info)·이용권(rsv_pay_idx) 선택칸
function parseConfirm(html) {
  const sel = (name) => {
    const m = html.match(new RegExp(`<select[^>]*name\\s*=\\s*["']?${name}["']?[^>]*>([\\s\\S]*?)</select>`, 'i'));
    if (!m) return null;
    return [...m[1].matchAll(/<option([^>]*)>([\s\S]*?)<\/option>/gi)].map((o) => ({ value: attrs(o[1]).value ?? '', name: stripTags(o[2].replace(/<br\s*\/?>/gi, ' ')) }));
  };
  const bays = (sel('client_info') || []).filter((o) => o.value);
  const passes = (sel('rsv_pay_idx') || []).filter((o) => o.value && o.value !== '0');
  return { bays, passes, hasBaySelect: /name\s*=\s*["']?client_info/i.test(html), hasPassSelect: /name\s*=\s*["']?rsv_pay_idx/i.test(html) };
}

// 타석 고르기: 선호 순서대로 비어 있는 첫 타석, 없으면 (anyBay 일 때) 아무 타석
// 선호는 타석 이름 앞부분(«5번»)으로 맞춘다 — 값(3094|4)은 매장 사정으로 바뀔 수 있어서
const bayKey = (name) => (String(name).match(/^\s*(\d+)\s*번/) || [])[1] || String(name).trim();
function pickBay(bays, prefer = [], anyBay = true) {
  for (const p of prefer) {
    const hit = bays.find((b) => bayKey(b.name) === bayKey(p));
    if (hit) return hit;
  }
  if (!prefer.length || anyBay) return bays[0] || null;
  return null;
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

  async confirm(slot) {
    const c = await this.req(`/m_v3/source-file/reserve_time.php?${slot.query}`, { xhr: true });
    this.snap(`confirm-${slot.sday}-${slot.ss.replace(':', '')}`, c.text);
    return c.text;
  }

  // 매장의 타석 목록 (아무 날 아무 시간의 확인 창에서 읽는다 — 조회만, 예약 안 함)
  async bays(shopId, day) {
    const slots = await this.slots(shopId, day);
    for (const s of slots.slice(0, 3)) {
      const { bays } = parseConfirm(await this.confirm(s));
      if (bays.length) return bays.map((b) => b.name);
    }
    return [];
  }

  async myReservations() {
    const r = await this.req('/m_v3/source-file/reserve_my.php?method=list', { xhr: true });
    this.snap('my-list', r.text);
    if (/비정상접근/.test(r.text) && r.text.length < 200) throw new Error('예약 내역 화면 거절 (비정상접근)');
    return parseMyList(r.text);
  }

  // 예약 취소 — 사이트의 «취소» 버튼과 같은 요청. 반환 {ok, msg}
  async cancel(idx) {
    if (!/^\d+$/.test(String(idx))) return { ok: false, msg: '예약 번호가 이상합니다' };
    const r = await this.req(`/m_v3/source-file/reserve_exe.php?mod=cancel&cancel_idx=${idx}`, { method: 'POST', body: '', xhr: true });
    this.snap(`cancel-${idx}`, r.text);
    let j;
    try { j = JSON.parse(r.text.trim()); } catch { j = null; }
    if (!j) return { ok: false, msg: `알 수 없는 응답: ${stripTags(r.text).slice(0, 120)}` };
    return j.result === 'F' ? { ok: false, msg: j.msg || '취소 실패' } : { ok: true, msg: j.msg || '취소 완료' };
  }

  // 시간 순위대로 예약을 시도한다. 한 시간 안에서는 선호 타석 순서대로.
  // 반환 state: booked(성공) · notopen(시간표가 아직 잠금/없음) · full(원하는 시간·타석이 모두 안 됨)
  async book(shopId, day, times, { bays: preferBays = [], anyBay = true, onLog = () => {} } = {}) {
    const all = (await this.slots(shopId, day)).filter((s) => !s.sday || s.sday === day);
    if (!all.length) return { state: 'notopen', msg: `${day} 시간표가 화면에 없음` };
    const wanted = times.map(hhmm).filter(Boolean);
    const wantedSlots = all.filter((s) => wanted.includes(s.ss));
    if (wantedSlots.length && wantedSlots.every((s) => s.locked)) return { state: 'notopen', msg: `${day} 아직 잠금 (예약 열리기 전)` };
    if (!wantedSlots.length && all.every((s) => s.locked)) return { state: 'notopen', msg: `${day} 아직 잠금 (예약 열리기 전)` };
    const reasons = [];
    for (const want of wanted) {
      const s = all.find((x) => x.ss === want);
      if (!s) { reasons.push(`${want} 시간표에 없음`); continue; }
      if (s.locked) { reasons.push(`${want} 잠금`); continue; }
      if (s.closed) { reasons.push(`${want} ${s.label || '마감'}`); continue; }
      const html = await this.confirm(s);
      const fields = parseForm(html, 'reserve-confirm');
      if (!fields) { reasons.push(`${want} 확인 창을 못 읽음`); continue; }
      const cf = parseConfirm(html);
      // 이용권: «이용권 선택(0)» 이 아닌 첫 이용권
      if (cf.hasPassSelect) {
        if (!cf.passes.length) { reasons.push(`${want} 쓸 수 있는 이용권이 없음`); continue; }
        setField(fields, 'rsv_pay_idx', cf.passes[0].value);
      }
      // 타석: 선호 → (허용하면) 나머지
      let order = [null];
      if (cf.hasBaySelect) {
        if (!cf.bays.length) { reasons.push(`${want} 빈 타석 없음`); continue; }
        const pref = preferBays.map((p) => cf.bays.find((b) => bayKey(b.name) === bayKey(p))).filter(Boolean);
        const rest = cf.bays.filter((b) => !pref.includes(b));
        order = preferBays.length && !anyBay ? pref : [...pref, ...rest];
        if (!order.length) { reasons.push(`${want} 원하는 타석(${preferBays.join(', ')})이 비어 있지 않음`); continue; }
      }
      for (const bay of order) {
        if (bay) setField(fields, 'client_info', bay.value);
        const body = new URLSearchParams(fields).toString();
        const bayName = bay ? bay.name : '';
        if (DRY_RUN) {
          onLog(`[시험] ${want} ${bayName} 예약 직전에서 멈춤: ${body}`);
          return { state: 'booked', time: want, end: s.se, bay: bayName, dry: true, msg: '시험 모드 — 실제 예약 안 함' };
        }
        const r = await this.req('/m_v3/source-file/reserve_exe.php?mod=add', { method: 'POST', body, xhr: true });
        this.snap(`exe-${day}-${want.replace(':', '')}`, r.text);
        let j;
        try { j = JSON.parse(r.text.trim()); } catch { j = null; }
        if (j && j.result !== 'F') return { state: 'booked', time: want, end: s.se, bay: bayName, msg: j.msg || '접수 완료' };
        const why = j ? (j.msg || '실패') : `알 수 없는 응답: ${stripTags(r.text).slice(0, 120)}`;
        reasons.push(`${want} ${bayName} ${why}`.replace(/\s+/g, ' '));
        onLog(`${want} ${bayName} 실패: ${why}`);
        // 타석과 상관없는 거절(이용권·횟수 제한 등)이면 다른 타석을 더 시도하지 않는다
        if (!/타석|자리|이미|중복|예약된/.test(why)) break;
      }
    }
    return { state: 'full', msg: reasons.join(' · ') };
  }
}

// 내 예약 내역 (reserve_my.php?method=list — 최근 10건). 2026-10-21 실제 화면으로 확인:
// <div class="my-reserve-box-detail"> 매장 · <div class="reserve-time">21:00</div> · <div class="reserve-day">(일) 2026-10-18 <span class="lockidx_num_ico_my">2번 타석</span>
// 상태 동그라미 <div class="circle-reserve-end" data-cancel-idx="6805391">완료</div> — 지난 예약은 end/«완료»,
// 앞으로의 예약은 사이트 스크립트상 circle-reserve-cancel (아직 실물 못 봄)
function parseMyList(html) {
  const out = [];
  const parts = html.split(/(?=<div[^>]*class\s*=\s*["']my-reserve-box-detail)/i).slice(1);
  for (const part of parts) {
    const time = hhmm(stripTags((part.match(/class\s*=\s*["']reserve-time["'][^>]*>([\s\S]*?)<\/div>/i) || [])[1] || ''));
    const dayRaw = (part.match(/class\s*=\s*["']reserve-day["'][^>]*>([\s\S]*?)<\/div>/i) || [])[1] || '';
    const date = (dayRaw.match(/\d{4}-\d{2}-\d{2}/) || [])[0] || '';
    const bay = stripTags((dayRaw.match(/lockidx_num_ico_my[^>]*>([\s\S]*?)<\/span>/i) || [])[1] || '').replace(/\s*타석$/, '');
    const shopBlock = (part.match(/font-weight\s*:\s*bold[^>]*>([\s\S]*?)<br/i) || [])[1] || '';
    const pass = stripTags((part.match(/<font[^>]*>([\s\S]*?)<\/font>/i) || [])[1] || '').replace(/^-/, '');
    const circle = part.match(/<div\b([^>]*class\s*=\s*["'](circle-reserve[\w-]*)["'][^>]*)>([\s\S]*?)<\/div>/i);
    const a = circle ? attrs(circle[1]) : {};
    const cls = circle ? circle[2] : '';
    const label = circle ? stripTags(circle[3]) : '';
    if (!date) continue;
    out.push({ idx: a['data-cancel-idx'] || '', shop: stripTags(shopBlock), pass, date, time, bay, cls, label });
  }
  return out;
}

function setField(fields, name, value) {
  const i = fields.findIndex(([k]) => k === name);
  if (i >= 0) fields[i] = [name, value];
  else fields.push([name, value]);
}

module.exports = { ImpactSession, parseShops, parseSlots, parseForm, parseConfirm, parseMyList, pickBay, bayKey, parseLoginResult, hhmm };
