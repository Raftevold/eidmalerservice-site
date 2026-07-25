// Eid Malerservice AS - nettside med innebygd admin.
// Server-rendra EJS, ingen byggjesteg. Innhald ligg i GitHub (sjå lib/store.js).

const express = require('express');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const crypto = require('crypto');

const store = require('./lib/store');
const auth = require('./lib/auth');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
// Demoen skal ikkje indekserast av Google før bedrifta har godkjent sida.
const NOINDEX = process.env.DEMO_NOINDEX !== '0';

// Bilete som følgjer med i repoet. Admin kan velje desse eller laste opp eigne.
const INNEBYGDE_BILETE = {
  fasade: { alt: 'Maler arbeider med fasade fra lift på næringsbygg', bredder: [900, 1600] },
  laget: { alt: 'Deler av arbeidslaget foran et større næringsbygg', bredder: [900, 1600] },
  innvendig: { alt: 'Maler ruller maling på innvendig vegg', bredder: [700, 1200] },
  golv: { alt: 'Sveising av skjøter i banebelegg på gulv', bredder: [700, 1200] },
  sproyting: { alt: 'Sprøytemaskin for puss på byggeplass', bredder: [700, 1200] },
  pauserom: { alt: 'Arbeidslaget i pause på byggeplass', bredder: [700, 1200] },
  tekstur: { alt: '', bredder: [1600] },
};

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);
app.use(compression());
app.use(cookieParser());
app.use(express.urlencoded({ extended: false, limit: '200kb' }));
app.use(express.json({ limit: '2mb' }));

// Sikkerheitshovud
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'self'; base-uri 'self'");
  next();
});

app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '30d',
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  },
}));

// ---------- hjelparar ----------

function bildeUrl(navn, bredde) {
  if (!navn) return null;
  if (navn.startsWith('opplast:')) return `/opplast/${navn.slice(8)}`;
  const b = INNEBYGDE_BILETE[navn];
  if (!b) return null;
  const valgt = bredde && b.bredder.includes(bredde) ? bredde : b.bredder[b.bredder.length - 1];
  return `/img/${navn}-${valgt}.webp`;
}

function bildeSrcset(navn) {
  if (!navn || navn.startsWith('opplast:')) return null;
  const b = INNEBYGDE_BILETE[navn];
  if (!b) return null;
  return b.bredder.map((w) => `/img/${navn}-${w}.webp ${w}w`).join(', ');
}

