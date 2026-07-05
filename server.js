// Gaia Food App — server statico + API backend (file-based, zero dipendenze).
// Uso: node server.js   (porta 4324). Archivio: data/producers.json (live). Auth: data/config.json.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = __dirname, PORT = process.env.PORT || 4324;
const CONFIG = path.join(ROOT, 'data', 'config.json');
// Persistenza dati (utenti, produttori, waitlist, candidature) → modulo store.
// Con DATABASE_URL → Postgres/Neon (durevole a riavvii/deploy); senza → file JSON (locale/test).
const DB = require('./db');
const { readUsers, writeUsers, readStore, writeStore, readWait, writeWait, readCand, writeCand, readCrm, writeCrm } = DB;
// I MEDIA caricati (foto/video, avatar) restano su disco (GF_DATA_DIR o ./data). NB: su hosting free il
// disco è effimero → gli upload non sopravvivono ai deploy (migrazione a object-storage: passo successivo).
const DATA_RW = process.env.GF_DATA_DIR || path.join(ROOT, 'data');
const PHOTODIR = path.join(DATA_RW, 'assets', 'photos', 'producers');
const VIDEODIR = path.join(DATA_RW, 'assets', 'videos', 'producers');
const CANDPHOTODIR = path.join(DATA_RW, 'assets', 'photos', 'candidature');
const USERPHOTODIR = path.join(DATA_RW, 'assets', 'photos', 'users'); // avatar utenti finali
fs.mkdirSync(DATA_RW, { recursive: true });
fs.mkdirSync(USERPHOTODIR, { recursive: true });
fs.mkdirSync(PHOTODIR, { recursive: true });
fs.mkdirSync(VIDEODIR, { recursive: true });
fs.mkdirSync(CANDPHOTODIR, { recursive: true });

// Limiti payload: JSON normale 12MB, upload media (foto/video base64) fino a 80MB.
const BODY_MAX_JSON = 12e6, BODY_MAX_MEDIA = 80e6;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.mp4': 'video/mp4', '.webm': 'video/webm' };

const sessions = new Map(); // token -> role (staff: admin/verificatore)
const userSessions = new Map(); // token -> userId (utenti finali, separati dallo staff)
// Google Sign-In: client id da env. Se assente, l'endpoint /api/auth/google risponde 503.
const GOOGLE_CLIENT_ID = process.env.GF_GOOGLE_CLIENT_ID || '';
const config = () => { try { return JSON.parse(fs.readFileSync(CONFIG, 'utf8')); } catch { return {}; } };
// Password: prima le env (produzione), poi fallback a config.json (locale). Retro-compatibile.
const adminPass = (cfg) => process.env.GF_ADMIN_PASSWORD || cfg.adminPassword;
const verifierPass = (cfg) => process.env.GF_VERIFIER_PASSWORD || cfg.verifierPassword;

// Rate-limiting in-memory per IP (finestra scorrevole a conteggio). Bucket separati per tipo di endpoint.
const LOGIN_WINDOW_MS = 60 * 1000;
const loginHits = new Map();   // login staff
const authHits = new Map();    // login utente finale (email/google)
const publicHits = new Map();  // POST pubblici (waitlist, candidature)
function clientIp(req) {
  const xff = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || (req.socket && req.socket.remoteAddress) || 'unknown';
}
function throttle(bucket, req, max, windowMs = LOGIN_WINDOW_MS) {
  const ip = clientIp(req), now = Date.now();
  let e = bucket.get(ip);
  if (!e || now >= e.resetAt) { e = { count: 0, resetAt: now + windowMs }; bucket.set(ip, e); }
  e.count++;
  if (e.count > max) return { limited: true, retryAfter: Math.max(1, Math.ceil((e.resetAt - now) / 1000)) };
  return { limited: false };
}
const loginThrottle = (req) => throttle(loginHits, req, 5);
// Pulizia periodica delle voci scadute (evita crescita illimitata della mappa).
setInterval(() => { const now = Date.now(); for (const [ip, e] of loginHits) if (now >= e.resetAt) loginHits.delete(ip); }, LOGIN_WINDOW_MS).unref();
const slugify = s => (s || 'produttore').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

function send(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); }
function body(req, max = BODY_MAX_JSON) { return new Promise((ok) => { let b = ''; req.on('data', c => { b += c; if (b.length > max) req.destroy(); }); req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch { ok({}); } }); }); }
function roleOf(req) { const c = req.headers.cookie || ''; const m = c.match(/gf_sess=([^;]+)/); return m ? sessions.get(m[1]) || null : null; }
const canEdit = r => r === 'admin' || r === 'verificatore';

