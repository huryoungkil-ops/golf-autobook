// 예약 한 건 처리 — 자정 작업(job.js)과 «지금 시도» 버튼(web.js)이 같이 쓴다
const { ImpactSession } = require('./impact');
const { one, run, now, log } = require('./db');
const { decrypt } = require('./secure');
const notify = require('./notify');
const { FEED_SKIP_LOGINS } = require('./env');

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
function dayLabel(d) {
  const [y, m, dd] = d.split('-').map(Number);
  const w = new Date(Date.UTC(y, m - 1, dd)).getUTCDay();
  return `${m}/${dd}(${DOW[w]})`;
}
const kstToday = (offsetDays = 0) => new Date(Date.now() + 9 * 3600e3 + offsetDays * 86400e3).toISOString().slice(0, 10);

async function loginUser(user) {
  if (!user.iv_id || !user.iv_pw_enc) return { ok: false, msg: '임팩트비전 계정이 등록되지 않았습니다' };
  const s = new ImpactSession(user.id);
  const r = await s.login(user.iv_id, decrypt(user.iv_pw_enc));
  if (r.ok) run('UPDATE users SET iv_ok_at=?, iv_err=NULL WHERE id=?', now(), user.id);
  else run('UPDATE users SET iv_err=? WHERE id=?', r.msg, user.id);
  return { ...r, session: r.ok ? s : null };
}

// final: 오늘(자정)이 그 날짜의 마지막 기회인가 · lastTry: 이번 밤의 마지막 시도인가
// quiet: 알림 안 보냄 (사이트의 «지금 시도» 버튼 — 결과는 화면에 바로 보여준다)
// quietFail: 실패는 기록만 하고 알리지도 닫지도 않는다 (곧 다시 시도할 때)
async function attempt(session, req, { final = false, lastTry = false, quiet = false, quietFail = false, onLog } = {}) {
  const times = JSON.parse(req.times_json);
  run('UPDATE requests SET attempts=attempts+1, updated_at=? WHERE id=?', now(), req.id);
  let res;
  try {
    res = await session.book(req.shop_id, req.target_date, times, {
      bays: req.bays_json ? JSON.parse(req.bays_json) : [],
      anyBay: req.any_bay !== 0,
      onLog: (m) => log(req.user_id, req.id, m),
    });
  } catch (e) {
    res = { state: 'error', msg: e.message };
  }
  log(req.user_id, req.id, `${res.state}: ${res.msg || ''} ${res.time || ''}`);
  if (onLog) onLog(res);
  const user = one('SELECT * FROM users WHERE id=?', req.user_id);
  const where = `${dayLabel(req.target_date)} ${req.shop_name || req.shop_id}`;
  const say = (text) => (quiet ? null : notify.toUser(user, text));
  if (res.state === 'booked') {
    const rank = times.indexOf(res.time) + 1;
    run("UPDATE requests SET status='성공', booked_time=?, booked_bay=?, result_msg=?, updated_at=? WHERE id=?", res.time, res.bay || null, [res.msg, res.bayNote].filter(Boolean).join(' · '), now(), req.id);
    if (!FEED_SKIP_LOGINS.includes(user.login)) {
      await notify.feed([
        `⛳ **${user.login}** 님 예약 성공${res.dry ? ' (시험 모드)' : ''}`,
        `· 날짜·시간: **${dayLabel(req.target_date)} ${res.time}${res.end ? '~' + res.end : ''}**`,
        `· 매장: ${req.shop_name || req.shop_id}${res.bay ? ` · **${res.bay} 타석**` : ''}`,
        `· 희망 순서: ${times.join(' → ')} 중 ${rank}순위로 잡음`,
        req.bays_json && JSON.parse(req.bays_json).length ? `· 원한 타석: ${JSON.parse(req.bays_json).join(' → ')}${req.any_bay === 0 ? ' (이 타석만)' : ''}` : '',
        res.bayNote ? `· 참고: ${res.bayNote}` : '',
        `· 방식: ${quiet ? '«지금 시도» 버튼' : '자정 자동 예약'} · ${now().slice(5, 19)}`,
        `· 임팩트비전 응답: ${res.msg || '-'}`,
      ].filter(Boolean).join('\n'));
    }
    await say(`⛳ 예약 성공${res.dry ? ' (시험 모드)' : ''}\n${where} ${res.time}${res.end ? '~' + res.end : ''}${res.bay ? ' · ' + res.bay + ' 타석' : ''} (${rank}순위)\n${res.msg || ''}${res.bayNote ? '\n' + res.bayNote : ''}`);
  } else if (quietFail) {
    run('UPDATE requests SET result_msg=?, updated_at=? WHERE id=?', res.msg, now(), req.id);
  } else if (final && (res.state === 'full' || lastTry)) {
    run("UPDATE requests SET status='실패', result_msg=?, updated_at=? WHERE id=?", res.msg, now(), req.id);
    await say(`😢 예약 실패\n${where} — ${times.join(', ')}\n${res.msg}`);
  } else if (res.state === 'full') {
    run('UPDATE requests SET result_msg=?, updated_at=? WHERE id=?', res.msg, now(), req.id);
    // 같은 내용으로 밤마다 알리지 않는다
    if (req.result_msg !== res.msg) await say(`⚠️ 원하는 시간이 비어 있지 않습니다\n${where} — ${times.join(', ')}\n${res.msg}\n다음 자정에 한 번 더 시도합니다.`);
  } else {
    run('UPDATE requests SET result_msg=?, updated_at=? WHERE id=?', res.msg, now(), req.id);
  }
  return res;
}

module.exports = { loginUser, attempt, dayLabel, kstToday };
