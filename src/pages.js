// 화면 HTML. 외부 자원은 글꼴(Pretendard, jsdelivr) 하나뿐.
const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const NAME = '임팩트비전 자동예약';

const BASE_CSS = `
@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css');
:root{--bg:#06110c;--bg2:#0b1d14;--card:#0f241a;--line:#1d3a2b;--text:#eef6f0;--mute:#9db5a6;--green:#2fe08a;--green2:#14b86a;--lime:#c8ff4d;--gold:#ffd166;--red:#ff6b6b}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--text);font-family:Pretendard,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;-webkit-text-size-adjust:100%;word-break:keep-all}
a{color:var(--green)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:14px 22px;border-radius:14px;border:0;font:inherit;font-weight:700;font-size:16px;cursor:pointer;text-decoration:none;transition:transform .15s,box-shadow .15s,background .15s}
.btn-main{background:linear-gradient(135deg,var(--lime),var(--green));color:#05210f;box-shadow:0 10px 30px -8px rgba(47,224,138,.6)}
.btn-main:hover{transform:translateY(-2px);box-shadow:0 16px 40px -8px rgba(47,224,138,.75)}
.btn-ghost{background:rgba(255,255,255,.06);color:var(--text);border:1px solid rgba(255,255,255,.14)}
.btn-ghost:hover{background:rgba(255,255,255,.12)}
.btn-sm{padding:9px 14px;font-size:14px;border-radius:10px}
.btn-red{background:rgba(255,107,107,.12);color:#ffb3b3;border:1px solid rgba(255,107,107,.35)}
input,select{font:inherit;font-size:16px;color:var(--text);background:#0a1a12;border:1px solid var(--line);border-radius:12px;padding:12px 14px;width:100%;outline:none}
input:focus,select:focus{border-color:var(--green);box-shadow:0 0 0 3px rgba(47,224,138,.18)}
label{display:block;font-size:13px;color:var(--mute);margin:12px 0 6px}
`;

// 탭 아이콘: 초록 잔디 위 깃발과 골프공
const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3bea95"/><stop offset="1" stop-color="#0a6a3e"/></linearGradient>
<radialGradient id="b" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#fff"/><stop offset=".7" stop-color="#eef3ef"/><stop offset="1" stop-color="#b9cbbf"/></radialGradient></defs>
<rect width="64" height="64" rx="15" fill="url(#g)"/>
<ellipse cx="38" cy="51" rx="15" ry="4" fill="#063a22" opacity=".55"/>
<rect x="36" y="10" width="3.2" height="41" rx="1.6" fill="#fff"/>
<path d="M39.2 10.5 L55 17 L39.2 23.5 Z" fill="#ff5d5d"/>
<circle cx="20" cy="45" r="9.5" fill="url(#b)"/>
<g fill="#c3d2c8"><circle cx="16.5" cy="42" r="1.3"/><circle cx="21" cy="40.5" r="1.3"/><circle cx="24.5" cy="44" r="1.3"/><circle cx="19" cy="46" r="1.3"/><circle cx="16" cy="48.5" r="1.3"/><circle cx="22.5" cy="49.5" r="1.3"/></g>
</svg>`;
const ICON_URI = 'data:image/svg+xml,' + encodeURIComponent(ICON_SVG.replace(/\n/g, ''));

function shell(title, body, { css = '', script = '' } = {}) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title><meta name="theme-color" content="#06110c">
<meta name="description" content="미리 적어둔 날짜와 시간으로, 자정 정각에 임팩트비전 예약을 대신 잡아 드립니다.">
<link rel="icon" href="${ICON_URI}"><link rel="apple-touch-icon" href="/icon.svg">
<style>${BASE_CSS}${css}</style></head><body>${body}${script ? `<script>${script}</script>` : ''}</body></html>`;
}

// ── 랜딩 ──────────────────────────────────────────────────────────

