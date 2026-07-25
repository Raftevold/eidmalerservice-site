// Innhaldslager for Eid Malerservice-sida.
// Persistens: filer i ei eiga "data"-grein i GitHub-repoet (via GitHub API).
// Render gratisplan har flyktig filsystem, så alt som skal overleve omstart
// blir committa til GitHub og lese inn att ved oppstart.
// Utan GITHUB_TOKEN (lokal utvikling) blir alt lagra i ./data-local i staden.

const fs = require('fs');
const path = require('path');

const TOKEN = process.env.GITHUB_TOKEN || '';
const OWNER = process.env.GH_OWNER || 'Raftevold';
const REPO = process.env.GH_REPO || 'eidmalerservice-site';
const BRANCH = process.env.GH_DATA_BRANCH || 'data';
const API = 'https://api.github.com';
const LOCAL_DIR = path.join(__dirname, '..', 'data-local');
const DEFAULT_CONTENT = path.join(__dirname, '..', 'content', 'default-content.json');

const remote = Boolean(TOKEN);

// I minne-cache. shas trengst for GitHub-oppdateringar.
const cache = { content: null, messages: null, shas: {}, uploads: new Map() };

// Set til true om vi køyrer på standardinnhald fordi lageret ikkje kunne lesast.
// Då er alle skrivingar sperra, slik at vi ikkje overskriv ekte data.
let degradert = false;

// Filnamn vi har slått opp og ikkje funne. Utan denne kan kven som helst
// tømme GitHub-kvoten ved å be om tilfeldige filnamn på /opplast/.
const manglandeOpplast = new Map();
const MANGLANDE_TTL = 5 * 60 * 1000;

function ghHeaders(extra) {
  return Object.assign({
    Authorization: `token ${TOKEN}`,
    'User-Agent': 'eidmalerservice-site',
    Accept: 'application/vnd.github+json',
  }, extra || {});
}

