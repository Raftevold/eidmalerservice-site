// Enkel og trygg admin-autentisering:
// - Passordet blir samanlikna som SHA-256-hash med timing-sikker samanlikning.
// - Innlogga økt = signert cookie (HMAC med SESSION_SECRET), HttpOnly + Secure + SameSite=Strict.
// - Ratelimit på innloggingsforsøk per IP.

const crypto = require('crypto');

if (!process.env.SESSION_SECRET) {
  console.warn('ÅTVARING: SESSION_SECRET er ikkje sett - admin blir logga ut ved kvar omstart.');
}
const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const PASSWORD_HASH = (process.env.ADMIN_PASSWORD_HASH || '').toLowerCase();
const COOKIE_NAME = 'ems_admin';
const SESSION_DAYS = 7;

const attempts = new Map(); // ip -> { count, resetAt }
// Global bakstoppar: sjølv om nokon roterer IP-ar, skal ikkje serveren tole
// ubegrensa passordgjetting.
let globaltForsok = { count: 0, resetAt: Date.now() + 15 * 60 * 1000 };
const GLOBAL_GRENSE = 60;

// Rydd gamle innloggingsforsøk med jamne mellomrom
setInterval(() => {
  const no = Date.now();
  for (const [ip, a] of attempts) if (no >= a.resetAt) attempts.delete(ip);
}, 30 * 60 * 1000).unref();

function sha256Hex(s) {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

function sign(value) {
  return crypto.createHmac('sha256', SECRET).update(value).digest('hex');
}

function checkPassword(password) {
  if (!PASSWORD_HASH || !password) return false;
  const given = Buffer.from(sha256Hex(password), 'hex');
  const wanted = Buffer.from(PASSWORD_HASH, 'hex');
  if (given.length !== wanted.length) return false;
  return crypto.timingSafeEqual(given, wanted);
}

function rateLimited(ip) {
  const now = Date.now();
  if (now >= globaltForsok.resetAt) globaltForsok = { count: 0, resetAt: now + 15 * 60 * 1000 };
  if (globaltForsok.count >= GLOBAL_GRENSE) return true;
  const a = attempts.get(ip);
  if (a && now < a.resetAt && a.count >= 8) return true;
  return false;
}

function registerAttempt(ip, success) {
  const now = Date.now();
  let a = attempts.get(ip);
  if (!a || now >= a.resetAt) a = { count: 0, resetAt: now + 15 * 60 * 1000 };
  a.count = success ? 0 : a.count + 1;
  attempts.set(ip, a);
  if (now >= globaltForsok.resetAt) globaltForsok = { count: 0, resetAt: now + 15 * 60 * 1000 };
  if (success) globaltForsok.count = 0;
  else globaltForsok.count += 1;
  // Avgrens minnebruk om nokon roterer IP-ar
  while (attempts.size > 5000) attempts.delete(attempts.keys().next().value);
}

function issueCookie(res) {
  const exp = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const value = `${exp}.${sign(String(exp))}`;
  res.cookie(COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV !== 'development',
    sameSite: 'strict',
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

function clearCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

function isLoggedIn(req) {
  const raw = req.cookies && req.cookies[COOKIE_NAME];
  if (!raw) return false;
  const [exp, mac] = raw.split('.');
  if (!exp || !mac) return false;
  // Ein manipulert cookie skal aldri kunne krasje serveren. Utan denne testen
  // gav t.d. fleirbyte-teikn ulik byte-lengd i Buffer og kasta RangeError frå
  // timingSafeEqual - noko som slo ut sjølve innloggingssida.
  if (!/^[0-9]+$/.test(exp) || !/^[0-9a-f]{64}$/.test(mac)) return false;
  if (Number(exp) < Date.now()) return false;
  const wanted = sign(exp);
  return crypto.timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(wanted, 'hex'));
}

// Render legg klienten sin faktiske IP bakarst i X-Forwarded-For. Express med
// "trust proxy: 1" plukkar den nest siste, som klienten sjølv kan velje fritt -
// då kan ein omgå ratelimitinga ved å rotere headeren. Vi les difor den ytste
// oppføringa sjølve.
function klientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) {
    const delar = xff.split(',');
    const siste = delar[delar.length - 1].trim();
    if (siste) return siste;
  }
  return req.ip || 'ukjent';
}

function requireAdmin(req, res, next) {
  if (isLoggedIn(req)) return next();
  // API-kall skal få eit JSON-svar, ikkje ei omdirigering til innloggingssida -
  // elles prøver admin-skriptet å tolke HTML som JSON når økta går ut.
  if (req.path.startsWith('/admin/api/')) return res.status(401).json({ feil: 'Ikkje innlogga' });
  return res.redirect('/admin/login');
}

module.exports = { checkPassword, rateLimited, registerAttempt, issueCookie, clearCookie, isLoggedIn, requireAdmin, sha256Hex, klientIp };
