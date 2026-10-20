// 자정 예약 작업. systemd 타이머가 23:58:30 에 띄운다 (deploy/golf-midnight.timer).
//   23:58:30 대기 중인 예약을 모아 사람별로 임팩트비전에 미리 로그인
//   00:01:00 — 모두 동시에 예약 시도 (START_DELAY_SEC, 정각 직후 혼잡 피함). 거절되면 FULL_RETRIES 번 더. 시간표가 아직 안 열렸으면 OPEN_WAIT_SEC 동안 2초마다 다시 본다
//   끝나면 운영자 디스코드에 요약
// 손으로 돌리기: node src/job.js --now   (기다리지 않고 바로, 오늘 날짜 기준)
const { all, run, now, log } = require('./db');
const { OPEN_WAIT_SEC, DRY_RUN } = require('./env');
const { loginUser, attempt, dayLabel, kstToday } = require('./booker');
const notify = require('./notify');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nextDay = (d) => new Date(Date.parse(d + 'T00:00:00Z') + 86400e3).toISOString().slice(0, 10);
const START_DELAY_SEC = Number(process.env.START_DELAY_SEC || 60);
const FULL_RETRIES = Number(process.env.FULL_RETRIES || 2);
const NOW_MODE = process.argv.includes('--now');

async function main() {
  const kstHour = new Date(Date.now() + 9 * 3600e3).getUTCHours();
  // 저녁에 시작했으면 내일이 «오늘», 자정 넘어 시작했으면(지연) 오늘
  const openDay = NOW_MODE || kstHour < 12 ? kstToday(0) : kstToday(1);
  const midnight = Date.parse(`${openDay}T00:00:00+09:00`) + START_DELAY_SEC * 1000; // 사용자 요청(10-21): 정각 말고 00:01

  // 지난 날짜는 닫는다
  for (const r of all("SELECT * FROM requests WHERE status='대기' AND target_date < ?", openDay)) {
    run("UPDATE requests SET status='실패', result_msg=?, updated_at=? WHERE id=?", '날짜가 지남', now(), r.id);
  }
  const reqs = all("SELECT * FROM requests WHERE status='대기' AND target_date >= ? ORDER BY target_date, id", openDay);
  console.log(`[${now()}] 대상 ${reqs.length}건, 기준일 ${openDay}${DRY_RUN ? ' (시험 모드)' : ''}`);
  if (!reqs.length) return;

  const byUser = new Map();
  for (const r of reqs) (byUser.get(r.user_id) || byUser.set(r.user_id, []).get(r.user_id)).push(r);

  // 1) 미리 로그인
  const sessions = new Map();
  const loginFails = [];
  await Promise.all([...byUser.keys()].map(async (uid) => {
    const user = all('SELECT * FROM users WHERE id=?', uid)[0];
    try {
      const r = await loginUser(user);
      if (r.ok) sessions.set(uid, r.session);
      else { loginFails.push(`${user.login}: ${r.msg}`); await notify.toUser(user, `🚫 임팩트비전 로그인 실패 — 오늘 자정 예약을 못 했습니다\n${r.msg}\n사이트에서 임팩트비전 계정을 확인해 주세요.`); }
    } catch (e) { loginFails.push(`${user.login}: ${e.message}`); }
  }));

  // 2) 정각까지 기다림
  if (!NOW_MODE) {
    const wait = midnight - Date.now();
    if (wait > 0) { console.log(`정각까지 ${(wait / 1000).toFixed(1)}초 대기`); await sleep(wait); }
  }

  // 3) 사람별 동시에, 한 사람 안에서는 날짜 순서대로
  const results = [];
  await Promise.all([...sessions].map(async ([uid, session]) => {
    for (const req of byUser.get(uid)) {
      const final = req.target_date === openDay;
      // 막 열릴 날짜(오늘·내일)만 몇 초마다 다시 본다. 더 먼 날짜는 한 번 보고 다음 밤으로
      const canWait = req.target_date <= nextDay(openDay);
      const started = Date.now();
      let res;
      let fullTries = 0; // 거절(«full»)돼도 FULL_RETRIES 번 더 다시 본다 — 순간 혼잡·일시 오류로 튕겼을 수 있어서
      for (;;) {
        const timeUp = !canWait || Date.now() >= started + OPEN_WAIT_SEC * 1000;
        const lastFull = fullTries >= FULL_RETRIES;
        // 중간 시도의 실패는 알리지 않고, 마지막 시도 결과만 알린다 (성공은 언제든 바로 알림)
        res = await attempt(session, req, { final, lastTry: timeUp, quietFail: !(timeUp || lastFull) });
        if (res.state === 'booked' || timeUp) break;
        if (res.state === 'full') {
          if (lastFull) break;
          fullTries++;
          log(uid, req.id, `거절 — ${fullTries}번째 재시도 예정`);
        }
        if (res.state === 'error') {
          // 세션이 끊겼을 수 있다 → 다시 로그인
          const user = all('SELECT * FROM users WHERE id=?', uid)[0];
          const re = await loginUser(user).catch(() => ({ ok: false }));
          if (re.ok) session = re.session;
        }
        await sleep(2000);
      }
      results.push(`${dayLabel(req.target_date)} ${req.shop_name} [${JSON.parse(req.times_json).join(',')}] → ${res.state === 'booked' ? '✅ ' + res.time : res.state + ' ' + (res.msg || '').slice(0, 80)}`);
      log(uid, req.id, `자정 작업 결과 ${res.state}`);
    }
  }));

  const summary = `🌙 임팩트비전 자동예약 ${openDay} 자정 결과${DRY_RUN ? ' (시험 모드)' : ''}\n` + results.join('\n') + (loginFails.length ? `\n로그인 실패: ${loginFails.join(' / ')}` : '');
  console.log(summary);
  await notify.owner(summary);
}

main().catch(async (e) => {
  console.error(e);
  await notify.owner(`🔥 임팩트비전 자동예약 자정 작업 오류: ${e.message}`);
  process.exit(1);
});