function bildeAlt(navn, fallback) {
  const b = INNEBYGDE_BILETE[navn];
  return (b && b.alt) || fallback || '';
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function telefonLenke(tlf) {
  return 'tel:+47' + String(tlf || '').replace(/\s/g, '');
}

// Felles data til alle visningar
function visning(req, side) {
  const c = store.getContent();
  return {
    c,
    side,
    bildeUrl,
    bildeSrcset,
    bildeAlt,
    telefonLenke,
    esc,
    noindex: NOINDEX,
    baseUrl: BASE_URL,
    seo: (c.seo && c.seo[side]) || { title: c.bedrift.navn, description: '' },
  };
}

// ---------- offentlege sider ----------

app.get('/', (req, res) => res.render('index', visning(req, 'forside')));
app.get('/tjenester', (req, res) => res.render('tjenester', visning(req, 'tjenester')));
app.get('/prosjekter', (req, res) => res.render('prosjekter', visning(req, 'prosjekter')));
app.get('/om-oss', (req, res) => res.render('om-oss', visning(req, 'om-oss')));
app.get('/personvern', (req, res) => res.render('personvern', visning(req, 'personvern')));

app.get('/kontakt', (req, res) => {
  const v = visning(req, 'kontakt');
  v.sendt = req.query.sendt === '1';
  v.feil = req.query.feil === '1';
  v.skjema = {};
  res.render('kontakt', v);
});

// Kontaktskjema. Meldingar blir lagra i data-greina og vist i admin.
const skjemaForsok = new Map();
app.post('/kontakt', async (req, res) => {
  const ip = req.ip || 'ukjent';
  const no = Date.now();
  const f = skjemaForsok.get(ip);
  if (f && no < f.resetAt && f.count >= 5) {
    return res.redirect('/kontakt?feil=1#skjema');
  }
  skjemaForsok.set(ip, { count: (f && no < f.resetAt ? f.count : 0) + 1, resetAt: no + 60 * 60 * 1000 });

  const { navn, epost, telefon, melding, tjeneste } = req.body;
  // Honeypot mot enkel spam
  if (req.body.nettside) return res.redirect('/kontakt?sendt=1#skjema');
  if (!navn || !melding || (!epost && !telefon)) {
    return res.redirect('/kontakt?feil=1#skjema');
  }
  try {
    await store.addMessage({
      id: crypto.randomUUID(),
      tid: new Date().toISOString(),
      navn: String(navn).slice(0, 120),
      epost: String(epost || '').slice(0, 160),
      telefon: String(telefon || '').slice(0, 40),
      tjeneste: String(tjeneste || '').slice(0, 80),
      melding: String(melding).slice(0, 4000),
      lest: false,
    });
    res.redirect('/kontakt?sendt=1#skjema');
  } catch (e) {
    console.error('Klarte ikkje lagre melding:', e.message);
    res.redirect('/kontakt?feil=1#skjema');
  }
});

// Opplasta bilete
app.get('/opplast/:fil', async (req, res) => {
  const fil = path.basename(req.params.fil);
  if (!/^[\w.-]+\.webp$/.test(fil)) return res.status(404).end();
  try {
    const buf = await store.getUpload(fil);
    if (!buf) return res.status(404).end();
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=604800');
    res.end(buf);
  } catch (e) {
    res.status(500).end();
  }
});

// Fargane i "fargeveggen" er redigerbare i admin. Dei blir servert som eit eige
// stilark i staden for inline style-attributt, slik at vi kan halde på ein streng
// CSP utan 'unsafe-inline'.
app.get('/css/innhald.css', (req, res) => {
  const fargar = (store.getContent().forside || {}).fargevegg || [];
  const reglar = fargar.map((f, i) => {
    const hex = /^#[0-9a-fA-F]{3,8}$/.test(String(f.hex || '')) ? f.hex : '#888888';
    return `.lag-${i}{background:${hex}}.farge-${i}{background:${hex}}`;
  }).join('\n');
  res.type('text/css');
  res.setHeader('Cache-Control', 'no-cache');
  res.send(reglar + '\n');
});

// ---------- SEO-filer ----------

app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  if (NOINDEX) return res.send('User-agent: *\nDisallow: /\n');
  res.send(`User-agent: *\nAllow: /\nDisallow: /admin\n\nSitemap: ${BASE_URL}/sitemap.xml\n`);
});

app.get('/sitemap.xml', (req, res) => {
  // Bruk same form som canonical-lenkene (rot med skråstrek), slik at Google
  // ikkje ser to variantar av framsida.
  const sider = ['/', '/tjenester', '/prosjekter', '/om-oss', '/kontakt', '/personvern'];
  const dato = new Date().toISOString().slice(0, 10);
  res.type('application/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    sider.map((s) => `  <url><loc>${BASE_URL}${s}</loc><lastmod>${dato}</lastmod></url>`).join('\n') +
    `\n</urlset>\n`
  );
});

// ---------- admin ----------

app.get('/admin/login', (req, res) => {
  if (auth.isLoggedIn(req)) return res.redirect('/admin');
  res.render('admin/login', { feil: req.query.feil === '1', laast: req.query.laast === '1' });
});

app.post('/admin/login', (req, res) => {
  const ip = req.ip || 'ukjent';
  if (auth.rateLimited(ip)) return res.redirect('/admin/login?laast=1');
  const ok = auth.checkPassword(req.body.passord || '');
  auth.registerAttempt(ip, ok);
  if (!ok) return res.redirect('/admin/login?feil=1');
  auth.issueCookie(res);
  res.redirect('/admin');
});

