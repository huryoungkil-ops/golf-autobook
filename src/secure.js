// 비밀번호 해시(scrypt)와 임팩트비전 비밀번호 암호화(AES-256-GCM)
const crypto = require('node:crypto');
const { SECRET_KEY } = require('./env');

function hashPw(pw, salt = crypto.randomBytes(16).toString('hex')) {
  const h = crypto.scryptSync(String(pw), salt, 32).toString('hex');
  return `${salt}:${h}`;
}
function checkPw(pw, stored) {
  if (!stored) return false;
  const [salt, h] = String(stored).split(':');
  const a = Buffer.from(hashPw(pw, salt).split(':')[1], 'hex');
  const b = Buffer.from(h || '', 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function key() {
  const k = Buffer.from(SECRET_KEY, 'base64');
  if (k.length !== 32) throw new Error('SECRET_KEY(.env) 가 없거나 32바이트가 아니다');
  return k;
}
function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}
function decrypt(blob) {
  const [iv, tag, enc] = String(blob).split('.').map((s) => Buffer.from(s, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}

const token = (n = 24) => crypto.randomBytes(n).toString('base64url');

module.exports = { hashPw, checkPw, encrypt, decrypt, token };