async function ghGetFile(filePath) {
  const res = await fetch(`${API}/repos/${OWNER}/${REPO}/contents/${filePath}?ref=${BRANCH}`, { headers: ghHeaders() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub GET ${filePath}: ${res.status}`);
  const json = await res.json();
  return { sha: json.sha, buffer: Buffer.from(json.content, 'base64') };
}

async function ghPutFile(filePath, buffer, message) {
  const body = {
    message,
    content: buffer.toString('base64'),
    branch: BRANCH,
  };
  if (cache.shas[filePath]) body.sha = cache.shas[filePath];
  const res = await fetch(`${API}/repos/${OWNER}/${REPO}/contents/${filePath}`, {
    method: 'PUT',
    headers: ghHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  if (res.status === 409 || res.status === 422) {
    // sha utdatert - hent på nytt og prøv ein gong til
    const current = await ghGetFile(filePath);
    if (current) body.sha = current.sha; else delete body.sha;
    const retry = await fetch(`${API}/repos/${OWNER}/${REPO}/contents/${filePath}`, {
      method: 'PUT',
      headers: ghHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
    if (!retry.ok) throw new Error(`GitHub PUT ${filePath}: ${retry.status} ${await retry.text()}`);
    const rj = await retry.json();
    cache.shas[filePath] = rj.content.sha;
    return;
  }
  if (!res.ok) throw new Error(`GitHub PUT ${filePath}: ${res.status} ${await res.text()}`);
  const json = await res.json();
  cache.shas[filePath] = json.content.sha;
}

async function ghDeleteFile(filePath, message) {
  const current = await ghGetFile(filePath);
  if (!current) return;
  const res = await fetch(`${API}/repos/${OWNER}/${REPO}/contents/${filePath}`, {
    method: 'DELETE',
    headers: ghHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ message, sha: current.sha, branch: BRANCH }),
  });
  if (!res.ok) throw new Error(`GitHub DELETE ${filePath}: ${res.status}`);
  delete cache.shas[filePath];
}

// Sørgjer for at data-greina finst (opprettar frå main om ikkje).
async function ensureBranch() {
  const res = await fetch(`${API}/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`, { headers: ghHeaders() });
  if (res.ok) return;
  const main = await fetch(`${API}/repos/${OWNER}/${REPO}/git/ref/heads/main`, { headers: ghHeaders() });
  if (!main.ok) throw new Error('Fann ikkje main-greina');
  const mj = await main.json();
  const create = await fetch(`${API}/repos/${OWNER}/${REPO}/git/refs`, {
    method: 'POST',
    headers: ghHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ ref: `refs/heads/${BRANCH}`, sha: mj.object.sha }),
  });
  if (!create.ok) throw new Error(`Klarte ikkje opprette ${BRANCH}-greina: ${create.status}`);
}

function localRead(name) {
  const p = path.join(LOCAL_DIR, name);
  return fs.existsSync(p) ? fs.readFileSync(p) : null;
}

function localWrite(name, buffer) {
  const p = path.join(LOCAL_DIR, name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, buffer);
}

async function init() {
  const fallback = JSON.parse(fs.readFileSync(DEFAULT_CONTENT, 'utf8'));
  if (remote) {
    await ensureBranch();
    const c = await ghGetFile('content.json');
    if (c) {
      cache.content = JSON.parse(c.buffer.toString('utf8'));
      cache.shas['content.json'] = c.sha;
    } else {
      cache.content = fallback;
      await ghPutFile('content.json', Buffer.from(JSON.stringify(fallback, null, 2)), 'Opprett standardinnhald');
    }
    const m = await ghGetFile('messages.json');
    if (m) {
      cache.messages = JSON.parse(m.buffer.toString('utf8'));
      cache.shas['messages.json'] = m.sha;
    } else {
      cache.messages = [];
    }
  } else {
    const c = localRead('content.json');
    cache.content = c ? JSON.parse(c.toString('utf8')) : fallback;
    const m = localRead('messages.json');
    cache.messages = m ? JSON.parse(m.toString('utf8')) : [];
  }
}

function getContent() { return cache.content; }
function getMessages() { return cache.messages; }
function erDegradert() { return degradert; }

// Alle skrivingar går gjennom same kø. Utan dette kan to samtidige
// skjemainnsendingar lese same liste, leggje til kvar sin melding og skrive
// over kvarandre - den eine meldinga ville forsvunne utan spor.
let skrivekoe = Promise.resolve();
function iKoe(fn) {
  const neste = skrivekoe.then(fn, fn);
  // Hindrar at ei feila skriving stoppar køen for alle seinare skrivingar
  skrivekoe = neste.catch(() => {});
  return neste;
}

// Om init() feila i remote-modus, veit vi ikkje kva som faktisk ligg i GitHub.
// Då må vi nekte å skrive - elles overskriv vi ekte innhald og kundemeldingar
// med det tomme standardinnhaldet.
function sjekkSkrivbar() {
  if (degradert) {
    throw new Error('Innhaldslageret er ikkje tilgjengeleg akkurat no, så endringa vart ikkje lagra. Prøv igjen om litt.');
  }
}

async function saveContent(content) {
  return iKoe(async () => {
    sjekkSkrivbar();
    const buf = Buffer.from(JSON.stringify(content, null, 2));
    if (remote) await ghPutFile('content.json', buf, 'Oppdater innhald via admin');
    else localWrite('content.json', buf);
    // Oppdater cachen først NÅR lagringa lukkast, så minnet ikkje divergerer frå lageret
    cache.content = content;
  });
}

async function saveMessages(messages) {
  return iKoe(async () => {
    sjekkSkrivbar();
    const buf = Buffer.from(JSON.stringify(messages, null, 2));
    if (remote) await ghPutFile('messages.json', buf, 'Oppdater meldingar');
    else localWrite('messages.json', buf);
    cache.messages = messages;
  });
}

async function addMessage(msg) {
  return iKoe(async () => {
    sjekkSkrivbar();
    const messages = cache.messages.slice();
    messages.unshift(msg);
    // Ta vare på maks 200 meldingar
    const kutta = messages.slice(0, 200);
    const buf = Buffer.from(JSON.stringify(kutta, null, 2));
    if (remote) await ghPutFile('messages.json', buf, 'Ny melding frå kontaktskjemaet');
    else localWrite('messages.json', buf);
    cache.messages = kutta;
  });
}

function cacheUpload(filename, buffer) {
  cache.uploads.set(filename, buffer);
  // Avgrens minnebruken på 512 MB-instansen
  while (cache.uploads.size > 40) cache.uploads.delete(cache.uploads.keys().next().value);
}

async function saveUpload(filename, buffer) {
  return iKoe(async () => {
    sjekkSkrivbar();
    if (remote) await ghPutFile(`uploads/${filename}`, buffer, `Last opp ${filename}`);
    else localWrite(path.join('uploads', filename), buffer);
    manglandeOpplast.delete(filename);
    cacheUpload(filename, buffer);
  });
}

async function getUpload(filename) {
  if (cache.uploads.has(filename)) return cache.uploads.get(filename);
  const manglar = manglandeOpplast.get(filename);
  if (manglar && Date.now() < manglar) return null;
  if (remote) {
    // Raw-media-type fungerer òg for filer over 1 MB (contents-JSON gjer ikkje det)
    const res = await fetch(`${API}/repos/${OWNER}/${REPO}/contents/uploads/${filename}?ref=${BRANCH}`, {
      headers: ghHeaders({ Accept: 'application/vnd.github.raw' }),
    });
    if (res.status === 404) { hugsManglande(filename); return null; }
    if (!res.ok) throw new Error(`GitHub GET uploads/${filename}: ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length === 0) { hugsManglande(filename); return null; }
    cacheUpload(filename, buffer);
    return buffer;
  }
  const lokal = localRead(path.join('uploads', filename));
  if (!lokal) hugsManglande(filename);
  return lokal;
}

