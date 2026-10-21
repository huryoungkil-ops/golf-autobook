#!/usr/bin/env bash
# 카페24 서버(Ubuntu)에 임팩트비전 자동예약을 설치한다. root 로 실행. 다시 돌려도 된다.
#   전용 계정 golf · 코드 /opt/golf-autobook · .env(암호화 키 자동 생성) · systemd(웹 + 자정 타이머) · Caddy · 매일 DB 백업
# 전제: Node.js 22.13 이상, 저장소 읽기 전용 배포 키 (~/.ssh/config 의 github.com-golf)
set -euo pipefail
APP=/opt/golf-autobook
REPO_URL=${REPO_URL:-git@github.com-golf:huryoungkil-ops/golf-autobook.git}

id golf >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin golf
[ -d "$APP/.git" ] || git clone "$REPO_URL" "$APP"
mkdir -p "$APP/data" /var/backups/golf-autobook
chmod 700 "$APP/data" /var/backups/golf-autobook
if [ ! -f "$APP/.env" ]; then
  cat > "$APP/.env" <<ENV
PUBLIC_BASE=https://impactvision.mooo.com
# 임팩트비전 비밀번호 암호화 키 — 바꾸거나 잃어버리면 저장된 비밀번호를 못 푼다 (백업할 것)
SECRET_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
# 운영자 디스코드 (가입·밤사이 결과·이상), 카카오(경매알리미와 같은 앱)
OWNER_WEBHOOK=
# 회원 소식 채널 (새 가입·다른 회원 예약 성공), 소식에서 뺄 아이디(쉼표)
FEED_WEBHOOK=
FEED_SKIP_LOGINS=
KAKAO_REST_KEY=
KAKAO_CLIENT_SECRET=
MAX_USERS=30
DRY_RUN=0
ENV
  echo ".env 를 만들었다 — OWNER_WEBHOOK·카카오 키를 채울 것"
fi
chmod 600 "$APP/.env"
chown -R golf:golf "$APP" /var/backups/golf-autobook

sudo -u golf bash -c "cd $APP && node --disable-warning=ExperimentalWarning --test test/*.test.js" | grep -E '^ℹ (pass|fail)'

cp "$APP"/deploy/golf-web.service "$APP"/deploy/golf-midnight.service "$APP"/deploy/golf-midnight.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable golf-web.service
systemctl restart golf-web.service
systemctl enable --now golf-midnight.timer

mkdir -p /etc/caddy/sites
cp "$APP/deploy/Caddyfile" /etc/caddy/sites/golf.caddy
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
systemctl reload caddy

cat > /etc/cron.d/golf-autobook-backup <<CRON
50 3 * * * golf sqlite3 $APP/data/golf.db ".backup /var/backups/golf-autobook/golf-\$(date +\%F).db" && gzip -f /var/backups/golf-autobook/golf-\$(date +\%F).db && find /var/backups/golf-autobook -name '*.db.gz' -mtime +30 -delete
CRON
echo "설치 끝 — curl -s https://impactvision.mooo.com/healthz ; systemctl list-timers golf-midnight.timer"
