// 운영자 도구 (서버에서 golf 계정으로)
//   node scripts/admin.js users            가입자 목록
//   node scripts/admin.js reset <아이디>    비밀번호를 0000 으로 초기화 (로그인 후 바꾸라고 안내)
//   node scripts/admin.js requests          대기 중인 예약
//   node scripts/admin.js logs [n]          최근 기록
//   node scripts/admin.js delete <아이디>   계정과 예약 삭제
const { all, one, run } = require('../src/db');
const { hashPw } = require('../src/secure');

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'users') {
  console.table(all('SELECT id, login, created_at, iv_id IS NOT NULL AS 임팩트, default_shop_name AS 매장, discord_url IS NOT NULL AS 디코, kakao_refresh IS NOT NULL AS 카톡, iv_err FROM users ORDER BY id'));
} else if (cmd === 'reset' && arg) {
  const u = one('SELECT id FROM users WHERE login=?', arg);
  if (!u) { console.log('없는 아이디'); process.exit(1); }
  run('UPDATE users SET pw_hash=?, fail_count=0, locked_until=NULL WHERE id=?', hashPw('0000'), u.id);
  run('DELETE FROM sessions WHERE user_id=?', u.id);
  console.log(`${arg} 비밀번호를 0000 으로 초기화했다`);
} else if (cmd === 'requests') {
  console.table(all("SELECT r.id, u.login, r.target_date, r.shop_name, r.times_json, r.status, r.result_msg FROM requests r JOIN users u ON u.id=r.user_id WHERE r.status='대기' ORDER BY r.target_date"));
} else if (cmd === 'logs') {
  for (const l of all('SELECT l.at, u.login, l.request_id, l.msg FROM logs l LEFT JOIN users u ON u.id=l.user_id ORDER BY l.id DESC LIMIT ?', Number(arg || 40)).reverse()) console.log(l.at, l.login || '-', l.request_id || '', l.msg);
} else if (cmd === 'delete' && arg) {
  const u = one('SELECT id FROM users WHERE login=?', arg);
  if (!u) { console.log('없는 아이디'); process.exit(1); }
  for (const t of ['requests', 'sessions', 'logs']) run(`DELETE FROM ${t} WHERE user_id=?`, u.id);
  run('DELETE FROM users WHERE id=?', u.id);
  require('../src/push')().forget(String(u.id)); // 기기 알림 주소·알림함도 지운다 (번호가 다시 쓰일 수 있어서)
  console.log(`${arg} 삭제`);
} else {
  console.log('사용: users | reset <아이디> | requests | logs [n] | delete <아이디>');
}