const LANDING_CSS = `
body{overflow-x:hidden}
.sky{position:fixed;inset:0;z-index:-2;background:
 radial-gradient(1200px 600px at 80% -10%,rgba(47,224,138,.18),transparent 60%),
 radial-gradient(900px 500px at -10% 30%,rgba(200,255,77,.08),transparent 60%),
 linear-gradient(180deg,#040c08 0%,#06110c 40%,#081a11 100%)}
.stars{position:fixed;inset:0;z-index:-1;pointer-events:none;background-image:
 radial-gradient(1.5px 1.5px at 12% 18%,#fff8,transparent),radial-gradient(1px 1px at 28% 8%,#fff6,transparent),
 radial-gradient(1.5px 1.5px at 44% 22%,#fff5,transparent),radial-gradient(1px 1px at 63% 12%,#fff7,transparent),
 radial-gradient(1.5px 1.5px at 78% 28%,#fff5,transparent),radial-gradient(1px 1px at 90% 6%,#fff8,transparent),
 radial-gradient(1px 1px at 6% 40%,#fff4,transparent),radial-gradient(1px 1px at 52% 36%,#fff4,transparent);animation:tw 6s ease-in-out infinite alternate}
@keyframes tw{from{opacity:.5}to{opacity:1}}
.wrap{max-width:1120px;margin:0 auto;padding:0 20px}
nav{display:flex;align-items:center;justify-content:space-between;padding:18px 0}
.logo{display:flex;align-items:center;gap:10px;font-weight:800;font-size:18px;letter-spacing:-.02em;color:var(--text);text-decoration:none}
.logo .ball{width:28px;height:28px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff,#d6e4da 60%,#9fb5a7);box-shadow:0 0 18px rgba(200,255,77,.45)}
.hero{display:grid;grid-template-columns:1.15fr .85fr;gap:48px;align-items:center;padding:56px 0 80px}
.pill{display:inline-flex;align-items:center;gap:8px;padding:7px 14px;border-radius:999px;background:rgba(47,224,138,.1);border:1px solid rgba(47,224,138,.35);color:var(--green);font-size:13px;font-weight:700}
.pill .dot{width:8px;height:8px;border-radius:50%;background:var(--green);box-shadow:0 0 0 0 rgba(47,224,138,.7);animation:pulse 1.8s infinite}
@keyframes pulse{70%{box-shadow:0 0 0 10px rgba(47,224,138,0)}100%{box-shadow:0 0 0 0 rgba(47,224,138,0)}}
h1{font-size:clamp(38px,6.2vw,68px);line-height:1.08;letter-spacing:-.04em;margin:22px 0 18px;font-weight:900}
h1 .hl{background:linear-gradient(90deg,var(--lime),var(--green) 60%,#5ef0ff);-webkit-background-clip:text;background-clip:text;color:transparent}
.lead{font-size:clamp(16px,2vw,19px);line-height:1.7;color:var(--mute);max-width:560px}
.cta{display:flex;gap:12px;flex-wrap:wrap;margin-top:30px}
.count{margin-top:34px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;color:var(--mute);font-size:14px}
.digits{display:flex;gap:6px;font-variant-numeric:tabular-nums}
.digits b{display:inline-block;min-width:54px;text-align:center;padding:10px 8px;border-radius:12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);font-size:26px;color:var(--text);font-weight:800}
.digits i{font-style:normal;font-size:24px;color:var(--mute);align-self:center}
/* 휴대폰 */
.phone-wrap{position:relative;display:flex;justify-content:center}
.glow{position:absolute;width:380px;height:380px;border-radius:50%;background:radial-gradient(circle,rgba(47,224,138,.35),transparent 65%);filter:blur(20px);top:40px}
.phone{position:relative;width:300px;height:600px;border-radius:46px;padding:14px;background:linear-gradient(160deg,#1c2b23,#0a130e);box-shadow:0 40px 80px -20px rgba(0,0,0,.8),inset 0 0 0 1.5px rgba(255,255,255,.08);animation:float 6s ease-in-out infinite}
@keyframes float{50%{transform:translateY(-12px) rotate(-1deg)}}
.screen{position:relative;height:100%;border-radius:34px;overflow:hidden;background:linear-gradient(180deg,#0b1f3a 0%,#132c4c 55%,#1d3b2c 100%)}
.notch{position:absolute;top:10px;left:50%;transform:translateX(-50%);width:96px;height:26px;border-radius:20px;background:#000}
.lock-time{text-align:center;color:#fff;margin-top:64px;font-weight:300;font-size:64px;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.lock-date{text-align:center;color:#dfe9ff;font-size:14px;margin-top:2px}
.moon{position:absolute;right:28px;top:52px;width:22px;height:22px;border-radius:50%;box-shadow:-6px 4px 0 0 #fff3b0;transform:rotate(-20deg)}
.zz{position:absolute;left:30px;top:150px;color:#ffffff66;font-weight:800;animation:zz 3s ease-in-out infinite}
@keyframes zz{0%{opacity:0;transform:translateY(8px)}50%{opacity:1}100%{opacity:0;transform:translateY(-14px)}}
.notis{position:absolute;left:12px;right:12px;top:232px;display:flex;flex-direction:column;gap:10px}
.noti{border-radius:20px;padding:12px 14px;background:rgba(255,255,255,.14);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);color:#fff;font-size:13px;line-height:1.45;opacity:0;transform:translateY(16px) scale(.97);animation:pop .7s cubic-bezier(.2,.9,.3,1.2) forwards}
.noti .h{display:flex;justify-content:space-between;font-size:11px;color:#ffffffaa;margin-bottom:4px}
.noti .h b{color:#fff;font-weight:700}
.noti.n0{animation-delay:.6s}.noti.n1{animation-delay:1.6s}.noti.n2{animation-delay:2.8s}
@keyframes pop{to{opacity:1;transform:none}}
.noti .ok{color:var(--lime);font-weight:800}
/* 섹션 */
section{padding:84px 0}
.eyebrow{color:var(--green);font-weight:800;font-size:13px;letter-spacing:.12em}
h2{font-size:clamp(28px,4vw,42px);letter-spacing:-.03em;line-height:1.2;margin:10px 0 14px}
.sub{color:var(--mute);font-size:17px;line-height:1.7;max-width:640px}
.pain{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:36px}
.pain div{padding:22px;border-radius:18px;background:rgba(255,107,107,.05);border:1px solid rgba(255,107,107,.18);color:#ffd3d3;font-size:15px;line-height:1.6}
.pain div b{display:block;font-size:28px;margin-bottom:6px}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:40px}
.feat{position:relative;padding:26px;border-radius:22px;background:linear-gradient(180deg,rgba(255,255,255,.045),rgba(255,255,255,.015));border:1px solid rgba(255,255,255,.08);transition:transform .2s,border-color .2s}
.feat:hover{transform:translateY(-4px);border-color:rgba(47,224,138,.45)}
.feat .ic{width:48px;height:48px;border-radius:14px;display:grid;place-items:center;font-size:24px;background:rgba(47,224,138,.12);border:1px solid rgba(47,224,138,.3);margin-bottom:16px}
.feat h3{margin:0 0 8px;font-size:19px;letter-spacing:-.02em}
.feat p{margin:0;color:var(--mute);line-height:1.65;font-size:15px}
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:40px;counter-reset:s}
.step{padding:28px 24px;border-radius:22px;background:var(--card);border:1px solid var(--line);position:relative}
.step:before{counter-increment:s;content:counter(s);position:absolute;top:-18px;left:24px;width:40px;height:40px;border-radius:50%;display:grid;place-items:center;font-weight:900;background:linear-gradient(135deg,var(--lime),var(--green));color:#05210f}
.step h3{margin:12px 0 8px;font-size:18px}
.step p{margin:0;color:var(--mute);line-height:1.65;font-size:15px}
.timeline{margin-top:44px;padding:26px;border-radius:22px;background:#08160f;border:1px solid var(--line);font-variant-numeric:tabular-nums}
.tl{display:grid;grid-template-columns:110px 1fr;gap:14px;padding:12px 0;border-bottom:1px dashed #1d3a2b;align-items:center}
.tl:last-child{border-bottom:0}
.tl .t{font-weight:900;font-size:20px;color:var(--lime)}
.tl .d{color:var(--text);font-size:15px}
.tl .d span{color:var(--mute)}
.final{text-align:center;padding:72px 24px;border-radius:32px;margin:40px 0 80px;background:
 radial-gradient(600px 240px at 50% 0%,rgba(200,255,77,.18),transparent 70%),linear-gradient(180deg,#0f2a1c,#0a1b12);border:1px solid rgba(47,224,138,.3)}
.final h2{margin-top:0}
footer{color:#6f8a7a;font-size:13px;line-height:1.7;padding:30px 0 50px;border-top:1px solid #12291d}
.reveal{opacity:0;transform:translateY(24px);transition:opacity .8s,transform .8s}
.reveal.on{opacity:1;transform:none}
@media (max-width:900px){.hero{grid-template-columns:1fr;padding-top:28px}.phone-wrap{margin-top:10px}.grid,.steps,.pain{grid-template-columns:1fr}}
@media (max-width:420px){.digits b{min-width:46px;font-size:22px}.phone{width:270px;height:540px}}
`;

