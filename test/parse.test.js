const test = require('node:test');
const assert = require('node:assert');
const { parseShops, parseSlots, parseForm, parseConfirm, pickBay, bayKey, parseLoginResult } = require('../src/impact');

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

// 2026-10-20 실제 화면에서 줄인 것
const REAL_LIST = `<div class="reserve-list">
<div class="reserve-box " style='background:#CFCFCF;color:#FFF;' data-modal="modal-dynamic" title="예약내역확인" source-file="reserve_time.php?method=confirm&sday=2026-10-21&ss=19:00&se=20:00&sid=ivm031169&schidx=9807">
 <div style="float:left;"><div class="reserve-time">19:00</div><div class="reserve-day">(수) 2026-10-21</div></div>
 <div class="circle-reserve" style='color:#FFF !important;' title="LOCK|9807|1">
  잠금 </div>
</div>
<div class="reserve-box " source-file="reserve_time.php?method=confirm&sday=2026-10-21&ss=20:00&se=21:00&sid=ivm031169&schidx=9808">
 <div class="circle-reserve" title="OPEN|9808|1">예약</div>
</div></div>`;
const REAL_CONFIRM = `<form id="reserve-confirm">
 <input type="hidden" name="rsv_type" value="EX"><input type="hidden" name="rsv_sid" value="ivm031169"><input type="hidden" name="rsv_sch_idx" value="9807">
 <input type="hidden" name="mb_pre_client" value="y"><input type="hidden" name="rsv_date" value="2026-10-21 19:00">
 <select id="client_info" name="client_info" style="border-radius:10px;">
 <option value="3090|0">1번 <br/></option><option value="3091|1">2번 <br/></option><option value="3094|4">5번 우타<br/></option>
 </select>
 <select id="rsv_pay_idx" name="rsv_pay_idx" onchange="chk_lesson()"><option value="0" selected>이용권 선택</option><option value="386694">이용권 ] 잔여 : 993 회(~2300-01-01)</option></select>
 <input type="checkbox" id="agree"><label for="agree"></label> 위 예약 안내 약관에 동의합니다.
 <button id="reserve-ok" type="button">예약확인</button></form>`;

test('실제 시간표: 잠금 구분', () => {
  const s = parseSlots(REAL_LIST);
  assert.equal(s.length, 2);
  assert.deepEqual([s[0].ss, s[0].locked, s[0].code], ['19:00', true, 'LOCK']);
  assert.deepEqual([s[1].ss, s[1].locked, s[1].closed], ['20:00', false, false]);
});

test('실제 확인 창: 타석·이용권', () => {
  const c = parseConfirm(REAL_CONFIRM);
  assert.deepEqual(c.bays.map((b) => b.name), ['1번', '2번', '5번 우타']);
  assert.equal(c.passes[0].value, '386694');
  const f = parseForm(REAL_CONFIRM, 'reserve-confirm');
  assert.deepEqual(f.map(([k]) => k), ['rsv_type', 'rsv_sid', 'rsv_sch_idx', 'mb_pre_client', 'rsv_date', 'client_info', 'rsv_pay_idx']);
  assert.equal(bayKey('5번 우타'), '5');
  assert.equal(pickBay(c.bays, ['5번 우타']).value, '3094|4');
  assert.equal(pickBay(c.bays, ['4번'], false), null);
  assert.equal(pickBay(c.bays, ['4번'], true).value, '3090|0');
});

test('예약 흐름: 잠긴 시간은 건너뛰고, 선호 타석·이용권을 넣어 보낸다', async () => {
  const { ImpactSession } = require('../src/impact');
  const s = new ImpactSession('t');
  const sent = [];
  s.snap = () => {};
  s.req = async (url, o = {}) => {
    if (url.includes('reserve.php')) return { text: REAL_LIST };
    if (url.includes('reserve_time.php')) return { text: REAL_CONFIRM };
    if (url.includes('reserve_exe.php')) { sent.push(new URLSearchParams(o.body)); return { text: '{"result":"T","msg":"ok"}' }; }
    throw new Error(url);
  };
  const r = await s.book('ivm031169', '2026-10-21', ['19:00', '20:00'], { bays: ['5번'] });
  assert.equal(r.state, 'booked');
  assert.equal(r.time, '20:00');
  assert.equal(r.bay, '5번 우타');
  assert.equal(sent[0].get('client_info'), '3094|4');
  assert.equal(sent[0].get('rsv_pay_idx'), '386694');
  // 원하는 시간이 모두 잠금이면 «안 열림»
  const r2 = await s.book('ivm031169', '2026-10-21', ['19:00']);
  assert.equal(r2.state, 'notopen');
});

test('확인 폼 serialize (약관 동의 포함)', () => {
  const html = `<form id="reserve-confirm"><input type="hidden" name="sday" value="2026-10-22"><input type="text" name="memo" value="">
  <input type="checkbox" id="agree" name="agree" value="Y"><input type="checkbox" name="opt" value="1">
  <select name="people"><option value="1">1</option><option value="2" selected>2</option></select><button type="button">예약</button></form>`;
  assert.deepEqual(parseForm(html, 'reserve-confirm'), [['sday', '2026-10-22'], ['memo', ''], ['agree', 'Y'], ['people', '2']]);
});