function hugsManglande(filename) {
  manglandeOpplast.set(filename, Date.now() + MANGLANDE_TTL);
  while (manglandeOpplast.size > 500) {
    manglandeOpplast.delete(manglandeOpplast.keys().next().value);
  }
}

// Listar opp alle opplasta bilete, nyaste først (filnamna startar med tidsstempel).
async function listUploads() {
  if (remote) {
    const res = await fetch(`${API}/repos/${OWNER}/${REPO}/contents/uploads?ref=${BRANCH}`, { headers: ghHeaders() });
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`GitHub GET uploads: ${res.status}`);
    const json = await res.json();
    return (Array.isArray(json) ? json : [])
      .filter((f) => f.type === 'file' && f.name.endsWith('.webp'))
      .map((f) => f.name)
      .sort()
      .reverse();
  }
  const dir = path.join(LOCAL_DIR, 'uploads');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((n) => n.endsWith('.webp')).sort().reverse();
}

async function deleteUpload(filename) {
  cache.uploads.delete(filename);
  if (remote) await ghDeleteFile(`uploads/${filename}`, `Slett ${filename}`);
  else {
    const p = path.join(LOCAL_DIR, 'uploads', filename);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

// Naudmodus: serv standardinnhald om lageret ikkje kan initialiserast (t.d. GitHub
// nede ved kaldstart). Sida held seg oppe, men vi merkjer oss at vi IKKJE veit kva
// som ligg i lageret, og sperrar alle skrivingar til init lukkast.
function initFallback() {
  cache.content = JSON.parse(fs.readFileSync(DEFAULT_CONTENT, 'utf8'));
  cache.messages = [];
  if (remote) degradert = true;
}

// Prøv å kome ut av naudmodus. Kallast med jamne mellomrom frå server.js.
async function proevIgjen() {
  if (!degradert) return true;
  try {
    await init();
    degradert = false;
    console.log('Innhaldslageret er tilgjengeleg igjen - lagring er open att.');
    return true;
  } catch (e) {
    return false;
  }
}

async function deleteUploadKoe(filename) {
  return iKoe(async () => {
    sjekkSkrivbar();
    return deleteUpload(filename);
  });
}

module.exports = {
  init, initFallback, proevIgjen, erDegradert,
  getContent, getMessages, saveContent, saveMessages, addMessage,
  saveUpload, getUpload, deleteUpload: deleteUploadKoe, listUploads, remote,
};