const LANDING_JS = `
function pad(n){return String(n).padStart(2,'0')}
function kstNow(){return new Date(Date.now()+9*3600e3)}
function tick(){
  var n=kstNow();var left=86400-(n.getUTCHours()*3600+n.getUTCMinutes()*60+n.getUTCSeconds());
  var h=Math.floor(left/3600),m=Math.floor(left%3600/60),s=left%60;
  var el=document.getElementById('cd');if(el)el.innerHTML='<b>'+pad(h)+'</b><i>:</i><b>'+pad(m)+'</b><i>:</i><b>'+pad(s)+'</b>';
}
tick();setInterval(tick,1000);
var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('on');io.unobserve(e.target)}})},{threshold:.15});
document.querySelectorAll('.reveal').forEach(function(el){io.observe(el)});
`;

function landing({ loggedIn }) {
  const go = loggedIn ? '/app' : '/login';
  const goText = loggedIn ? '내 예약 보러 가기' : '무료로 시작하기';
  const body = `
<div class="sky"></div><div class="stars"></div>
<div class="wrap">
<nav><a class="logo" href="/"><span class="ball"></span>${NAME}</a>
<a class="btn btn-ghost btn-sm" href="${go}">${loggedIn ? '내 예약' : '로그인'}</a></nav>

<header class="hero">
 <div>
  <span class="pill"><span class="dot"></span>매일 밤 00:00 정각 자동 실행</span>
  <h1>잠든 사이,<br><span class="hl">황금 시간대</span>는<br>이미 내 것.</h1>
  <p class="lead">원하는 날짜와 시간을 미리 적어 두기만 하세요. 자정이 되는 순간 임팩트비전에 대신 로그인해서, 1·2·3순위 시간 중 비어 있는 자리를 잡아 드립니다. 알람도, 밤샘도 이제 필요 없어요.</p>
  <div class="cta"><a class="btn btn-main" href="${go}">⛳ ${goText}</a><a class="btn btn-ghost" href="#how">어떻게 동작하나요?</a></div>
  <div class="count">다음 자동 예약까지 <div class="digits" id="cd"></div></div>
 </div>
 <div class="phone-wrap" aria-hidden="true"><div class="glow"></div>
  <div class="phone"><div class="screen"><div class="notch"></div><div class="moon"></div><div class="zz">z z z</div>
   <div class="lock-time">00:00</div><div class="lock-date">잠든 사이 도착한 알림</div>
   <div class="notis">
   <div class="noti n0"><div class="h"><b>🔐 자동예약</b><span>23:58</span></div>임팩트비전 로그인 완료 · 정각 대기 중</div>
   <div class="noti n1"><div class="h"><b>💬 카카오톡</b><span>00:00</span></div><span class="ok">⛳ 예약 성공</span><br>목요일 19:00 · DMC 아트포레자이<br>1순위 시간으로 잡았어요</div>
   <div class="noti n2"><div class="h"><b>🎮 디스코드</b><span>00:00</span></div>🌙 오늘 밤 자동예약 3건 모두 성공<br><span style="color:#ffffffaa">다들 푹 주무세요</span></div>
   </div>
  </div></div>
 </div>
</header>

<section class="reveal">
 <div class="eyebrow">이런 적 있으시죠</div>
 <h2>예약은 자정에 열리는데,<br>우리는 그 시간에 자고 있어요.</h2>
 <div class="pain">
  <div><b>😴</b>“내일 쳐야지” 해 놓고 깜빡 잠들어 버린 밤</div>
  <div><b>⏰</b>알람 맞춰 놓고 자정까지 버티다 피곤해진 다음 날</div>
  <div><b>🚫</b>아침에 들어가 보니 원하던 시간은 이미 마감</div>
 </div>
</section>

<section class="reveal">
 <div class="eyebrow">할 수 있는 것</div>
 <h2>한 번 적어 두면, 나머지는 알아서.</h2>
 <p class="sub">처음 한 번만 설정하면 됩니다. 계정과 단골 매장은 기억해 두니, 다음부터는 날짜와 시간만 고르세요.</p>
 <div class="grid">
  <div class="feat"><div class="ic">🌙</div><h3>자정 정각 자동 예약</h3><p>23:58에 미리 로그인해 대기하다가 00:00:00에 바로 예약합니다. 사람 손보다 빠릅니다.</p></div>
  <div class="feat"><div class="ic">🥇</div><h3>1·2·3순위 시간</h3><p>19시가 이미 찼다면? 20시, 18시처럼 정해 둔 다음 순위 시간을 이어서 시도합니다.</p></div>
  <div class="feat"><div class="ic">📍</div><h3>단골 매장 기억</h3><p>가입한 매장 목록을 자동으로 불러와 드롭다운에 보여 줍니다. 한 번 고르면 바꿀 때까지 그대로예요.</p></div>
  <div class="feat"><div class="ic">🔔</div><h3>카카오톡·디스코드 알림</h3><p>성공하면 바로 알려 드리고, 못 잡았으면 그 이유까지 알려 드립니다. 아침에 확인만 하세요.</p></div>
  <div class="feat"><div class="ic">🔐</div><h3>계정은 암호화 보관</h3><p>임팩트비전 비밀번호는 암호화해서 저장하고, 예약할 때만 잠깐 풀어 씁니다. 화면에는 다시 보이지 않습니다.</p></div>
  <div class="feat"><div class="ic">👥</div><h3>함께 쓰는 사이트</h3><p>골프 메이트들도 각자 아이디로 가입해 자기 예약을 걸어 둘 수 있어요. 서로의 정보는 보이지 않습니다.</p></div>
 </div>
</section>

<section id="how" class="reveal">
 <div class="eyebrow">시작하는 법</div>
 <h2>3분이면 설정 끝.</h2>
 <div class="steps">
  <div class="step"><h3>가입하고 계정 연결</h3><p>이 사이트용 아이디·비밀번호로 가입한 뒤, 임팩트비전 아이디와 비밀번호를 한 번만 입력합니다.</p></div>
  <div class="step"><h3>매장·날짜·시간 고르기</h3><p>단골 매장을 고르고, 치고 싶은 날짜와 1~3순위 시간을 적어 두세요. 여러 날짜를 한꺼번에 걸어 둘 수 있습니다.</p></div>
  <div class="step"><h3>알림 받을 곳 연결 후 잠자기</h3><p>카카오톡이나 디스코드를 연결해 두면, 결과가 나오는 대로 바로 알려 드립니다.</p></div>
 </div>
 <div class="timeline">
  <div class="tl"><div class="t">23:58</div><div class="d">예약을 걸어 둔 모든 분의 계정으로 미리 로그인 <span>— 접속 지연 없이 대기</span></div></div>
  <div class="tl"><div class="t">00:00:00</div><div class="d">정각에 모두 동시에 예약 시도 <span>— 1순위가 찼으면 바로 2·3순위</span></div></div>
  <div class="tl"><div class="t">00:00~03</div><div class="d">시간표가 늦게 열리면 몇 초마다 다시 확인 <span>— 3분 동안</span></div></div>
  <div class="tl"><div class="t">완료</div><div class="d">카카오톡·디스코드로 결과 알림 <span>— 아침에 확인만 하세요</span></div></div>
 </div>
</section>

<div class="final reveal">
 <h2>오늘 밤부터,<br>예약은 맡기고 푹 주무세요.</h2>
 <p class="sub" style="margin:0 auto 26px">가입 후 바로 쓸 수 있습니다.</p>
 <a class="btn btn-main" href="${go}">⛳ ${goText}</a>
</div>

<footer>${NAME}은(는) 회원들이 직접 운영하는 개인 도구이며, 임팩트비전(IMPACTVISION Corp.)의 공식 서비스가 아닙니다.<br>예약은 회원 본인의 임팩트비전 계정으로 이뤄지며, 매장 사정이나 사이트 변경으로 예약이 실패할 수 있습니다.</footer>
</div>`;
  return shell(NAME, body, { css: LANDING_CSS, script: LANDING_JS });
}

