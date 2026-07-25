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
// forhold = biletet sitt eigne breidde/høgde-forhold. Vi oppgir rett storleik i
// HTML-en så nettlesaren kan setje av plass før biletet er lasta (unngår hopp).
const INNEBYGDE_BILETE = {
  fasade: { alt: 'Maler arbeider med fasade fra lift på næringsbygg', bredder: [900, 1600], forhold: 1600 / 1200 },
  laget: { alt: 'Deler av arbeidslaget foran et større næringsbygg', bredder: [900, 1600], forhold: 1600 / 1205 },
  innvendig: { alt: 'Maler ruller maling på innvendig vegg', bredder: [700, 1200], forhold: 1200 / 1594 },
  golv: { alt: 'Maler sveiser skjøter i banebelegg på gulv', bredder: [700, 1200], forhold: 1200 / 1594 },
  sproyting: { alt: 'Tre av malerne ved en pussemaskin på byggeplass', bredder: [700, 1200], forhold: 1200 / 1594 },
  pauserom: { alt: 'Arbeidslaget i pause på byggeplass', bredder: [700, 1200], forhold: 1200 / 1594 },
  tekstur: { alt: '', bredder: [1600], forhold: 1376 / 768 },
};

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);
app.disable('x-powered-by');
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
    // blob: trengst for at admin skal kunne vise eit opplasta bilete med ein gong,
    // før det er sendt til serveren.
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'self'; base-uri 'self'");
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