app.post('/admin/logout', (req, res) => {
  auth.clearCookie(res);
  res.redirect('/admin/login');
});

app.get('/admin', auth.requireAdmin, (req, res) => {
  res.render('admin/panel', {
    c: store.getContent(),
    meldingar: store.getMessages(),
    innebygde: INNEBYGDE_BILETE,
    lagringsmodus: store.remote ? 'GitHub' : 'lokalt',
    noindex: NOINDEX,
  });
});

app.get('/admin/api/innhald', auth.requireAdmin, (req, res) => {
  res.json(store.getContent());
});

app.post('/admin/api/innhald', auth.requireAdmin, async (req, res) => {
  const nytt = req.body;
  if (!nytt || typeof nytt !== 'object' || !nytt.bedrift) {
    return res.status(400).json({ feil: 'Ugyldig innhald' });
  }
  try {
    await store.saveContent(nytt);
    res.json({ ok: true });
  } catch (e) {
    console.error('Lagring feila:', e.message);
    res.status(500).json({ feil: 'Klarte ikkje lagre: ' + e.message });
  }
});

const opplast = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});

// Mediebiblioteket: innebygde bilete + alle opplasta
app.get('/admin/api/bilete', auth.requireAdmin, async (req, res) => {
  try {
    const opplasta = await store.listUploads();
    res.json({
      innebygde: Object.keys(INNEBYGDE_BILETE)
        .filter((k) => k !== 'tekstur')
        .map((k) => ({ id: k, url: bildeUrl(k, INNEBYGDE_BILETE[k].bredder[0]), alt: INNEBYGDE_BILETE[k].alt })),
      opplasta: opplasta.map((n) => ({ id: `opplast:${n}`, url: `/opplast/${n}`, fil: n })),
    });
  } catch (e) {
    res.status(500).json({ feil: e.message });
  }
});

app.post('/admin/api/bilete', auth.requireAdmin, opplast.single('fil'), async (req, res) => {
  if (!req.file) return res.status(400).json({ feil: 'Ingen fil' });
  try {
    const webp = await sharp(req.file.buffer)
      .rotate()
      .resize({ width: 1600, withoutEnlargement: true })
      .webp({ quality: 76, effort: 5 })
      .toBuffer();
    const namn = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.webp`;
    await store.saveUpload(namn, webp);
    res.json({ ok: true, id: `opplast:${namn}`, url: `/opplast/${namn}` });
  } catch (e) {
    console.error('Opplasting feila:', e.message);
    res.status(500).json({ feil: 'Klarte ikkje lagre biletet: ' + e.message });
  }
});

app.delete('/admin/api/bilete/:fil', auth.requireAdmin, async (req, res) => {
  const fil = path.basename(req.params.fil);
  if (!/^[\w.-]+\.webp$/.test(fil)) return res.status(400).json({ feil: 'Ugyldig filnamn' });
  try {
    await store.deleteUpload(fil);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ feil: e.message });
  }
});

app.get('/admin/api/meldingar-liste', auth.requireAdmin, (req, res) => {
  res.json(store.getMessages() || []);
});

app.post('/admin/api/meldingar', auth.requireAdmin, async (req, res) => {
  try {
    await store.saveMessages(Array.isArray(req.body) ? req.body : []);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ feil: e.message });
  }
});

// ---------- 404 og feil ----------

app.use((req, res) => {
  res.status(404).render('404', visning(req, 'forside'));
});

app.use((err, req, res, next) => {
  console.error('Uventa feil:', err);
  res.status(500).send('Det skjedde ein feil. Prøv igjen seinare.');
});

// ---------- oppstart ----------

store.init()
  .then(() => console.log(`Innhald lasta (${store.remote ? 'GitHub' : 'lokalt'})`))
  .catch((e) => {
    console.error('Klarte ikkje initialisere lageret, køyrer på standardinnhald:', e.message);
    store.initFallback();
  })
  .finally(() => {
    app.listen(PORT, () => console.log(`Køyrer på port ${PORT} (${BASE_URL}), noindex=${NOINDEX}`));
  });
