// 알림: 사용자별 디스코드 웹훅 · 카카오톡 «나에게 보내기» (경매알리미와 같은 방식), 운영자 디스코드
const { run } = require('./db');
const push = require('./push');
const { OWNER_WEBHOOK, FEED_WEBHOOK, KAKAO_REST_KEY, KAKAO_CLIENT_SECRET, PUBLIC_BASE } = require('./env');

const DISCORD_RE = /^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/;

async function discord(url, content) {
  if (!url) return { ok: false, why: '웹훅 없음' };
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: String(content).slice(0, 1900) }), signal: AbortSignal.timeout(15000) });
    return { ok: r.status < 300, why: r.status < 300 ? '' : `디스코드 ${r.status}` };
  } catch (e) { return { ok: false, why: e.message }; }
}

const owner = (content) => discord(OWNER_WEBHOOK, content);
// 회원 소식 채널 (없으면 조용히 넘어감)
const feed = (content) => (FEED_WEBHOOK ? discord(FEED_WEBHOOK, content) : Promise.resolve({ ok: false, why: '소식 채널 없음' }));

async function kakaoToken(form) {
  const r = await fetch('https://kauth.kakao.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body: new URLSearchParams({ client_id: KAKAO_REST_KEY, ...(KAKAO_CLIENT_SECRET ? { client_secret: KAKAO_CLIENT_SECRET } : {}), ...form }),
    signal: AbortSignal.timeout(15000),
  });
  return r.json().catch(() => ({}));
}

const kakaoRedirect = () => `${PUBLIC_BASE}/kakao/callback`;
const kakaoAuthUrl = (state) => `https://kauth.kakao.com/oauth/authorize?${new URLSearchParams({ client_id: KAKAO_REST_KEY, redirect_uri: kakaoRedirect(), response_type: 'code', scope: 'talk_message', state })}`;

async function kakaoSendWithAccess(access, text) {
  const tpl = { object_type: 'text', text: String(text).slice(0, 190), link: { web_url: PUBLIC_BASE + '/app', mobile_web_url: PUBLIC_BASE + '/app' }, button_title: '예약 현황 보기' };
  const r = await fetch('https://kapi.kakao.com/v2/api/talk/memo/default/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body: new URLSearchParams({ template_object: JSON.stringify(tpl) }),
    signal: AbortSignal.timeout(15000),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: j.result_code === 0, why: j.result_code === 0 ? '' : JSON.stringify(j).slice(0, 200) };
}

async function kakao(user, text) {
  if (!user.kakao_refresh) return { ok: false, why: '카카오 미연결' };
  try {
    const t = await kakaoToken({ grant_type: 'refresh_token', refresh_token: user.kakao_refresh });
    if (!t.access_token) return { ok: false, why: `토큰 갱신 실패 ${t.error || ''} ${t.error_description || ''}` };
    // 만료가 가까우면 카카오가 새 refresh_token 을 같이 준다
    if (t.refresh_token) run('UPDATE users SET kakao_refresh=? WHERE id=?', t.refresh_token, user.id);
    return await kakaoSendWithAccess(t.access_token, text);
  } catch (e) { return { ok: false, why: e.message }; }
}

// 사용자에게 (연결된 곳 모두로). 사이트 알림함에는 항상 남기고, 알림을 켠 기기가 있으면 그 기기로도 보낸다
async function toUser(user, text) {
  const out = [];
  if (user.discord_url) out.push(['디스코드', await discord(user.discord_url, text)]);
  if (user.kakao_refresh) out.push(['카카오톡', await kakao(user, text)]);
  try {
    const r = await push().notify(String(user.id), { body: text });
    if (r.devices) out.push(['이 기기 알림', { ok: r.ok > 0, why: r.ok ? '' : (r.errors[0] || (r.gone ? '기기에서 알림이 꺼짐' : '보내지 못함')) }]);
  } catch (e) { out.push(['이 기기 알림', { ok: false, why: e.message }]); }
  return out;
}

module.exports = { DISCORD_RE, discord, owner, feed, kakao, kakaoToken, kakaoAuthUrl, kakaoRedirect, kakaoSendWithAccess, toUser };