// Breidde og høgde å oppgi i HTML. Opplasta bilete er alltid maks 1600 breie,
// men høgda varierer - då fell vi tilbake på 4:3, som er det figurane viser.
function bildeMal(navn, breidde) {
  const b = INNEBYGDE_BILETE[navn];
  const w = breidde || 1200;
  const forhold = (b && b.forhold) || 4 / 3;
  return { w, h: Math.round(w / forhold) };
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function telefonLenke(tlf) {
  return 'tel:+47' + String(tlf || '').replace(/\s/g, '');
}

// Serialiserer eit objekt trygt til bruk inne i ein <script>-tagg.
// JSON.stringify escapar ikkje '<', så utan dette kunne teksten "</script>"
// i eit admin-felt avslutte blokka og sleppe HTML ut på alle sider.
const U2028 = String.fromCharCode(0x2028);
const U2029 = String.fromCharCode(0x2029);
function jsonTrygg(obj) {
  return JSON.stringify(obj)
    .split('<').join('\\u003c')
    .split(U2028).join('\\u2028')
    .split(U2029).join('\\u2029');
}

// Felles data til alle visningar
function visning(req, side) {
  const c = store.getContent() || {};
  // Siste sikringsnett: sjølv om innhaldet skulle vere ufullstendig, skal sida
  // kome opp med tomme felt heller enn å svare 500.
  if (!c.bedrift) c.bedrift = {};
  if (!c.forside) c.forside = {};
  if (!c.omOss) c.omOss = {};
  if (!c.kontakt) c.kontakt = {};
  return {
    c,
    side,
    bildeUrl,
    bildeSrcset,
    bildeAlt,
    bildeMal,
    telefonLenke,
    jsonTrygg,
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

// Mellomlager for skjema som ikkje gjekk gjennom, så kunden slepp å skrive alt på
// nytt. Nøkkelen ligg i ein kortliva cookie; sjølve teksten blir aldri delt.
const skjemaMinne = new Map();
setInterval(() => {
  const no = Date.now();
  for (const [k, v] of skjemaMinne) if (no >= v.utgaar) skjemaMinne.delete(k);
}, 10 * 60 * 1000).unref();

function hugsSkjema(res, verdiar) {
  const nokkel = crypto.randomUUID();
  skjemaMinne.set(nokkel, { verdiar, utgaar: Date.now() + 30 * 60 * 1000 });
  while (skjemaMinne.size > 500) skjemaMinne.delete(skjemaMinne.keys().next().value);
  res.cookie('ems_skjema', nokkel, {
    httpOnly: true, sameSite: 'lax', maxAge: 30 * 60 * 1000, path: '/kontakt',
    secure: process.env.NODE_ENV !== 'development',
  });
}

app.get('/kontakt', (req, res) => {
  const v = visning(req, 'kontakt');
  v.sendt = req.query.sendt === '1';
  v.feilkode = typeof req.query.feil === 'string' ? req.query.feil : '';
  v.feil = Boolean(v.feilkode);

  // Hent tilbake det kunden skreiv, slik at ei feilmelding ikkje tømmer skjemaet
  v.skjema = { navn: '', epost: '', telefon: '', melding: '', tjeneste: '' };
  const nokkel = req.cookies && req.cookies.ems_skjema;
  if (nokkel && skjemaMinne.has(nokkel)) {
    Object.assign(v.skjema, skjemaMinne.get(nokkel).verdiar);
    skjemaMinne.delete(nokkel);
    res.clearCookie('ems_skjema', { path: '/kontakt' });
  }

  // Lenkene frå tenestesidene sender med kva tenesta gjeld, så feltet står ferdig valt
  const fraLenke = typeof req.query.tjeneste === 'string' ? req.query.tjeneste : '';
  v.valdTeneste = v.skjema.tjeneste || fraLenke;
  res.render('kontakt', v);
});

// Kontaktskjema. Meldingar blir lagra i data-greina og vist i admin.
const skjemaForsok = new Map();
// Rydd gamle oppføringar, elles veks mappet med éi rad per unik IP for alltid
setInterval(() => {
  const no = Date.now();
  for (const [ip, f] of skjemaForsok) if (no >= f.resetAt) skjemaForsok.delete(ip);
}, 30 * 60 * 1000).unref();

// Enkel, romsleg kontroll: vi vil fange skrivefeil som «kari(at)example.no»,
// ikkje avvise uvanlege men gyldige adresser.
function gyldigEpost(s) {
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(String(s).trim());
}
// Norske nummer kan skrivast med mellomrom, bindestrek og landkode
function gyldigTelefon(s) {
  const reint = String(s).replace(/[\s\-().]/g, '');
  return /^(\+?\d{8,15})$/.test(reint);
}

app.post('/kontakt', async (req, res) => {
  const ip = auth.klientIp(req);
  const no = Date.now();

  const { navn, epost, telefon, melding, tjeneste } = req.body;
  const verdiar = {
    navn: String(navn || '').slice(0, 120),
    epost: String(epost || '').slice(0, 160),
    telefon: String(telefon || '').slice(0, 40),
    melding: String(melding || '').slice(0, 4000),
    tjeneste: String(tjeneste || '').slice(0, 80),
  };

  // Honeypot mot enkel spam
  if (req.body.nettside) return res.redirect('/kontakt?sendt=1#skjema');

  const f = skjemaForsok.get(ip);
  if (f && no < f.resetAt && f.count >= 20) {
    // Eiga melding - elles trur kunden at han har gløymt eit felt
    hugsSkjema(res, verdiar);
    return res.redirect('/kontakt?feil=for-mange#skjema');
  }
  skjemaForsok.set(ip, { count: (f && no < f.resetAt ? f.count : 0) + 1, resetAt: no + 60 * 60 * 1000 });

  const manglar = [];
  if (!verdiar.navn.trim()) manglar.push('navn');
  if (!verdiar.melding.trim()) manglar.push('melding');
  if (!verdiar.epost && !verdiar.telefon) manglar.push('kontakt');
  if (verdiar.epost && !gyldigEpost(verdiar.epost)) manglar.push('epost');
  if (verdiar.telefon && !gyldigTelefon(verdiar.telefon)) manglar.push('telefon');
  if (manglar.length) {
    hugsSkjema(res, verdiar);
    return res.redirect('/kontakt?feil=' + encodeURIComponent(manglar.join('-')) + '#skjema');
  }
  try {
    await store.addMessage({
      id: crypto.randomUUID(),
      tid: new Date().toISOString(),
      navn: verdiar.navn,
      epost: verdiar.epost,
      telefon: verdiar.telefon,
      tjeneste: verdiar.tjeneste,
      melding: verdiar.melding,
      lest: false,
    });
    res.redirect('/kontakt?sendt=1#skjema');
  } catch (e) {
    console.error('Klarte ikkje lagre melding:', e.message);
    // Feilen er vår, ikkje kunden sin - ta vare på det han skreiv
    hugsSkjema(res, verdiar);
    res.redirect('/kontakt?feil=teknisk#skjema');
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
  const ip = auth.klientIp(req);
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
    lagringsmodus: store.erDegradert() ? 'utilgjengeleg' : (store.remote ? 'GitHub' : 'lokalt'),
    noindex: NOINDEX,
  });
});

app.get('/admin/api/innhald', auth.requireAdmin, (req, res) => {
  res.json(store.getContent());
});

// Sjekkar at innhaldet har den forma visningane reknar med. Utan dette kunne
// eit feilforma lagringskall ta ned alle sidene med 500 - og admin-panelet med,
// slik at feilen ikkje lét seg rette utan å gå i databasen for hand.
function validerInnhald(c) {
  const feil = [];
  const erObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  if (!erObj(c)) return ['Innhaldet må vere eit objekt'];
  for (const n of ['bedrift', 'varsel', 'forside', 'omOss', 'kontakt', 'seo']) {
    if (!erObj(c[n])) feil.push(`«${n}» manglar eller har feil form`);
  }
  for (const n of ['tjenester', 'galleri', 'omtaler']) {
    if (!Array.isArray(c[n])) feil.push(`«${n}» må vere ei liste`);
  }
  if (erObj(c.forside)) {
    for (const n of ['nokkeltall', 'hvorforPunkter', 'fargevegg']) {
      if (!Array.isArray(c.forside[n])) feil.push(`«forside.${n}» må vere ei liste`);
    }
  }
  if (erObj(c.bedrift) && !Array.isArray(c.bedrift.apningstider)) {
    feil.push('«bedrift.apningstider» må vere ei liste');
  }
  if (Array.isArray(c.tjenester) && c.tjenester.some((t) => !erObj(t))) {
    feil.push('Kvar teneste må vere eit objekt');
  }
  if (Array.isArray(c.galleri) && c.galleri.some((g) => !erObj(g))) {
    feil.push('Kvart galleribilete må vere eit objekt');
  }
  if (Array.isArray(c.forside && c.forside.fargevegg) && c.forside.fargevegg.some((f) => !erObj(f))) {
    feil.push('Kvar farge må vere eit objekt');
  }
  return feil;
}

app.post('/admin/api/innhald', auth.requireAdmin, async (req, res) => {
  const nytt = req.body;
  const feil = validerInnhald(nytt);
  if (feil.length) {
    return res.status(400).json({ feil: 'Innhaldet vart ikkje lagra: ' + feil.join('. ') });
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
  limits: { fileSize: 12 * 1024 * 1024, files: 1 },
});

// Eit lite, men ekstremt høgoppløyst bilete kan blåse opp minnebruken langt over
// det ein 512 MB-instans toler. Vi held oss difor til éin sharp-jobb om gongen og
// avviser bilete over 40 megapiksel (langt over det eit mobilkamera lagar).
sharp.concurrency(1);
const MAKS_PIKSLAR = 40e6;

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
    const webp = await sharp(req.file.buffer, { limitInputPixels: MAKS_PIKSLAR })
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
    // Sida er oppe, men all lagring er sperra til vi veit kva som ligg i lageret.
    // Prøv på nytt med jamne mellomrom, så løyser det seg av seg sjølv.
    const prov = setInterval(() => {
      store.proevIgjen().then((ok) => { if (ok) clearInterval(prov); });
    }, 60 * 1000);
    prov.unref();
  })
  .finally(() => {
    app.listen(PORT, () => console.log(`Køyrer på port ${PORT} (${BASE_URL}), noindex=${NOINDEX}`));
  });
