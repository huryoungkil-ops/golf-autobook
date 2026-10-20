const test = require('node:test');
const assert = require('node:assert');
const { parseShops, parseSlots, parseForm, parseLoginResult } = require('../src/impact');

test('로그인 실패 알림을 읽는다', () => {
  const r = parseLoginResult(`<Script Language='JavaScript'>alert("비밀번호가 일치 하지 않습니다. 아이디와 비밀번호를 확인하세요.");history.go(-1);</Script>`);
  assert.equal(r.ok, false);
  assert.match(r.msg, /비밀번호가 일치/);
  assert.equal(parseLoginResult('<script>location.replace("/m_v3/")</script>').ok, true);
});

test('매장 드롭다운', () => {
  const html = `<select id="joinshop" class="x"><option value="">매장선택</option><option value="ivm080294">DMC아트포레자이</option><option value='ivm1' selected>다른 매장</option></select>`;
  assert.deepEqual(parseShops(html), [{ id: 'ivm080294', name: 'DMC아트포레자이' }, { id: 'ivm1', name: '다른 매장' }]);
});

test('시간표 주소 모으기', () => {
  const html = `<div class="modal-pop" source-file="reserve_time.php?method=confirm&amp;sday=2026-10-22&amp;ss=17:00&amp;se=17:30&amp;sid=ivm080294&amp;schidx=3565"></div>
  <div source-file="reserve_time.php?method=confirm&sday=2026-10-22&ss=9:00&se=9:30&sid=ivm080294&schidx=3566"></div>`;
  const s = parseSlots(html);
  assert.equal(s.length, 2);
  assert.equal(s[0].ss, '17:00');
  assert.equal(s[1].ss, '09:00');
  assert.equal(s[0].schidx, '3565');
});

test('확인 폼 serialize (약관 동의 포함)', () => {
  const html = `<form id="reserve-confirm"><input type="hidden" name="sday" value="2026-10-22"><input type="text" name="memo" value="">
  <input type="checkbox" id="agree" name="agree" value="Y"><input type="checkbox" name="opt" value="1">
  <select name="people"><option value="1">1</option><option value="2" selected>2</option></select><button type="button">예약</button></form>`;
  assert.deepEqual(parseForm(html, 'reserve-confirm'), [['sday', '2026-10-22'], ['memo', ''], ['agree', 'Y'], ['people', '2']]);
});