// ── 로그인 ────────────────────────────────────────────────────────

const FORM_CSS = `
.box{max-width:420px;margin:0 auto;padding:48px 20px}
.card{background:var(--card);border:1px solid var(--line);border-radius:22px;padding:26px}
.logo{display:flex;align-items:center;gap:10px;font-weight:800;font-size:18px;color:var(--text);text-decoration:none;margin-bottom:26px}
.logo .ball{width:26px;height:26px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff,#d6e4da 60%,#9fb5a7);box-shadow:0 0 18px rgba(200,255,77,.4)}
h1{font-size:26px;margin:0 0 6px;letter-spacing:-.03em}
.mute{color:var(--mute);font-size:14px;line-height:1.6}
.err{background:rgba(255,107,107,.1);border:1px solid rgba(255,107,107,.35);color:#ffc9c9;border-radius:12px;padding:12px 14px;margin:14px 0;font-size:14px;line-height:1.5}
.btn{width:100%;margin-top:18px}
.warn{display:flex;gap:12px;align-items:flex-start;margin:14px 0 10px;padding:16px;border-radius:16px;background:linear-gradient(135deg,rgba(255,209,102,.18),rgba(255,140,60,.12));border:1.5px solid rgba(255,209,102,.7);box-shadow:0 0 0 4px rgba(255,209,102,.08);animation:warnin .6s ease-out}
.warn .wi{font-size:28px;line-height:1}
.warn b{display:block;color:#ffe08a;font-size:17px;letter-spacing:-.02em;margin-bottom:6px}
.warn span{color:#fff1cf;font-size:14px;line-height:1.6}
.warn u{text-decoration-color:#ffd166;text-underline-offset:3px;font-weight:700}
@keyframes warnin{0%{transform:scale(.97);opacity:0}60%{transform:scale(1.01)}100%{transform:none;opacity:1}}
.tag{font-style:normal;font-size:11px;font-weight:800;color:#ffd166;background:rgba(255,209,102,.14);border:1px solid rgba(255,209,102,.4);border-radius:999px;padding:2px 8px;margin-left:6px;vertical-align:1px}
body{background:radial-gradient(900px 400px at 50% -10%,rgba(47,224,138,.15),transparent 60%),var(--bg)}
`;

function loginPage({ error = '', login = '' } = {}) {
  const body = `<div class="box"><a class="logo" href="/"><span class="ball"></span>${NAME}</a>
<div class="card"><h1>로그인</h1>
<div class="warn"><div class="wi">⚠️</div><div><b>임팩트비전 아이디·비밀번호가 아닙니다!</b>
<span>이 사이트에서만 쓰는 <u>새 아이디와 비밀번호</u>를 정해 주세요. 임팩트비전 계정은 로그인한 다음 화면에서 따로 입력합니다.</span></div></div>
<p class="mute">처음 쓰는 아이디면 바로 가입됩니다.</p>
${error ? `<div class="err">${error}</div>` : ''}
<form method="post" action="/login" autocomplete="on">
<label for="login">이 사이트 아이디 <em class="tag">임팩트비전 아님</em></label><input id="login" name="login" value="${esc(login)}" required maxlength="20" autocomplete="username" placeholder="예: golfking">
<label for="pw">이 사이트 비밀번호 (4자 이상) <em class="tag">임팩트비전 아님</em></label><input id="pw" name="pw" type="password" required minlength="4" maxlength="64" autocomplete="current-password">
<button class="btn btn-main">들어가기</button></form>
<p class="mute" style="margin-top:18px">아이디·비밀번호를 잊으면 운영자에게 초기화를 요청해 주세요. 이메일·전화번호는 받지 않습니다.</p>
</div></div>`;
  return shell(`로그인 · ${NAME}`, body, { css: FORM_CSS });
}

