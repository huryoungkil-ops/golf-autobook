/* «이 기기에서 알림 받기» 상자와 알림함 — 경매알리미 · 골프예약 · 가게쇼츠 공용 (세 곳을 똑같이 맞출 것)
 * 쓰는 법:
 *   <div id="push-box"></div> <script src="/push-client.js"></script>
 *   PushBox.mount(document.getElementById('push-box'), cfg)   // 켜기·끄기·테스트 버튼
 *   PushBox.inbox(document.getElementById('inbox'), cfg)      // 받은 알림 목록 + 모두 읽음 처리
 *   PushBox.unread(cfg).then(n => ...)                        // 안 읽은 알림 수
 * cfg: { api: '/push',            서버 주소 앞부분 (POST {api}/subscribe 처럼 부른다)
 *        sw: '/sw.js',            서비스워커 파일
 *        auth: { token: '...' },  요청 본문에 같이 실어 보낼 값 (쿠키로 로그인하는 사이트는 비워 둔다)
 *        headers: { ... } }       요청에 붙일 헤더
 */
(function () {
  'use strict';
  var STYLE = ''
    + '.pb-box{font-size:14px;line-height:1.6}'
    + '.pb-title{font-weight:700;font-size:15px;margin:0 0 2px}'
    + '.pb-desc{color:#78716c;margin:0 0 12px}'
    + '.pb-btn{display:inline-block;border:0;border-radius:10px;padding:11px 18px;font:inherit;font-weight:700;cursor:pointer;'
    + 'background:var(--pb-accent,#1c1917);color:var(--pb-accent-text,#fff);margin:0 8px 8px 0}'
    + '.pb-btn:disabled{opacity:.5;cursor:default}'
    + '.pb-btn.pb-sub{background:transparent;color:inherit;border:1px solid #d6d3d1;font-weight:500}'
    + '.pb-state{margin:0 0 10px;font-weight:600}'
    + '.pb-msg{margin:4px 0 0;color:#57534e;font-size:13px}'
    + '.pb-warn{background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:10px 12px;color:#9a3412;font-size:13px}'
    + '.pb-list{list-style:none;margin:0;padding:0}'
    + '.pb-item{background:var(--pb-card,#fff);border:1px solid #e7e5e4;border-radius:14px;padding:14px 18px;margin:0 0 10px;color:#44403c}'
    + '.pb-item.pb-new{border-color:var(--pb-accent,#1c1917);box-shadow:inset 3px 0 0 var(--pb-accent,#1c1917)}'
    + '.pb-item a{color:inherit;text-decoration:none;display:block}'
    + '.pb-ititle{font-weight:700;font-size:13px;color:#78716c;margin:0 0 2px}'
    + '.pb-ibody{white-space:pre-line;word-break:break-word}'
    + '.pb-time{color:#a8a29e;font-size:13px;margin-top:4px}'
    + '.pb-head{display:flex;justify-content:space-between;align-items:baseline;margin:0 0 14px}'
    + '.pb-head h2{margin:0;font-size:22px}'
    + '.pb-readall{background:none;border:0;padding:0;font:inherit;color:#57534e;text-decoration:underline;cursor:pointer}'
    + '.pb-empty{color:#a8a29e;padding:30px 0;text-align:center}';
  function css() {
    if (document.getElementById('pb-style')) return;
    var s = document.createElement('style'); s.id = 'pb-style'; s.textContent = STYLE; document.head.appendChild(s);
  }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function call(cfg, action, data) {
    var body = Object.assign({}, cfg.auth || {}, data || {});
    return fetch((cfg.api || '/push') + '/' + action, {
      method: 'POST', credentials: 'same-origin',
      headers: Object.assign({ 'Content-Type': 'application/json' }, cfg.headers || {}),
      body: JSON.stringify(body),
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j._status = r.status; return j; }); });
  }
  function keyBytes(k) {
    var p = '='.repeat((4 - k.length % 4) % 4), s = atob((k + p).replace(/-/g, '+').replace(/_/g, '/')), a = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
    return a;
  }
  var ua = navigator.userAgent || '';
  var isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var inApp = /KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|Line\/|DaumApps|everytimeApp/i.test(ua);
  var standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  var supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  function reg(cfg) { return navigator.serviceWorker.getRegistration(cfg.sw || '/sw.js'); }
  function currentSub(cfg) { return reg(cfg).then(function (r) { return r ? r.pushManager.getSubscription() : null; }); }

  function mount(el, cfg) {
    if (!el) return;
    cfg = cfg || {};
    css();
    var state = 'loading', busy = false, msg = '';
    function render() {
      var h = '<div class="pb-box"><p class="pb-title">휴대폰 · PC 알림</p><p class="pb-desc">켜 두면 사이트를 열어 두지 않아도 이 기기로 알림이 옵니다.</p>';
      if (state === 'loading') h += '<p class="pb-msg">확인하는 중…</p>';
      else if (state === 'in-app') h += '<p class="pb-warn">카카오톡·네이버 같은 앱 <b>안</b>에서 연 화면에서는 알림을 켤 수 없습니다.<br>오른쪽 위 메뉴에서 <b>「다른 브라우저로 열기」</b>를 눌러 크롬이나 사파리로 열어 주세요.</p>';
      else if (state === 'needs-install') h += '<p class="pb-warn">아이폰·아이패드는 <b>홈 화면에 추가</b>한 뒤에 알림을 켤 수 있습니다.<br>사파리 아래쪽 <b>공유 버튼(□↑)</b> → <b>「홈 화면에 추가」</b> → 홈 화면에 생긴 아이콘으로 열고 이 버튼을 다시 눌러 주세요. (iOS 16.4 이상)</p>';
      else if (state === 'unsupported') h += '<p class="pb-warn">이 브라우저는 알림을 지원하지 않습니다. 크롬·엣지·사파리 최신 버전으로 열어 주세요.</p>';
      else if (state === 'blocked') h += '<p class="pb-warn">이 사이트의 알림이 <b>차단</b>되어 있습니다.<br>주소창 왼쪽 자물쇠(또는 ⓘ) → <b>알림 → 허용</b>으로 바꾼 뒤 새로고침해 주세요. 휴대폰은 브라우저 설정 → 사이트 설정 → 알림에서 바꿀 수 있습니다.</p>';
      else if (state === 'on') h += '<p class="pb-state">✅ 이 기기로 알림을 받고 있습니다.</p>'
        + '<button class="pb-btn" data-a="test"' + (busy ? ' disabled' : '') + '>테스트 알림 보내기</button>'
        + '<button class="pb-btn pb-sub" data-a="off"' + (busy ? ' disabled' : '') + '>이 기기 알림 끄기</button>';
      else h += '<button class="pb-btn" data-a="on"' + (busy ? ' disabled' : '') + '>' + (busy ? '켜는 중…' : '이 기기에서 알림 받기') + '</button>';
      if (msg) h += '<p class="pb-msg">' + esc(msg) + '</p>';
      el.innerHTML = h + '</div>';
    }
    el.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-a]');
      if (!b || busy) return;
      var a = b.getAttribute('data-a');
      if (a === 'on') turnOn(); else if (a === 'off') turnOff(); else if (a === 'test') test();
    });
    function wrap(p) { busy = true; msg = ''; render(); return p.catch(function (e) { msg = (e && e.message) || '잠시 뒤에 다시 시도해 주세요.'; }).then(function () { busy = false; render(); }); }
    function turnOn() {
      return wrap(Notification.requestPermission().then(function (perm) {
        if (perm !== 'granted') { state = perm === 'denied' ? 'blocked' : 'off'; if (perm !== 'denied') msg = '알림 허용을 눌러야 켜집니다.'; return; }
        return Promise.all([navigator.serviceWorker.register(cfg.sw || '/sw.js'), call(cfg, 'key')]).then(function (x) {
          var r = x[0], k = x[1];
          if (!k.publicKey) throw new Error(k.error || '서버에서 알림 열쇠를 받지 못했습니다.');
          return navigator.serviceWorker.ready.then(function () { return r.pushManager.getSubscription(); }).then(function (old) {
            // 서버 열쇠가 바뀌었으면 예전 구독을 버리고 새로 만든다
            if (old) return old.unsubscribe();
          }).then(function () { return r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(k.publicKey) }); });
        }).then(function (sub) { return call(cfg, 'subscribe', { subscription: sub.toJSON() }); }).then(function (j) {
          if (!j.ok) throw new Error(j.error || '등록하지 못했습니다.');
          state = 'on'; msg = '이 기기로 알림을 받습니다. 「테스트 알림 보내기」로 확인해 보세요.';
          if (typeof cfg.onChange === 'function') cfg.onChange(true);
        });
      }).catch(function (e) { state = Notification.permission === 'denied' ? 'blocked' : 'off'; throw new Error('알림을 켜지 못했습니다. ' + ((e && e.message) || '')); }));
    }
    function turnOff() {
      return wrap(currentSub(cfg).then(function (s) {
        if (!s) return;
        return call(cfg, 'unsubscribe', { endpoint: s.endpoint }).then(function () { return s.unsubscribe(); });
      }).then(function () { state = 'off'; msg = '이 기기에서 알림을 껐습니다.'; if (typeof cfg.onChange === 'function') cfg.onChange(false); }));
    }
    function test() {
      return wrap(call(cfg, 'test').then(function (j) {
        if (j._status === 401) throw new Error(j.error || '로그인이 필요합니다.');
        if (!j.devices) { msg = '등록된 기기가 없습니다. 알림을 껐다가 다시 켜 주세요.'; return; }
        msg = j.ok ? '테스트 알림을 보냈습니다 (기기 ' + j.devices + '대). 몇 초 안에 알림이 떠야 합니다. 알림이 안 뜨면 휴대폰 «방해 금지»·브라우저 알림 설정을 확인해 주세요.'
          : '알림 서버로 보내지 못했습니다. 알림을 껐다가 다시 켜 주세요.';
        if (typeof cfg.onTest === 'function') cfg.onTest(j);
      }));
    }
    render();
    if (inApp) { state = 'in-app'; return render(); }
    if (!supported) { state = isIOS && !standalone ? 'needs-install' : 'unsupported'; return render(); }
    if (Notification.permission === 'denied') { state = 'blocked'; return render(); }
    currentSub(cfg).then(function (s) {
      state = s && Notification.permission === 'granted' ? 'on' : 'off';
      // 켜져 있으면 서버에 다시 알려 둔다 (다른 아이디로 로그인했거나 서버가 주소를 잃었을 때 맞춰진다)
      if (s && state === 'on') call(cfg, 'subscribe', { subscription: s.toJSON() }).catch(function () {});
      render();
    }).catch(function () { state = 'off'; render(); });
  }

  function fmt(iso) {
    var d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleString('ko-KR', { year: '2-digit', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  function inbox(el, cfg) {
    if (!el) return;
    cfg = cfg || {};
    css();
    function load() {
      return call(cfg, 'notices').then(function (j) {
        if (!j.ok) { el.innerHTML = '<p class="pb-empty">' + esc(j.error || '알림을 불러오지 못했습니다.') + '</p>'; return; }
        var h = '<div class="pb-head"><h2>알림</h2>' + (j.unread ? '<button class="pb-readall" data-a="read-all">모두 읽음 처리</button>' : '') + '</div>';
        if (!j.items.length) h += '<p class="pb-empty">받은 알림이 없습니다.</p>';
        else {
          h += '<ul class="pb-list">';
          j.items.forEach(function (it) {
            var inner = (it.title ? '<p class="pb-ititle">' + esc(it.title) + '</p>' : '') + '<div class="pb-ibody">' + esc(it.body) + '</div><div class="pb-time">' + esc(fmt(it.created_at)) + '</div>';
            var link = it.url && /^\/(?!\/)/.test(it.url) && it.url !== location.pathname + location.search;
            h += '<li class="pb-item' + (it.read_at ? '' : ' pb-new') + '">' + (link ? '<a href="' + esc(it.url) + '">' + inner + '</a>' : inner) + '</li>';
          });
          h += '</ul>';
        }
        el.innerHTML = h;
        if (typeof cfg.onLoad === 'function') cfg.onLoad(j);
      }).catch(function () { el.innerHTML = '<p class="pb-empty">알림을 불러오지 못했습니다.</p>'; });
    }
    el.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-a="read-all"]');
      if (!b) return;
      b.disabled = true;
      call(cfg, 'read-all').then(load);
    });
    el.innerHTML = '<p class="pb-empty">불러오는 중…</p>';
    return load();
  }
  function unread(cfg) { return call(cfg || {}, 'notices').then(function (j) { return j.ok ? j.unread : 0; }).catch(function () { return 0; }); }

  window.PushBox = { mount: mount, inbox: inbox, unread: unread };
})();