// --- auth utente finale (Google / email / ospite), separata dallo staff ---
const userTokenOf = (req) => { const m = (req.headers.cookie || '').match(/gf_user=([^;]+)/); return m ? m[1] : null; };
function userOf(req) { const t = userTokenOf(req); const id = t && userSessions.get(t); return id ? readUsers().users.find(u => u.id === id) || null : null; }
// Crea sessione utente + cookie httpOnly; ritorna l'header Set-Cookie.
function startUserSession(res, userId) {
  const tok = crypto.randomBytes(18).toString('hex'); userSessions.set(tok, userId);
  return `gf_user=${tok}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`; // 30 giorni
}
// Upsert utente in users.json: aggiorna i campi noti, preserva createdAt.
function upsertUser(fields) {
  const db = readUsers();
  let u = db.users.find(x => x.id === fields.id);
  if (u) { Object.assign(u, fields, { createdAt: u.createdAt }); }
  else { u = { ...fields, createdAt: new Date().toISOString() }; db.users.push(u); }
  writeUsers(db); return u;
}
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// --- password: hash scrypt (zero dipendenze). Salvato come "salt:hash" (hex). ---
const PW_MIN = 8;
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(String(pw), salt, 64).toString('hex');
}
function verifyPassword(pw, stored) {
  if (!stored || String(stored).indexOf(':') < 0) return false;
  const i = stored.indexOf(':'), salt = stored.slice(0, i), hash = stored.slice(i + 1);
  let calc; try { calc = crypto.scryptSync(String(pw), salt, 64).toString('hex'); } catch { return false; }
  const a = Buffer.from(hash, 'hex'), b = Buffer.from(calc, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
// Utente "pubblico": non esporre MAI passHash al client.
function publicUser(u) { if (!u) return null; const { passHash, ...rest } = u; return rest; }

// --- Referral "I Custodi di Gaia": ogni utente ha un "seme" (codice personale);
//     chi si iscrive con un seme resta collegato all'invitante (referredBy). ---
function ensureSeed(u) {
  const db = readUsers();
  const target = db.users.find(x => x.id === u.id);
  if (!target) return u.seed || null;
  if (target.seed) { u.seed = target.seed; return target.seed; }
  const base = slugify((u.email || u.id || 'custode').split('@')[0]) || 'custode';
  let code = base, i = 2;
  while (db.users.some(x => x.seed === code)) code = base + '-' + (i++);
  target.seed = code; u.seed = code; writeUsers(db);
  return code;
}
function linkReferral(user, seme) {
  const code = slugify(String(seme || '').slice(0, 60));
  if (!code) return;
  const db = readUsers();
  const target = db.users.find(x => x.id === user.id);
  if (!target || target.referredBy) return;               // già collegato o inesistente
  const referrer = db.users.find(x => x.seed === code);
  if (!referrer || referrer.id === user.id) return;        // niente auto-invito / seme inesistente
  target.referredBy = code; target.referredAt = new Date().toISOString();
  writeUsers(db);
}
// Riepilogo "I Custodi di Gaia" per un utente (seed già calcolato). PURA e deterministica
// (now iniettato) → testabile a unità: stato del seme per età, conteggi, credito, commissione, livello.
function custodiSummary(users, seed, meId, now = Date.now()) {
  const DAY = 86400000;
  // Stato del seme (proxy temporale, in attesa del segnale reale acquisto/attività — "da definire"):
  // <2 giorni = Seme · 2–60 giorni = Germoglio · >60 giorni = Radicato.
  const stateOf = (u) => {
    const age = (now - new Date(u.referredAt || u.createdAt || now).getTime()) / DAY;
    if (age >= 60) return 'radicato';
    if (age >= 2) return 'germoglio';
    return 'seme';
  };
  const people = (users || [])
    .filter(u => u.referredBy === seed && u.id !== meId)
    .map(u => ({ name: (u.name && u.name.trim()) || (u.email ? u.email.split('@')[0] : 'Nuovo seme'), state: stateOf(u) }));
  const counts = { seme: 0, germoglio: 0, radicato: 0, total: people.length };
  people.forEach(p => counts[p.state]++);
  const PER = 8;            // €8/anno di credito per radicato (Custode-Cliente) — da validare sul Business Plan
  const FREE_AT = 5;        // 5 radicati = rinnovo annuale gratis
  const credit = counts.radicato * PER;
  const LV = [
    { key: 'seme', label: 'Seme', min: 0 },
    { key: 'custode', label: 'Custode', min: 1 },
    { key: 'borgo', label: 'Custode del Borgo', min: 5 },
    { key: 'territorio', label: 'Custode del Territorio', min: 15 },
  ];
  let level = LV[0];
  for (const L of LV) if (counts.radicato >= L.min) level = L;
  const next = LV.find(L => L.min > counts.radicato) || null;
  // Custode-Produttore: commissione reale ~20% di €39 = €7,80/anno per abbonato attivo — da validare sul BP.
  const COMM = 7.8;
  const commission = Math.round(counts.radicato * COMM * 100) / 100;
  return { seed, credit, perActive: PER, commission, perCommission: COMM, freeAt: FREE_AT, counts, people, level, next };
}

// --- CRM: costruisce la lista contatti (membri + candidature + waitlist) unendo lo stage salvato.
//     Consumato SOLO dall'endpoint admin (protetto da GF_ADMIN_TOKEN), a sua volta dietro il proxy del Lab. ---
const CRM_DEFAULT_STAGES = [
  { id: 'nuovo', label: 'Nuovo' }, { id: 'contattato', label: 'Contattato' },
  { id: 'qualificato', label: 'Qualificato' }, { id: 'trattativa', label: 'Trattativa' }, { id: 'cliente', label: 'Cliente' },
];
const crmStages = (crm) => (Array.isArray(crm.pipeline) && crm.pipeline.length ? crm.pipeline : CRM_DEFAULT_STAGES);
// Questo servizio possiede SOLO i dati di Gaia Food (membri/candidature/waitlist): i contatti "derivati"
// esistono quindi solo per i progetti gaia-food. Gli altri progetti (es. DFE) hanno solo i contatti manuali
// (+ in futuro connettori dedicati, es. GHL). Lo store CRM (stage/nascosti/manuali/pipeline) è per-progetto.
const isGaiaProject = (p) => String(p || '').startsWith('gaia-food');

function crmContacts(project) {
  const crm = readCrm(project);
  const states = crm.states || {};
  const hidden = new Set(crm.hidden || []);
  const validStage = new Set(crmStages(crm).map((s) => s.id));
  const stageOf = (id, def) => {
    const s = (states[id] && states[id].stage) || def;
    return validStage.has(s) ? s : crmStages(crm)[0].id; // se lo stage salvato non esiste più → primo
  };
  const day = (v) => (v ? String(v).slice(0, 10) : '');
  const out = [];
  if (isGaiaProject(project)) {   // contatti DERIVATI: solo per i progetti Gaia Food (unica fonte di questo servizio)
  for (const u of readUsers().users) {
    const id = 'u:' + u.id;
    if (hidden.has(id)) continue;
    out.push({
      id, name: (u.name && u.name.trim()) || (u.email ? u.email.split('@')[0] : 'Membro'),
      email: u.email || '', seg: 'membro', src: u.provider === 'google' ? 'google' : 'app',
      picture: u.picture || '', stage: stageOf(id, 'nuovo'), sig: 'cold',
      zona: u.zone ? (u.zone.label || u.zone.region || '') : '', custode: u.referredBy || '',
      hist: [u.createdAt ? ('Iscritto ' + day(u.createdAt)) : null, u.zone ? ('Zona: ' + (u.zone.label || u.zone.region || '')) : null].filter(Boolean),
    });
  }
  const stMap = { todo: 'nuovo', visita: 'qualificato', done: 'cliente' };
  for (const c of readCand().candidature) {
    const id = 'c:' + c.id;
    if (hidden.has(id)) continue;
    out.push({
      id, name: c.name || 'Produttore', email: [c.place, (c.categories || []).join(', ')].filter(Boolean).join(' · '),
      seg: 'produttore', src: 'sito', picture: '', stage: stageOf(id, stMap[c.state] || 'nuovo'), sig: 'cold',
      zona: c.place || '', hist: [c.ts ? ('Candidatura ' + day(c.ts)) : null].filter(Boolean),
    });
  }
  const seen = new Set();
  for (const l of readWait().leads) {
    const id = 'w:' + (l.email || '') + ':' + (l.zona || '');
    if (seen.has(id) || hidden.has(id)) continue; seen.add(id);
    out.push({
      id, name: l.email ? l.email.split('@')[0] : 'Lead', email: l.zona || '',
      seg: 'waitlist', src: l.source || 'sito', picture: '', stage: stageOf(id, 'nuovo'), sig: 'cold',
      zona: l.zona || '', hist: [l.ts ? ('Richiesta zona ' + day(l.ts)) : null].filter(Boolean),
    });
  }
  } // fine contatti derivati (solo Gaia)
  for (const m of (crm.manual || [])) {
    out.push({
      id: m.id, name: m.name || 'Contatto', email: m.email || m.phone || '', seg: m.seg || 'lead',
      src: m.src || 'manuale', picture: '', stage: stageOf(m.id, m.stage || 'nuovo'), sig: m.sig || 'cold',
      zona: m.zona || '', note: m.note || '', manual: true,
      hist: [m.createdAt ? ('Aggiunto ' + day(m.createdAt)) : null, m.note || null].filter(Boolean),
    });
  }
  return out;
}

// --- normalizzazione campi produttore (difende lo store da payload malformati) ---
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const str = (v, max = 4000) => (v == null ? '' : String(v)).slice(0, max);
// Un video: 3 tipi, titolo/durata/stato/tono + sorgente (src/url) e poster opzionali.
function cleanVideo(v) {
  if (!v || typeof v !== 'object') return null;
  const type = ['presentazione', 'storia', 'metodo'].includes(v.type) ? v.type : str(v.type, 40);
  const state = v.state === 'ready' ? 'ready' : 'coming';
  const o = { type, title: str(v.title, 160), duration: str(v.duration, 16), state, tone: str(v.tone, 40) };
  if (v.src) o.src = str(v.src, 1200);       // URL o path della sorgente video (mp4/embed)
  if (v.poster) o.poster = str(v.poster, 1200); // URL o path del poster
  return o;
}
// Una voce di inventario "di stagione": etichetta + tono colore + nota.
function cleanSeasonal(s) {
  if (!s || typeof s !== 'object') return null;
  return { label: str(s.label, 120), tone: str(s.tone, 40), note: str(s.note, 240) };
}
// Normalizza solo i campi presenti nel patch (PATCH parziale-safe); lascia intatto il resto.
function normalizePatch(patch) {
  const out = { ...patch };
  if ('km' in out) out.km = num(out.km) || 0;
  if ('lat' in out) out.lat = num(out.lat);
  if ('lng' in out) out.lng = num(out.lng);
  if ('categories' in out) out.categories = Array.isArray(out.categories) ? out.categories.map(c => str(c, 60)) : [];
  if ('videos' in out) out.videos = (Array.isArray(out.videos) ? out.videos : []).map(cleanVideo).filter(Boolean);
  if ('seasonal' in out) out.seasonal = (Array.isArray(out.seasonal) ? out.seasonal : []).map(cleanSeasonal).filter(Boolean);
  if ('verify' in out && out.verify && typeof out.verify === 'object') {
    out.verify = { state: str(out.verify.state, 40) || 'valid', date: str(out.verify.date, 60), next: str(out.verify.next, 60) };
  }
  if ('contact' in out && out.contact && typeof out.contact === 'object') out.contact = { ...out.contact };
  return out;
}

async function api(req, res, url) {
  const seg = url.split('/').filter(Boolean); // ['api','producers',':id', ...]
  const method = req.method;

  // --- auth ---
  if (url === '/api/login' && method === 'POST') {
    const t = loginThrottle(req);
    if (t.limited) {
      res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8', 'Retry-After': String(t.retryAfter) });
      return res.end(JSON.stringify({ error: `Troppi tentativi. Riprova tra ${t.retryAfter}s.`, retryAfter: t.retryAfter }));
    }
    const { password } = await body(req); const cfg = config();
    let role = null;
    if (password && password === adminPass(cfg)) role = 'admin';
    else if (password && password === verifierPass(cfg)) role = 'verificatore';
    if (!role) return send(res, 401, { error: 'Password errata' });
    const tok = crypto.randomBytes(18).toString('hex'); sessions.set(tok, role);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': `gf_sess=${tok}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400` });
    return res.end(JSON.stringify({ role }));
  }
  if (url === '/api/logout' && method === 'POST') {
    const c = req.headers.cookie || ''; const m = c.match(/gf_sess=([^;]+)/); if (m) sessions.delete(m[1]);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': 'gf_sess=; Path=/; Max-Age=0' }); return res.end('{}');
  }
  if (url === '/api/me') return send(res, 200, { role: roleOf(req) });

  // --- auth utente finale (Google reale / email / ospite), namespace /api/auth/* ---
  // Google: il client invia l'idToken (Google Identity Services); lo verifichiamo lato server.
  if (url === '/api/auth/google' && method === 'POST') {
    { const t = throttle(authHits, req, 10); if (t.limited) return send(res, 429, { error: 'Troppi tentativi, riprova tra poco', retryAfter: t.retryAfter }); }
    if (!GOOGLE_CLIENT_ID) return send(res, 503, { error: 'google_client_id_non_configurato' });
    const gbody = await body(req);
    const idToken = gbody.idToken;
    if (!idToken) return send(res, 400, { error: 'idToken mancante' });
    // Verifica il token via endpoint tokeninfo di Google (Node 18+ ha fetch globale).
    let info;
    try {
      const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken));
      info = await r.json();
      if (!r.ok) return send(res, 401, { error: 'token Google non valido' });
    } catch (e) { return send(res, 502, { error: 'verifica Google fallita' }); }
    if (info.aud !== GOOGLE_CLIENT_ID) return send(res, 401, { error: 'aud non corrispondente' });
    if (info.email_verified !== 'true' && info.email_verified !== true) return send(res, 401, { error: 'email non verificata' });
    const email = String(info.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return send(res, 401, { error: 'email non valida' });
    const isNew = !readUsers().users.some(x => x.id === email);
    const user = upsertUser({ id: email, email, name: str(info.name, 160), picture: str(info.picture, 1200), provider: 'google' });
    if (isNew) linkReferral(user, gbody.seme);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Set-Cookie': startUserSession(res, user.id) });
    return res.end(JSON.stringify({ user: publicUser(user) }));
  }
  // Registrazione: email + password (min PW_MIN). Se esiste già un account CON password → 409.
  if (url === '/api/auth/register' && method === 'POST') {
    { const t = throttle(authHits, req, 10); if (t.limited) return send(res, 429, { error: 'Troppi tentativi, riprova tra poco', retryAfter: t.retryAfter }); }
    const d = await body(req);
    const email = String(d.email || '').trim().toLowerCase();
    const pw = String(d.password || '');
    if (!EMAIL_RE.test(email)) return send(res, 400, { error: 'Email non valida' });
    if (pw.length < PW_MIN) return send(res, 400, { error: `La password deve avere almeno ${PW_MIN} caratteri` });
    const existing = readUsers().users.find(x => x.id === email);
    if (existing && existing.passHash) return send(res, 409, { error: 'Esiste già un account con questa email. Accedi.' });
    const isNew = !existing;
    const user = upsertUser({ id: email, email, provider: 'email', passHash: hashPassword(pw) });
    if (isNew) linkReferral(user, d.seme);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Set-Cookie': startUserSession(res, user.id) });
    return res.end(JSON.stringify({ user: publicUser(user) }));
  }
  // Login: email + password. Errore GENERICO (non riveliamo se l'email esiste).
  if (url === '/api/auth/login' && method === 'POST') {
    { const t = throttle(authHits, req, 10); if (t.limited) return send(res, 429, { error: 'Troppi tentativi, riprova tra poco', retryAfter: t.retryAfter }); }
    const d = await body(req);
    const email = String(d.email || '').trim().toLowerCase();
    const pw = String(d.password || '');
    if (!EMAIL_RE.test(email) || !pw) return send(res, 400, { error: 'Email o password mancanti' });
    const user = readUsers().users.find(x => x.id === email);
    if (!user || !user.passHash || !verifyPassword(pw, user.passHash)) return send(res, 401, { error: 'Email o password non corretti' });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Set-Cookie': startUserSession(res, user.id) });
    return res.end(JSON.stringify({ user: publicUser(user) }));
  }
  // Config pubblica per il client: espone SOLO il Google client id (non è un segreto)
  // così il bottone GSI può renderizzarsi senza hard-coding nel JS. Vuoto = login Google "da configurare".
  if (url === '/api/auth/config' && method === 'GET') return send(res, 200, { googleClientId: GOOGLE_CLIENT_ID });
  if (url === '/api/auth/me' && method === 'GET') return send(res, 200, { user: publicUser(userOf(req)) });
  if (url === '/api/auth/logout' && method === 'POST') {
    const t = userTokenOf(req); if (t) userSessions.delete(t);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': 'gf_user=; Path=/; Max-Age=0' });
    return res.end('{}');
  }
  // Profilo: imposta/aggiorna la ZONA (regione) dell'utente loggato → vista personalizzata per territorio.
  // Profilo utente: aggiorna zona E/O dati del profilo (nome, città, lingua, notifiche). Solo i campi presenti.
  if (url === '/api/auth/profile' && (method === 'PUT' || method === 'PATCH')) {
    const me = userOf(req); if (!me) return send(res, 401, { error: 'non_autenticato' });
    const d = await body(req);
    const upd = { id: me.id };
    if ('name' in d) upd.name = str(d.name, 80).trim();
    if ('city' in d) upd.city = str(d.city, 120).trim();
    if ('phone' in d) upd.phone = str(d.phone, 40).trim();
    if ('lang' in d) { const l = str(d.lang, 8).toLowerCase(); if (/^[a-z]{2}$/.test(l)) upd.lang = l; }
    if ('notif' in d) upd.notif = !!d.notif;
    if ('zone' in d) {
      const z = d.zone;
      upd.zone = (z && typeof z === 'object')
        ? { id: str(z.id, 80), label: str(z.label, 160), region: str(z.region, 80), comuni: Array.isArray(z.comuni) ? z.comuni.slice(0, 60).map(c => str(c, 80)) : [] }
        : null;
    }
    const user = upsertUser(upd);
    return send(res, 200, { user: publicUser(user) });
  }
  // Upload avatar dell'utente finale (base64 → file su disco). Riusa il pattern dei produttori.
  if (url === '/api/auth/avatar' && method === 'POST') {
    const me = userOf(req); if (!me) return send(res, 401, { error: 'non_autenticato' });
    const { dataUrl } = await body(req, BODY_MAX_MEDIA);
    const m = /^data:image\/(png|jpe?g|webp);base64,(.+)$/.exec(dataUrl || '');
    if (!m) return send(res, 400, { error: 'immagine non valida' });
    const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
    const safe = crypto.createHash('sha1').update(me.id).digest('hex').slice(0, 16); // id = email → hash per nome-file
    const file = `${safe}.${ext}`;
    fs.writeFileSync(path.join(USERPHOTODIR, file), Buffer.from(m[2], 'base64'));
    const user = upsertUser({ id: me.id, picture: `assets/photos/users/${file}` });
    return send(res, 200, { user: publicUser(user) });
  }

  // --- Custodi (referral): il "seme" dell'utente + persone portate + credito + livello ---
  if (url === '/api/custodi/me' && method === 'GET') {
    const me = userOf(req); if (!me) return send(res, 401, { error: 'non_autenticato' });
    const seed = ensureSeed(me);
    return send(res, 200, custodiSummary(readUsers().users, seed, me.id, Date.now()));
  }

  // --- CRM (contatti+pipeline) per il cruscotto del Lab. Protetto da GF_ADMIN_TOKEN (header x-admin-token):
  //     è consumato SOLO dal proxy serverless del Lab (server-to-server), il segreto non tocca mai il browser. ---
  if (seg[1] === 'admin' && seg[2] === 'crm') {
    const ADMIN_TOKEN = process.env.GF_ADMIN_TOKEN || '';
    if (!ADMIN_TOKEN) return send(res, 503, { error: 'crm_non_configurato' });
    if ((req.headers['x-admin-token'] || '') !== ADMIN_TOKEN) return send(res, 401, { error: 'non_autorizzato' });
    const project = str(new URLSearchParams(req.url.split('?')[1] || '').get('project') || '', 80).trim() || 'default';
    if (method === 'GET') return send(res, 200, { contacts: crmContacts(project), stages: crmStages(readCrm(project)) });
    if (method === 'POST') {
      const d = await body(req);
      const op = str(d.op, 20) || 'stage';
      const cr = readCrm(project);
      cr.states = cr.states || {}; cr.hidden = cr.hidden || []; cr.manual = cr.manual || []; cr.pipeline = cr.pipeline || [];
      if (op === 'stage') {
        const id = str(d.id, 200).trim(), stage = str(d.stage, 40).trim();
        if (!id || !stage) return send(res, 400, { error: 'id/stage mancanti' });
        cr.states[id] = { stage }; writeCrm(project, cr); return send(res, 200, { ok: true });
      }
      if (op === 'create') {
        const c = d.contact || {};
        const name = str(c.name, 120).trim();
        if (!name) return send(res, 400, { error: 'Il nome è obbligatorio' });
        const id = 'm:' + crypto.randomBytes(6).toString('hex');
        cr.manual.push({
          id, name, email: str(c.email, 160).trim(), phone: str(c.phone, 40).trim(),
          seg: ['membro', 'produttore', 'waitlist', 'lead'].includes(c.seg) ? c.seg : 'lead',
          src: str(c.src, 40).trim() || 'manuale', zona: str(c.zona, 120).trim(),
          note: str(c.note, 2000).trim(), stage: str(c.stage, 40).trim() || 'nuovo', createdAt: new Date().toISOString(),
        });
        writeCrm(project, cr); return send(res, 200, { ok: true, id });
      }
      if (op === 'delete') {
        const id = str(d.id, 200).trim();
        if (!id) return send(res, 400, { error: 'id mancante' });
        if (id.startsWith('m:')) cr.manual = cr.manual.filter((m) => m.id !== id);
        else if (!cr.hidden.includes(id)) cr.hidden.push(id);   // contatto derivato → archiviato (non tocca il dato-fonte)
        delete cr.states[id];
        writeCrm(project, cr); return send(res, 200, { ok: true });
      }
      if (op === 'pipeline') {
        const seen = new Set();
        const stages = (Array.isArray(d.stages) ? d.stages : []).slice(0, 12)
          .map((s) => ({ id: slugify(str((s && (s.id || s.label)) || '', 40)), label: str((s && s.label) || '', 40).trim() }))
          .filter((s) => s.id && s.label && !seen.has(s.id) && seen.add(s.id));
        if (!stages.length) return send(res, 400, { error: 'almeno uno stage' });
        cr.pipeline = stages; writeCrm(project, cr); return send(res, 200, { ok: true, stages });
      }
      return send(res, 400, { error: 'operazione sconosciuta' });
    }
    return send(res, 405, { error: 'metodo non consentito' });
  }

  // --- waitlist (lista d'attesa zone non coperte) — POST pubblico, GET solo admin ---
  if (seg[1] === 'waitlist') {
    if (method === 'POST') {
      { const t = throttle(publicHits, req, 8); if (t.limited) return send(res, 429, { error: 'Troppe richieste, riprova tra poco', retryAfter: t.retryAfter }); }
      const d = await body(req);
      const email = String(d.email || '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return send(res, 400, { error: 'Email non valida' });
      const wl = readWait();
      const zona = String(d.zona || '').slice(0, 120);
      if (!wl.leads.some(l => l.email === email && l.zona === zona)) {
        wl.leads.push({ email, zona, source: String(d.source || 'sito').slice(0, 40), ts: new Date().toISOString(), ip: clientIp(req) });
        writeWait(wl);
      }
      return send(res, 200, { ok: true });
    }
    if (method === 'GET') {
      if (!canEdit(roleOf(req))) return send(res, 403, { error: 'Accesso riservato' });
      return send(res, 200, readWait());
    }
  }

  // --- candidature (produttori che si candidano) — POST pubblico, GET solo staff ---
  if (seg[1] === 'candidature') {
    const id = seg[2];
    if (method === 'POST' && !id) { // invio candidatura dal form pubblico
      { const t = throttle(publicHits, req, 8); if (t.limited) return send(res, 429, { error: 'Troppe richieste, riprova tra poco', retryAfter: t.retryAfter }); }
      const d = await body(req);
      const name = str(d.name, 160).trim();
      if (!name) return send(res, 400, { error: 'Il nome azienda è obbligatorio' });
      const cand = readCand();
      const cid = crypto.randomBytes(8).toString('hex');
      const contact = (d.contact && typeof d.contact === 'object') ? d.contact : {};
      const entry = {
        id: cid,
        name,
        place: str(d.place, 160).trim(),
        categories: Array.isArray(d.categories) ? d.categories.map(c => str(c, 60)) : [],
        contact: {
          whatsapp: str(contact.whatsapp, 80).trim(),
          phone: str(contact.phone, 80).trim(),
          email: str(contact.email, 160).trim(),
        },
        note: str(d.note, 2000).trim(),
        photos: Array.isArray(d.photos) ? d.photos.slice(0, 6).map(s => str(s, 1200)) : [],
        state: 'todo', // todo -> visita -> done
        ts: new Date().toISOString(),
      };
      cand.candidature.push(entry);
      writeCand(cand);
      return send(res, 200, { ok: true, id: cid, candidatura: entry });
    }
    if (method === 'GET' && id) { // dettaglio singola candidatura (staff)
      if (!canEdit(roleOf(req))) return send(res, 403, { error: 'Accesso riservato' });
      const c = readCand().candidature.find(x => x.id === id);
      return c ? send(res, 200, c) : send(res, 404, { error: 'not found' });
    }
    if (method === 'GET' && !id) { // lista candidature (staff)
      if (!canEdit(roleOf(req))) return send(res, 403, { error: 'Accesso riservato' });
      return send(res, 200, readCand());
    }
    if (id && (method === 'PUT' || method === 'PATCH')) { // aggiorna stato (staff)
      if (!canEdit(roleOf(req))) return send(res, 403, { error: 'Accesso riservato' });
      const d = await body(req); const cand = readCand();
      const c = cand.candidature.find(x => x.id === id);
      if (!c) return send(res, 404, { error: 'not found' });
      if ('state' in d) c.state = ['todo', 'visita', 'done'].includes(d.state) ? d.state : c.state;
      writeCand(cand); return send(res, 200, c);
    }
    if (id && method === 'DELETE') { // rimuovi (staff)
      if (!canEdit(roleOf(req))) return send(res, 403, { error: 'Accesso riservato' });
      const cand = readCand(); const i = cand.candidature.findIndex(x => x.id === id);
      if (i < 0) return send(res, 404, { error: 'not found' });
      cand.candidature.splice(i, 1); writeCand(cand); return send(res, 200, { ok: true });
    }
  }

  // --- producers ---
  if (seg[1] === 'producers') {
    const store = readStore();
    const id = seg[2];
    // GET list / one (pubblico)
    if (method === 'GET' && !id) return send(res, 200, store);
    if (method === 'GET' && id) { const p = store.producers.find(x => x.id === id); return p ? send(res, 200, p) : send(res, 404, { error: 'not found' }); }

    // mutazioni: serve ruolo
    const role = roleOf(req);
    if (!canEdit(role)) return send(res, 403, { error: 'Accesso riservato' });

    if (method === 'POST' && !id) { // crea
      const data = normalizePatch(await body(req));
      let nid = slugify(data.name || data.id || 'produttore'); let n = nid, i = 2;
      while (store.producers.some(p => p.id === n)) n = nid + '-' + (i++);
      const p = Object.assign({ categories: [], primary: 'latte', tone: 'pascolo', verify: { state: 'valid', date: '' }, seasonal: [], videos: [], contact: {} }, data, { id: n });
      store.producers.push(p); writeStore(store); return send(res, 200, p);
    }
    if (id && (method === 'PUT' || method === 'PATCH')) { // aggiorna
      const patch = normalizePatch(await body(req)); const p = store.producers.find(x => x.id === id);
      if (!p) return send(res, 404, { error: 'not found' });
      Object.assign(p, patch, { id }); writeStore(store); return send(res, 200, p);
    }
    if (id && seg[3] === 'photo' && method === 'POST') { // upload foto
      const { dataUrl } = await body(req, BODY_MAX_MEDIA); const p = store.producers.find(x => x.id === id);
      if (!p) return send(res, 404, { error: 'not found' });
      const m = /^data:image\/(png|jpe?g|webp);base64,(.+)$/.exec(dataUrl || '');
      if (!m) return send(res, 400, { error: 'immagine non valida' });
      const ext = m[1] === 'jpeg' ? 'jpg' : m[1]; const file = `${id}.${ext}`;
      fs.writeFileSync(path.join(PHOTODIR, file), Buffer.from(m[2], 'base64'));
      p.photo = `assets/photos/producers/${file}`; writeStore(store); return send(res, 200, p);
    }
    if (id && seg[3] === 'video' && method === 'POST') { // upload file video → salva in assets, ritorna l'URL
      const d = await body(req, BODY_MAX_MEDIA); const p = store.producers.find(x => x.id === id);
      if (!p) return send(res, 404, { error: 'not found' });
      const m = /^data:video\/(mp4|webm|quicktime);base64,(.+)$/.exec(d.dataUrl || '');
      if (!m) return send(res, 400, { error: 'video non valido (mp4/webm)' });
      const buf = Buffer.from(m[2], 'base64');
      if (buf.length > BODY_MAX_MEDIA) return send(res, 413, { error: 'video troppo grande (max ~60MB)' });
      const ext = m[1] === 'quicktime' ? 'mp4' : m[1];
      const slot = ['presentazione', 'storia', 'metodo'].includes(d.type) ? d.type : 'extra';
      const file = `${id}-${slot}.${ext}`;
      fs.writeFileSync(path.join(VIDEODIR, file), buf);
      const url = `assets/videos/producers/${file}`;
      return send(res, 200, { url, type: slot }); // l'editor scrive poi src nel video corrispondente via PUT
    }
    if (id && method === 'DELETE') { // elimina
      const i = store.producers.findIndex(x => x.id === id);
      if (i < 0) return send(res, 404, { error: 'not found' });
      store.producers.splice(i, 1); writeStore(store); return send(res, 200, { ok: true });
    }
  }
  return send(res, 404, { error: 'route api inesistente' });
}

function requestHandler(req, res) {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url.startsWith('/api/')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    return api(req, res, url).catch(e => send(res, 500, { error: String(e) }));
  }
  // statico
  let p = url === '/' ? '/index.html' : url;
  let f = path.join(ROOT, p);
  if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
  if (f === CONFIG) { res.writeHead(403); return res.end('forbidden'); } // mai servire i segreti
  fs.readFile(f, (err, data) => {
    if (err) {
      // I media CARICATI vivono sul disco persistente (DATA_RW/assets/...): provali lì.
      if (url.startsWith('/assets/')) {
        const alt = path.join(DATA_RW, url);
        if (!alt.startsWith(DATA_RW)) { res.writeHead(403); return res.end('forbidden'); }
        return fs.readFile(alt, (e3, d3) => {
          if (e3) { res.writeHead(404); return res.end('not found'); }
          res.writeHead(200, { 'Content-Type': MIME[path.extname(alt)] || 'application/octet-stream' }); res.end(d3);
        });
      }
      // Altre rotte non-file → SPA fallback su index.html.
      return fs.readFile(path.join(ROOT, 'index.html'), (e2, d2) => {
        if (e2) { res.writeHead(404); return res.end('not found'); }
        res.writeHead(200, { 'Content-Type': MIME['.html'] }); res.end(d2);
      });
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(data);
  });
}

// Avvio del server SOLO quando eseguito direttamente (`node server.js`). Quando il file è
// importato da un test (require/import), non ci si mette in ascolto: si espongono le funzioni pure
// e l'handler HTTP, così i test possono creare un server usa-e-getta su porta effimera.
if (require.main === module) {
  DB.init()
    .then(() => http.createServer(requestHandler).listen(PORT, () => console.log(`Gaia Food App + API → http://localhost:${PORT} [store: ${DB.mode}]`)))
    .catch((e) => { console.error('Avvio store fallito:', e); process.exit(1); });
  // Su deploy/stop Render manda SIGTERM: svuota la coda di persistenza prima di uscire.
  process.on('SIGTERM', () => { Promise.resolve(DB.flush && DB.flush()).finally(() => process.exit(0)); });
}

module.exports = {
  requestHandler,
  // logica di business / utility pure (testabili a unità)
  custodiSummary, slugify, num, str, cleanVideo, cleanSeasonal, normalizePatch,
  throttle, EMAIL_RE, hashPassword, verifyPassword, publicUser,
};