function messagePage(title, html, back = '/app') {
  return shell(`${title} · ${NAME}`, `<div class="box"><a class="logo" href="/"><span class="ball"></span>${NAME}</a><div class="card"><h1>${esc(title)}</h1><div class="mute" style="font-size:15px">${html}</div><a class="btn btn-main" href="${back}">돌아가기</a></div></div>`, { css: FORM_CSS });
}

// ── 내 예약 (앱) ──────────────────────────────────────────────────

const APP_CSS = `
body{background:radial-gradient(900px 380px at 70% -10%,rgba(47,224,138,.12),transparent 60%),var(--bg)}
.wrap{max-width:760px;margin:0 auto;padding:0 16px 60px}
nav{display:flex;align-items:center;justify-content:space-between;padding:16px 0 8px;gap:10px}
.logo{display:flex;align-items:center;gap:10px;font-weight:800;font-size:17px;color:var(--text);text-decoration:none}
.logo .ball{width:24px;height:24px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff,#d6e4da 60%,#9fb5a7);box-shadow:0 0 16px rgba(200,255,77,.4)}
.who{color:var(--mute);font-size:14px;display:flex;align-items:center;gap:10px}
.hero{margin:14px 0 18px;padding:22px;border-radius:22px;background:linear-gradient(135deg,#123522,#0b2015);border:1px solid rgba(47,224,138,.3);display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}
.hero h1{margin:0;font-size:22px;letter-spacing:-.03em}
.hero p{margin:6px 0 0;color:var(--mute);font-size:14px}
.cd{font-variant-numeric:tabular-nums;font-size:30px;font-weight:900;color:var(--lime)}
.card{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:22px;margin-bottom:14px}
.card h2{margin:0 0 4px;font-size:18px;display:flex;align-items:center;gap:8px}
.card .desc{margin:0 0 6px;color:var(--mute);font-size:14px;line-height:1.6}
.row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.row3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
.ok{color:var(--green)} .bad{color:#ff9d9d} .mute{color:var(--mute)}
.flash{padding:12px 16px;border-radius:14px;margin:10px 0;font-size:15px;line-height:1.5;background:rgba(47,224,138,.1);border:1px solid rgba(47,224,138,.35)}
.flash.err{background:rgba(255,107,107,.1);border-color:rgba(255,107,107,.35);color:#ffd0d0}
.req{display:grid;grid-template-columns:1fr auto;gap:10px;padding:14px 0;border-top:1px solid var(--line);align-items:center}
.req:first-of-type{border-top:0}
.req .d{font-weight:800;font-size:16px}
.req .t{color:var(--mute);font-size:14px;margin-top:3px;line-height:1.5}
.badge{display:inline-block;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:800;margin-left:6px;vertical-align:2px}
.b-wait{background:rgba(255,209,102,.14);color:var(--gold)} .b-ok{background:rgba(47,224,138,.16);color:var(--green)}
.b-fail{background:rgba(255,107,107,.14);color:#ff9d9d} .b-cancel{background:rgba(255,255,255,.08);color:var(--mute)}
details summary{cursor:pointer;color:var(--mute);font-size:14px;margin-top:12px}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.chips span{padding:6px 10px;border-radius:10px;background:rgba(47,224,138,.1);border:1px solid rgba(47,224,138,.3);font-size:14px;font-variant-numeric:tabular-nums}
.chips span.shut{background:rgba(255,255,255,.04);border-color:var(--line);color:var(--mute)}
.chips small{font-size:11px;opacity:.8}
.spin{display:inline-block;width:14px;height:14px;border-radius:50%;border:2px solid rgba(47,224,138,.25);border-top-color:var(--green);animation:sp .8s linear infinite;vertical-align:-2px;margin-right:6px}
@keyframes sp{to{transform:rotate(360deg)}}
.card h2 .btn{font-size:13px;padding:7px 12px}
.mine{display:grid;grid-template-columns:auto 1fr auto;gap:14px;align-items:center;padding:14px 0;border-top:1px solid var(--line)}
.mine:first-child{border-top:0}
.mine .dt{width:58px;text-align:center;border-radius:14px;padding:8px 4px;background:rgba(47,224,138,.12);border:1px solid rgba(47,224,138,.35)}
.mine .dt small{display:block;font-size:12px;color:var(--mute)}
.mine .dt b{font-size:18px}
.mine.past .dt{background:rgba(255,255,255,.04);border-color:var(--line)}
.mine.past{opacity:.6}
.mine .info b{font-size:16px}
.mine .info div{color:var(--mute);font-size:13px;margin-top:3px}
label.chk{display:flex;align-items:center;gap:8px;color:var(--text);font-size:14px;margin-top:14px;cursor:pointer}
label.chk input{width:18px;height:18px;accent-color:var(--green);margin:0}
.btn-sm{padding:9px 14px;font-size:14px}
form.inline{display:inline}
.days{display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:8px}
.day{margin:0;cursor:pointer;position:relative}
.day input{position:absolute;inset:0;width:100%;height:100%;opacity:0;pointer-events:none;margin:0}
.day span{display:flex;flex-direction:column;align-items:center;gap:2px;padding:10px 4px;border-radius:14px;background:#0a1a12;border:1px solid var(--line);transition:all .15s;color:var(--text)}
.day small{font-size:12px;color:var(--mute)}
.day b{font-size:16px;font-variant-numeric:tabular-nums}
.day em{font-style:normal;font-size:10px;color:var(--gold)}
.day.we small{color:#7fd4ff}
.day input:checked+span{background:linear-gradient(135deg,var(--lime),var(--green));border-color:transparent;color:#05210f;transform:translateY(-2px);box-shadow:0 8px 20px -8px rgba(47,224,138,.7)}
.day input:checked+span small{color:#05210f}
.day input:disabled+span{opacity:.45;cursor:not-allowed}
.day input:focus-visible+span{box-shadow:0 0 0 3px rgba(47,224,138,.4)}
@media (max-width:560px){.row,.row3{grid-template-columns:1fr}.req{grid-template-columns:1fr}}
`;

