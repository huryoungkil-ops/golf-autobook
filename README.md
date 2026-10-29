# 임팩트비전 자동예약 (golf-autobook)

임팩트비전(my.impactvision.co.kr) 예약은 자정에 열린다. 회원이 미리 날짜·매장·1~3순위 시간을 적어 두면
매일 23:58:30 에 각자의 임팩트비전 계정으로 미리 로그인해 두었다가 00:01 에 예약하고 (정각 직후 혼잡을 피하려고, 사용자 요청 10-21. 단 `.env` 의 `PRIORITY_LOGINS` 에 적은 회원(운영자)은 00:00 정각에 먼저 시도 — 10-29),
결과를 카카오톡(나와의 채팅)·디스코드로 알린다. 여러 사람이 함께 쓴다(지금 5명 이내, 최대 30명 설정).

- 서버: 카페24 180.70.116.114, `/opt/golf-autobook`, 계정 `golf`
- 주소: https://impactvision.mooo.com (보조 golf.180-70-116-114.sslip.io. 바꿀 땐 `deploy/Caddyfile` + `.env` PUBLIC_BASE + 카카오 Redirect URI)
- 외부 패키지 없음 (Node 22.13+, `node:sqlite`)

| 경로 | 내용 |
|---|---|
| `src/web.js` | 사이트 (랜딩 · 로그인/가입 · 내 예약) |
| `src/pages.js` | 화면 HTML·CSS |
| `src/impact.js` | 임팩트비전 조작 (로그인 · 매장 목록 · 시간표 · 예약) + 화면 해석 |
| `src/booker.js` | 예약 한 건 처리 (자정 작업·«지금 시도» 공용), 결과 알림 |
| `src/job.js` | 자정 작업 (`golf-midnight.timer` 23:58:30) |
| `src/notify.js` | 디스코드 · 카카오톡 · 운영자 알림 |
| `scripts/admin.js` | 운영자 도구 (가입자 목록·비밀번호 초기화·기록) |
| `src/webpush.js` · `public/sw.js` · `public/push-client.js` | 기기 알림(웹 푸시)·알림함 — 경매알리미·가게쇼츠와 **같은 파일** (고칠 땐 세 곳을 똑같이) |
| `src/push.js` | 위 공통 모듈을 이 사이트에 붙이는 곳 (사람 구분 = users.id) |

## 규칙
- 이 사이트 로그인 = 아이디 + 비밀번호(4자 이상). 처음 쓰는 아이디는 바로 가입, 5번 틀리면 15분 잠금.
- 임팩트비전 비밀번호는 AES-256-GCM 으로 암호화해 저장 (`.env` SECRET_KEY). 화면에 다시 보이지 않는다.
- 고를 수 있는 날짜: 내일부터 월요일(휴무)을 뺀 **18일** (매일 하루씩 밀림). 한 사람당 대기 20건, 같은 날짜 중복 불가. 시간은 1시간 단위 09:00~21:00.
- 자정 작업: 오늘·내일 날짜는 시간표가 안 열렸으면 3분(OPEN_WAIT_SEC) 동안 2초마다 다시 본다.
  거절돼도 2번 더 다시 시도(FULL_RETRIES). 그 날짜 당일 자정에도 못 잡으면 «실패»로 닫는다. 원하는 시간이 찼으면 1→2→3순위로 넘어간다.

## 기기 알림 (휴대폰 · PC, 2026-10-21)
- 내 예약 → «알림 받을 곳» 의 **«이 기기에서 알림 받기»** 를 누르면 그 기기(브라우저)로 웹 푸시가 온다. 사이트를 닫아 둬도 온다.
- 회원에게 가는 알림(`notify.toUser`)은 디스코드·카카오톡과 함께 켜 둔 기기 모두로 가고, 위쪽 **«알림»** 페이지(`/notices`)에 최근 100건이 남는다(«모두 읽음 처리»).
- 아이폰·아이패드는 사파리에서 **홈 화면에 추가**한 뒤 그 아이콘으로 열어야 켤 수 있다(iOS 16.4+). 카카오톡 등 앱 안 브라우저에서는 안 된다(화면이 안내함).
- 서명 열쇠는 `data/vapid.json` (처음 요청 때 자동 생성, 600). **지우거나 바꾸면 이미 켠 기기가 모두 다시 켜야 하므로 지우지 말 것.** 백업 때 함께 챙긴다.
- 경로: `/sw.js`, `/push-client.js`, `/manifest.webmanifest`, `/icon-192.png`·`/icon-512.png`·`/apple-touch-icon.png`, `POST /push/{key|subscribe|unsubscribe|test|notices|read-all}` (JSON 만 받음).

## 운영
```
# 서버에서
sudo -u golf node /opt/golf-autobook/scripts/admin.js users|requests|logs|reset <아이디>
journalctl -u golf-web -n 50 ; journalctl -u golf-midnight -n 80
systemctl list-timers golf-midnight.timer
# 배포
git -c safe.directory=/opt/golf-autobook -C /opt/golf-autobook pull && chown -R golf:golf /opt/golf-autobook && systemctl restart golf-web
```

## 검증 안 된 부분
로그인 뒤 화면(매장 목록·시간표·예약 확인 창)은 실제 계정으로 아직 보지 못해 `src/impact.js` 의 해석은
공개 화면 소스(`start.js`)에서 추정했다. 받은 화면은 `data/snap/<사용자번호>/` 에 남으니, 매장 목록이 비거나
시간이 안 보이면 그 파일을 보고 `parseShops`·`parseSlots`·`parseForm` 을 고친다.
`.env` 에 `DRY_RUN=1` 이면 최종 «예약» 요청 직전에서 멈춘다.