const APP_JS = `
function pad(n){return String(n).padStart(2,'0')}
function tick(){var n=new Date(Date.now()+9*3600e3);var l=86400-(n.getUTCHours()*3600+n.getUTCMinutes()*60+n.getUTCSeconds());
var el=document.getElementById('cd');if(el)el.textContent=pad(Math.floor(l/3600))+':'+pad(Math.floor(l%3600/60))+':'+pad(l%60)}
tick();setInterval(tick,1000);
function bindForms(root){
root.querySelectorAll('form[data-busy]').forEach(function(f){f.addEventListener('submit',function(){var b=f.querySelector('button');if(b){b.disabled=true;b.textContent=f.dataset.busy}})});
root.querySelectorAll('form[data-confirm]').forEach(function(f){f.addEventListener('submit',function(e){if(!confirm(f.dataset.confirm))e.preventDefault()})});
}
function loadMine(){var el=document.getElementById('mine');if(!el)return;
el.innerHTML='<p class="desc"><span class="spin"></span> 임팩트비전에서 불러오는 중…</p>';
fetch('/app/mine',{credentials:'same-origin'}).then(function(r){return r.text()}).then(function(h){
var t=document.createElement('div');t.innerHTML=h;el.innerHTML='';while(t.firstChild)el.appendChild(t.firstChild);bindForms(el);})
.catch(function(){el.innerHTML='<p class="desc bad">불러오지 못했습니다. 새로고침을 눌러 주세요.</p>'})}
loadMine();
var rl=document.getElementById('mine-reload');if(rl)rl.addEventListener('click',loadMine);
document.querySelectorAll('form[data-busy]').forEach(function(f){f.addEventListener('submit',function(){var b=f.querySelector('button');if(b){b.disabled=true;b.textContent=f.dataset.busy}})});
document.querySelectorAll('form[data-confirm]').forEach(function(f){f.addEventListener('submit',function(e){if(!confirm(f.dataset.confirm))e.preventDefault()})});
`;

function timeOptions(selected) {
  let o = '<option value="">— 선택 안 함 —</option>';
  // 예약은 1시간 단위, 09:00 ~ 21:00
  for (let h = 9; h <= 21; h++) {
    const t = `${String(h).padStart(2, '0')}:00`;
    o += `<option value="${t}"${t === selected ? ' selected' : ''}>${t}</option>`;
  }
  return o;
}

function bayOptions(bays, selected, none = '— 선택 안 함 —') {
  return `<option value="">${none}</option>` + bays.map((b) => `<option value="${esc(b)}"${b === selected ? ' selected' : ''}>${esc(b)}</option>`).join('');
}

function maskId(id) {
  const s = String(id || '');
  return s.length <= 3 ? s[0] + '**' : s.slice(0, 3) + '*'.repeat(Math.max(2, s.length - 3));
}

function appPage({ user, shops, requests, flash, flashErr, kakaoReady, slotsView, today, dateChoices, dayLabel }) {
  const pendingDates = new Set(requests.filter((r) => r.status === '대기').map((r) => r.target_date));
  const bays = user.bays_json ? JSON.parse(user.bays_json) : [];
  const prefBays = user.pref_bays_json ? JSON.parse(user.pref_bays_json) : [];
  const ivSet = !!(user.iv_id && user.iv_pw_enc);
  const shopOpts = shops.map((s) => `<option value="${esc(s.id)}"${s.id === user.default_shop ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
  const statusBadge = (s) => ({ 대기: 'b-wait', 성공: 'b-ok', 실패: 'b-fail', 취소: 'b-cancel' }[s] || 'b-cancel');
  const pending = requests.filter((r) => r.status === '대기');
  const done = requests.filter((r) => r.status !== '대기').slice(0, 15);
  const reqRow = (r) => {
    const times = JSON.parse(r.times_json);
    const rb = r.bays_json ? JSON.parse(r.bays_json) : [];
    return `<div class="req"><div><div class="d">${dayLabel(r.target_date)} · ${esc(r.shop_name || r.shop_id)}<span class="badge ${statusBadge(r.status)}">${esc(r.status)}${r.status === '성공' ? ' ' + esc(r.booked_time) + (r.booked_bay ? ' ' + esc(r.booked_bay) : '') : ''}</span></div>
<div class="t">희망 ${times.map((t, i) => `${i + 1}순위 <b>${esc(t)}</b>`).join(' · ')}<br>타석 ${rb.length ? rb.map((x) => `<b>${esc(x)}</b>`).join(' → ') + (r.any_bay === 0 ? ' (이 타석만)' : ' (안 되면 다른 타석)') : '아무 타석'}${r.result_msg ? `<br>최근 결과: ${esc(r.result_msg)}` : ''}${r.status === '대기' ? `<br>다음 시도: 오늘 밤 00:00` : ''}</div></div>
<div>${r.status === '대기' ? `<form class="inline" method="post" action="/app/req/${r.id}/try" data-busy="시도 중…" data-confirm="지금 바로 예약을 시도할까요? 빈자리가 있으면 실제로 예약됩니다."><button class="btn btn-ghost btn-sm">지금 시도</button></form>
<form class="inline" method="post" action="/app/req/${r.id}/cancel" data-confirm="이 예약 요청을 지울까요? (임팩트비전에 이미 잡힌 예약은 취소되지 않습니다)"><button class="btn btn-red btn-sm">취소</button></form>` : ''}</div></div>`;
  };

  const body = `<div class="wrap">
<nav><a class="logo" href="/"><span class="ball"></span>${NAME}</a>
<div class="who">${esc(user.login)} 님 <form class="inline" method="post" action="/logout"><button class="btn btn-ghost btn-sm">로그아웃</button></form></div></nav>
${flash ? `<div class="flash${flashErr ? ' err' : ''}">${esc(flash)}</div>` : ''}
<div class="hero"><div><h1>다음 자동 예약까지</h1><p>대기 중인 예약 ${pending.length}건 · 매일 00:00 정각 실행</p></div><div class="cd" id="cd"></div></div>

${ivSet ? `<div class="card" id="mine-card"><h2>📅 내 예약 현황 <button type="button" class="btn btn-ghost btn-sm" id="mine-reload" style="margin-left:auto">새로고침</button></h2>
<p class="desc">임팩트비전에 실제로 잡혀 있는 예약입니다 (최근 10건).</p>
<div id="mine"><p class="desc"><span class="spin"></span> 임팩트비전에서 불러오는 중…</p></div></div>` : ''}

<div class="card"><h2>🔑 임팩트비전 계정</h2>
${ivSet ? `<p class="desc"><span class="ok">● 저장됨</span> — 아이디 <b>${esc(maskId(user.iv_id))}</b>${user.iv_ok_at ? ` · 마지막 로그인 성공 ${esc(user.iv_ok_at.slice(5, 16))}` : ''}</p>
${user.iv_err ? `<p class="desc bad">최근 로그인 실패: ${esc(user.iv_err)}</p>` : ''}
<details><summary>계정 바꾸기</summary>` : '<p class="desc">예약에 쓸 임팩트비전 아이디와 비밀번호를 한 번만 입력하세요. 비밀번호는 암호화해서 저장하고 다시 보여 드리지 않습니다.</p>'}
<form method="post" action="/app/iv" data-busy="로그인 확인 중…"><div class="row">
<div><label>임팩트비전 아이디</label><input name="iv_id" required autocomplete="off" value=""></div>
<div><label>임팩트비전 비밀번호</label><input name="iv_pw" type="password" required autocomplete="new-password"></div></div>
<div class="actions"><button class="btn btn-main btn-sm">로그인 확인 후 저장</button></div></form>
${ivSet ? '</details>' : ''}</div>

<div class="card"><h2>📍 단골 매장</h2>
${!ivSet ? '<p class="desc">임팩트비전 계정을 먼저 저장하면 가입한 매장 목록을 불러옵니다.</p>'
    : shops.length ? `<p class="desc">한 번 고르면 바꿀 때까지 계속 이 매장으로 예약합니다.${user.shops_at ? ` (목록 갱신 ${esc(user.shops_at.slice(5, 16))})` : ''}</p>
${bays.length ? `<p class="desc">타석: ${bays.map((x) => `<b>${esc(x)}</b>`).join(' · ')}</p>` : ''}
<form method="post" action="/app/shop"><select name="shop">${user.default_shop ? '' : '<option value="">매장을 고르세요</option>'}${shopOpts}</select>
<div class="actions"><button class="btn btn-main btn-sm">이 매장으로 저장</button></form>
<form class="inline" method="post" action="/app/shops/refresh" data-busy="불러오는 중…"><button class="btn btn-ghost btn-sm">목록 새로 불러오기</button></form></div>`
    : `<p class="desc bad">매장 목록을 아직 못 불러왔습니다. 잠시 뒤 다시 시도해 주세요.</p><form method="post" action="/app/shops/refresh" data-busy="불러오는 중…"><button class="btn btn-ghost btn-sm">매장 목록 불러오기</button></form>`}
</div>

<div class="card"><h2>⛳ 새 예약 걸어 두기</h2>
<p class="desc">날짜와 희망 시간을 순위대로 고르세요. 그 날짜 예약이 열리는 자정에 자동으로 시도합니다.</p>
${user.default_shop ? `<form method="post" action="/app/req">
<label>날짜 (여러 날 골라도 됩니다 · 월요일 휴무 제외)</label>
<div class="days">${dateChoices.map((d) => `<label class="day${d.weekend ? ' we' : ''}"><input type="checkbox" name="date" value="${d.date}"${pendingDates.has(d.date) ? ' disabled' : ''}><span><small>${esc(d.dow)}</small><b>${esc(d.md)}</b>${pendingDates.has(d.date) ? '<em>걸어 둠</em>' : ''}</span></label>`).join('')}</div>
<label>매장</label><select name="shop">${shopOpts}</select>
<div class="row3"><div><label>1순위 시간</label><select name="t1" required>${timeOptions('19:00')}</select></div>
<div><label>2순위</label><select name="t2">${timeOptions('')}</select></div>
<div><label>3순위</label><select name="t3">${timeOptions('')}</select></div></div>
${bays.length ? `<div class="row3"><div><label>타석 1순위</label><select name="b1">${bayOptions(bays, prefBays[0], '아무 타석')}</select></div>
<div><label>타석 2순위</label><select name="b2">${bayOptions(bays, prefBays[1])}</select></div>
<div><label>타석 3순위</label><select name="b3">${bayOptions(bays, prefBays[2])}</select></div></div>
<label class="chk"><input type="checkbox" name="any_bay" value="1"${user.any_bay === 0 ? '' : ' checked'}> 고른 타석이 다 차 있으면 <b>다른 타석이라도</b> 잡기</label>
<p class="desc" style="margin-top:6px">시간이 먼저입니다: 1순위 시간의 원하는 타석 → 그 시간의 다른 타석 → 2순위 시간 … 순서로 시도해요.</p>` : ''}
<div class="actions"><button class="btn btn-main">예약 걸어 두기</button></div></form>` : '<p class="desc">단골 매장을 먼저 저장해 주세요.</p>'}
</div>

<div class="card"><h2>📋 대기 중인 예약</h2>
${pending.length ? pending.map(reqRow).join('') : '<p class="desc">걸어 둔 예약이 없습니다.</p>'}
${done.length ? `<details><summary>지난 결과 ${done.length}건</summary>${done.map(reqRow).join('')}</details>` : ''}
</div>

${user.default_shop ? `<div class="card"><h2>🔎 빈 시간 미리 보기</h2>
<p class="desc">지금 임팩트비전에 보이는 빈 시간을 확인합니다 (예약은 하지 않아요).</p>
<form method="post" action="/app/check" data-busy="확인 중…"><div class="row"><div><select name="date">${[{ date: today, dow: '오늘', md: '' }, ...dateChoices].map((d) => `<option value="${d.date}"${slotsView && slotsView.date === d.date ? ' selected' : ''}>${esc(d.md ? `${d.md} (${d.dow})` : `오늘 ${today.slice(5).replace('-', '/')}`)}</option>`).join('')}</select></div>
<div><button class="btn btn-ghost" style="width:100%">빈 시간 보기</button></div></div></form>
${slotsView ? (slotsView.error ? `<p class="desc bad" style="margin-top:12px">${esc(slotsView.error)}</p>` : slotsView.times.length ? `<div class="chips">${slotsView.times.map((s) => `<span class="${s.open ? 'open' : 'shut'}">${esc(s.t)} <small>${esc(s.state)}</small></span>`).join('')}</div>${slotsView.times.every((s) => !s.open) ? '<p class="desc" style="margin-top:10px">«잠금»은 아직 예약이 열리기 전이라는 뜻이에요. 자정에 열리면 자동으로 시도합니다.</p>' : ''}` : `<p class="desc" style="margin-top:12px">${esc(slotsView.date)} 빈 시간이 보이지 않습니다 (아직 안 열렸거나 모두 찼어요).</p>`) : ''}
</div>` : ''}

<div class="card"><h2>🔔 알림 받을 곳</h2>
<p class="desc">경매알리미와 같은 방식이에요. 둘 다 연결하면 둘 다로 보냅니다.</p>
<label>카카오톡 (나와의 채팅으로 받기)</label>
${user.kakao_refresh ? `<p class="desc"><span class="ok">● 연결됨</span>${user.kakao_at ? ` · ${esc(user.kakao_at.slice(0, 16))}` : ''}</p>
<div class="actions"><form class="inline" method="post" action="/app/notify/test"><button class="btn btn-ghost btn-sm">시험 알림 보내기</button></form>
<form class="inline" method="post" action="/app/kakao/unlink" data-confirm="카카오톡 연결을 끊을까요?"><button class="btn btn-red btn-sm">연결 끊기</button></form></div>`
    : kakaoReady ? '<a class="btn btn-sm" style="background:#fee500;color:#191600" href="/kakao/start">카카오톡 연결하기</a>' : '<p class="desc">카카오톡 연결은 준비 중입니다.</p>'}
<form method="post" action="/app/discord"><label>디스코드 웹훅 주소</label>
<input name="discord" placeholder="https://discord.com/api/webhooks/..." value="${esc(user.discord_url || '')}">
<div class="actions"><button class="btn btn-main btn-sm">저장하고 시험 알림</button></div></form>
</div>

<div class="card"><h2>⚙️ 이 사이트 비밀번호 바꾸기</h2>
<form method="post" action="/app/password"><div class="row"><div><label>지금 비밀번호</label><input type="password" name="old" required autocomplete="current-password"></div>
<div><label>새 비밀번호 (4자 이상)</label><input type="password" name="new" required minlength="4" autocomplete="new-password"></div></div>
<div class="actions"><button class="btn btn-ghost btn-sm">바꾸기</button></div></form></div>
</div>`;
  return shell(`내 예약 · ${NAME}`, body, { css: APP_CSS, script: APP_JS });
}

// 앞으로의 예약이고, 사이트가 «완료/종료»로 표시하지 않았으면 취소 가능
function isCancellable(r, nowKst) {
  const when = `${r.date} ${r.time || '23:59'}`;
  return when > nowKst && !/end/i.test(r.cls) && !/완료|취소됨|종료/.test(r.label);
}

const DOW_K = ['일', '월', '화', '수', '목', '금', '토'];
function mineFragment(list, nowKst, error) {
  if (error) return `<p class="desc bad">${esc(error)}</p>`;
  if (!list.length) return '<p class="desc">임팩트비전에 예약 내역이 없습니다.</p>';
  const items = [...list].sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
  const upcoming = items.filter((r) => isCancellable(r, nowKst)).reverse();
  const past = items.filter((r) => !isCancellable(r, nowKst));
  const row = (r, live) => {
    const [, m, d] = r.date.split('-').map(Number);
    const w = DOW_K[new Date(r.date + 'T00:00:00Z').getUTCDay()];
    return `<div class="mine${live ? '' : ' past'}"><div class="dt"><small>${w}</small><b>${m}/${d}</b></div>
<div class="info"><b>${esc(r.time)}${r.bay ? ` · ${esc(r.bay)} 타석` : ''}</b><div>${esc(r.shop)}${r.pass ? ' · ' + esc(r.pass) : ''}${live ? '' : ` · ${esc(r.label || '지난 예약')}`}</div></div>
<div>${live && r.idx ? `<form method="post" action="/app/mine/cancel" data-busy="취소 중…" data-confirm="${esc(`${m}/${d}(${w}) ${r.time}${r.bay ? ' ' + r.bay + ' 타석' : ''} 예약을 취소할까요?`)}"><input type="hidden" name="idx" value="${esc(r.idx)}"><button class="btn btn-red btn-sm">예약 취소</button></form>` : ''}</div></div>`;
  };
  return (upcoming.length ? upcoming.map((r) => row(r, true)).join('') : '<p class="desc">앞으로 잡혀 있는 예약이 없습니다.</p>')
    + (past.length ? `<details><summary>지난 예약 ${past.length}건</summary>${past.map((r) => row(r, false)).join('')}</details>` : '');
}

module.exports = { landing, loginPage, messagePage, appPage, mineFragment, isCancellable, esc, NAME, ICON_SVG };
