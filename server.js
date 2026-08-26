// Gaia Food App — server statico + API backend (file-based, zero dipendenze).
// Uso: node server.js   (porta 4324). Archivio: data/producers.json (live). Auth: data/config.json.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = __dirname, PORT = process.env.PORT || 4324;
const CONFIG = path.join(ROOT, 'data', 'config.json');
// Persistenza dati (utenti, produttori, waitlist, candidature) → modulo store.
// Con DATABASE_URL → Postgres/Neon (durevole a riavvii/deploy); senza → file JSON (locale/test).
const DB = require('./db');
const { readUsers, writeUsers, readStore, writeStore, readWait, writeWait, readCand, writeCand, readCrm, writeCrm } = DB;
// Salvataggio media: Cloudinary in produzione (env), fallback su disco in dev/test (vedi media.js).
const { saveMedia, listDiskMediaAssets, deleteMediaAsset } = require('./media');
// I MEDIA caricati (foto/video, avatar) restano su disco (GF_DATA_DIR o ./data). NB: su hosting free il
// disco è effimero → gli upload non sopravvivono ai deploy (migrazione a object-storage: passo successivo).
const DATA_RW = process.env.GF_DATA_DIR || path.join(ROOT, 'data');
const PHOTODIR = path.join(DATA_RW, 'assets', 'photos', 'producers');
const VIDEODIR = path.join(DATA_RW, 'assets', 'videos', 'producers');
const CANDPHOTODIR = path.join(DATA_RW, 'assets', 'photos', 'candidature');
const USERPHOTODIR = path.join(DATA_RW, 'assets', 'photos', 'users'); // avatar utenti finali
const PRODMEDIADIR = path.join(DATA_RW, 'assets', 'media', 'producers'); // media self-service (fallback disco)
const SOCIALMEDIADIR = path.join(DATA_RW, 'assets', 'media', 'social'); // post/stories (fallback disco)
const SOCIAL_DISK_CAP_BYTES = Math.max(1024, Number(process.env.GF_SOCIAL_DISK_CAP_BYTES) || 750 * 1024 * 1024); // default: margine sotto il disco Render da 1 GiB
const positiveEnvMs = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};
// Policy approvata: un asset non referenziato resta recuperabile per almeno 24 ore. Anche lo sweep
// gira ogni 24 ore di default; gli env consentono finestre più strette esclusivamente in test/ops.
const SOCIAL_MEDIA_RETENTION_MS = positiveEnvMs('GF_SOCIAL_MEDIA_RETENTION_MS', 24 * 60 * 60 * 1000);
const SOCIAL_MEDIA_SWEEP_INTERVAL_MS = positiveEnvMs('GF_SOCIAL_MEDIA_SWEEP_INTERVAL_MS', 24 * 60 * 60 * 1000);
const SOCIAL_MEDIA_SWEEP_BATCH = Math.max(1, Math.min(100, Number(process.env.GF_SOCIAL_MEDIA_SWEEP_BATCH) || 25));
fs.mkdirSync(DATA_RW, { recursive: true });
fs.mkdirSync(USERPHOTODIR, { recursive: true });
fs.mkdirSync(PHOTODIR, { recursive: true });
fs.mkdirSync(VIDEODIR, { recursive: true });
fs.mkdirSync(CANDPHOTODIR, { recursive: true });
fs.mkdirSync(PRODMEDIADIR, { recursive: true });
fs.mkdirSync(SOCIALMEDIADIR, { recursive: true });

// Limiti payload: JSON normale 12MB, upload media (foto/video base64) fino a 25MB (audit S3: era 80MB → DoS).
// 25MB base64 copre foto da telefono e clip brevi; abbatte la pressione RAM per richiesta. Il body() tronca oltre soglia.
const BODY_MAX_JSON = 12e6, BODY_MAX_MEDIA = 26 * 1024 * 1024;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.mp4': 'video/mp4', '.webm': 'video/webm' };

// Sessioni STATELESS (audit R1 / obiettivo 1.2): niente Map in memoria → sopravvivono a riavvii/deploy
// e a più istanze. Il cookie contiene un token firmato HMAC (payload-base64 + firma), verificato ad ogni richiesta.
// Segreto: env GF_SESSION_SECRET se presente, altrimenti generato UNA volta e persistito nel DB (vedi sessionSecret()).
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
const socialPostHits = new Map();     // creazione/eliminazione post social (utente+IP)
const socialCommentHits = new Map();  // commenti social (utente+IP)
const socialReactionHits = new Map(); // like/save social (utente+IP)
const socialMediaHits = new Map();    // upload social (utente+IP)
const socialFollowHits = new Map();   // follow/unfollow (utente+IP)
const socialShareHits = new Map();    // condivisioni social (utente+IP)
const socialReportHits = new Map();   // segnalazioni social (utente+IP)
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
// Pulizia periodica delle voci scadute (evita crescita illimitata delle mappe).
setInterval(() => {
  const now = Date.now();
  for (const bucket of [loginHits, authHits, publicHits, socialPostHits, socialCommentHits, socialReactionHits,
    socialMediaHits, socialFollowHits, socialShareHits, socialReportHits]) {
    for (const [key, e] of bucket) if (now >= e.resetAt) bucket.delete(key);
  }
}, LOGIN_WINDOW_MS).unref();
const slugify = s => (s || 'produttore').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

function send(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); }
function body(req, max = BODY_MAX_JSON) {
  return new Promise((ok, fail) => {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > max) {
      // Consuma senza accumulare prima di rispondere: evita reset del socket mentre il client sta
      // ancora inviando il corpo, ma mantiene l'uso memoria costante.
      req.on('data', () => {});
      req.on('end', () => fail(Object.assign(new Error('payload_troppo_grande'), { code: 413 })));
      req.on('error', fail);
      return;
    }
    let b = '', bytes = 0, tooLarge = false;
    req.on('data', (chunk) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > max) { tooLarge = true; b = ''; return; }
      if (!tooLarge) b += chunk;
    });
    req.on('end', () => {
      if (tooLarge) return fail(Object.assign(new Error('payload_troppo_grande'), { code: 413 }));
      try { ok(b ? JSON.parse(b) : {}); } catch { ok({}); }
    });
    req.on('error', fail);
  });
}
// --- token di sessione firmati (stateless) ---
let _sessSecret = null;
function sessionSecret() {
  if (_sessSecret) return _sessSecret;
  if (process.env.GF_SESSION_SECRET) { _sessSecret = process.env.GF_SESSION_SECRET; return _sessSecret; }
  // Senza env: segreto generato una volta e PERSISTITO (riusa lo store crm_doc con chiave riservata '__sys').
  let doc = {}; try { doc = readCrm('__sys') || {}; } catch {}
  if (doc.sessionSecret) { _sessSecret = doc.sessionSecret; return _sessSecret; }
  _sessSecret = crypto.randomBytes(32).toString('hex');
  try { writeCrm('__sys', { ...doc, sessionSecret: _sessSecret }); } catch {}
  return _sessSecret;
}
const b64u = (s) => Buffer.from(s).toString('base64url');
function signSession(obj) {
  const bodyB = b64u(JSON.stringify(obj));
  const mac = crypto.createHmac('sha256', sessionSecret()).update(bodyB).digest('base64url');
  return bodyB + '.' + mac;
}
function verifySession(token, maxAgeMs) {
  if (!token || token.indexOf('.') < 0) return null;
  const i = token.lastIndexOf('.'), bodyB = token.slice(0, i), mac = token.slice(i + 1);
  const expected = crypto.createHmac('sha256', sessionSecret()).update(bodyB).digest('base64url');
  let a, b; try { a = Buffer.from(mac); b = Buffer.from(expected); } catch { return null; }
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let obj; try { obj = JSON.parse(Buffer.from(bodyB, 'base64url').toString('utf8')); } catch { return null; }
  if (maxAgeMs && obj.iat && (Date.now() - obj.iat > maxAgeMs)) return null;
  return obj;
}
const cookieVal = (req, name) => { const m = (req.headers.cookie || '').match(new RegExp(name + '=([^;]+)')); return m ? m[1] : null; };
// Cookie Secure solo dietro HTTPS (audit S2): in prod (Render) x-forwarded-proto=https → Secure; in locale (http) assente → i cookie funzionano anche in dev.
const secureFlag = (req) => (req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '');
const STAFF_MAXAGE = 86400e3, USER_MAXAGE = 2592000e3; // 1 giorno staff · 30 giorni utente
function roleOf(req) { const s = verifySession(cookieVal(req, 'gf_sess'), STAFF_MAXAGE); return (s && s.t === 'staff') ? s.role : null; }
// Identità staff dalla sessione (ruolo + nome digitato al login) — per attribuzione e audit-log (obiettivo 1.3).
function staffOf(req) { const s = verifySession(cookieVal(req, 'gf_sess'), STAFF_MAXAGE); return (s && s.t === 'staff') ? { role: s.role, name: s.name || 'staff' } : null; }
const canEdit = r => r === 'admin' || r === 'verificatore';

// --- Admin come proprietà dell'ACCOUNT (nuovo modello, sostituisce la password condivisa) ---
// Owner fissi = sempre admin, non declassabili: le mie email Google. Override/estensione via env CSV.
const OWNER_EMAILS = (process.env.GF_OWNER_EMAILS || 'danielefunnelexpert@gmail.com')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const isOwnerEmail = (email) => !!email && OWNER_EMAILS.includes(String(email).toLowerCase());

// --- auth utente finale (Google / email / ospite), separata dallo staff ---
const userTokenOf = (req) => cookieVal(req, 'gf_user');
function userOf(req) { const s = verifySession(cookieVal(req, 'gf_user'), USER_MAXAGE); if (!s || s.t !== 'user') return null; return readUsers().users.find(u => u.id === s.id) || null; }
// Scheda posseduta dall'utente loggato (owner). SICUREZZA: si risolve SEMPRE da userId→producerId,
// e la scheda deve avere ownerId === userId. Mai fidarsi di un producerId passato dal client.
function ownedProducer(req) {
  const me = userOf(req);
  if (!me || !me.producerId) return { me: me || null, store: null, p: null };
  const store = readStore();
  const p = store.producers.find(x => x.id === me.producerId && x.ownerId === me.id) || null;
  return { me, store, p };
}
// Ruolo staff EFFETTIVO dell'utente loggato (admin = proprietà dell'account).
// Owner (mie email Google, via login Google verificato) = admin fisso; altrimenti users.staffRole.
function userStaffRole(req) {
  const me = userOf(req);
  if (!me) return null;
  // Owner = admin fisso (la registrazione password dell'email owner è bloccata → nessun hijack futuro).
  if (isOwnerEmail(me.email || me.id)) return 'admin';
  return me.staffRole || null;
}
// Porta unificata per TUTTI i gate staff: prima l'utente loggato (nuovo modello),
// poi la vecchia sessione staff a password come fallback tecnico (spento in prod: nessuna password impostata).
function staffRole(req) { return userStaffRole(req) || roleOf(req); }
const isAdminReq = (req) => staffRole(req) === 'admin';
// Identità di chi agisce (per audit): preferisci l'utente admin loggato, poi la sessione staff legacy.
function actorOf(req) {
  const me = userOf(req), ur = userStaffRole(req);
  if (me && ur) return { role: ur, name: me.name || me.email || 'staff' };
  return staffOf(req) || { role: roleOf(req) || 'staff', name: 'staff' };
}

// Audit-log per-scheda (obiettivo 1.3): chi · azione · quando. Interno (strippato dal pubblico). Ritorna lo staff.
function auditPush(p, req, action) {
  const st = actorOf(req);
  p.audit = Array.isArray(p.audit) ? p.audit : [];
  p.audit.push({ ts: new Date().toISOString(), who: st.name, role: st.role, action });
  if (p.audit.length > 50) p.audit = p.audit.slice(-50);
  return st;
}
// Crea sessione utente + cookie httpOnly; ritorna l'header Set-Cookie.
function startUserSession(req, userId) {
  return `gf_user=${signSession({ t: 'user', id: userId, iat: Date.now() })}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secureFlag(req)}`; // 30 giorni
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
// Scheda produttore "pubblica" (security S1): strippa i campi interni/PII — soprattutto ownerId (= email
// del proprietario) — dalle risposte NON-staff. Il cliente vede solo ciò che deve.
function publicProducer(p) {
  if (!p || typeof p !== 'object') return p;
  const { ownerId, consent, submittedAt, verifiedAt, publishedAt, audit, approvedBy, publishedBy, ...pub } = p;
  return pub; // verify.by resta (è pubblico: mostra CHI ha verificato → fiducia)
}

// Livello di accesso EFFETTIVO di un utente (per la Gestione utenti). Ordine di precedenza chiaro.
function userLevel(u) {
  if (!u) return 'cliente';
  if (u.provider === 'google' && isOwnerEmail(u.email)) return 'admin';       // owner fisso
  if (u.staffRole === 'admin') return 'admin';
  if (u.staffRole === 'verificatore') return 'verificatore';
  if (['approved', 'onboarding', 'in_review', 'published'].includes(u.producerStatus)) return 'produttore';
  return 'cliente';
}

// Promuove un utente a PRODUTTORE: crea la scheda-bozza (semina dalla candidatura se presente), lega owner+stato.
// Riusato da: azione staff /producer/approve, endpoint admin livelli, accettazione invito. Idempotente sul producerId.
function promoteToProducer(req, target, opts = {}) {
  if (!target) return { error: 'utente non trovato', code: 404 };
  if (target.producerId) { // già sbloccato: idempotente
    const store0 = readStore(); const existing = store0.producers.find(x => x.id === target.producerId) || null;
    // riattiva lo stato se era stato declassato
    const user = upsertUser({ id: target.id, role: 'producer', producerStatus: 'approved' });
    return { ok: true, alreadyUnlocked: true, producer: existing, user: publicUser(user) };
  }
  const store = readStore();
  const candDoc = readCand();
  const c = candDoc.candidature.filter(x => x.userId === target.id).sort((a, b) => String(b.ts).localeCompare(String(a.ts)))[0] || null;
  let nid = slugify(opts.name || (c && c.name) || target.name || (target.email || '').split('@')[0] || 'produttore'); let n = nid, i = 2;
  while (store.producers.some(p => p.id === n)) n = nid + '-' + (i++);
  const cc = (c && c.contact) || {};
  const p = { id: n,
    name: str(opts.name, 160) || (c && c.name) || str(target.name, 160) || '',
    place: (c && str(c.place, 160)) || '',
    categories: (c && Array.isArray(c.categories)) ? c.categories.slice(0, 20).map(x => str(x, 60)) : [],
    primary: (c && Array.isArray(c.categories) && c.categories[0]) ? str(c.categories[0], 60) : '',
    tone: 'pascolo', verify: { state: 'pending', date: '' }, seasonal: [], videos: [], products: [],
    contact: { whatsapp: str(cc.whatsapp, 80), phone: str(cc.phone, 80), email: str(cc.email, 160) },
    note: (c && str(c.note, 2000)) || '',
    status: 'draft', ownerId: target.id, createdAt: new Date().toISOString() };
  auditPush(p, req, 'approvata');
  store.producers.push(p); writeStore(store);
  const user = upsertUser({ id: target.id, role: 'producer', producerId: n, producerStatus: 'approved' });
  try { if (c && c.state === 'todo') { c.state = 'visita'; writeCand(candDoc); } } catch {}
  return { ok: true, producer: p, user: publicUser(user) };
}

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
  // contatti da GHL (connettore Anniversario DFE): snapshot sincronizzato, scritto dall'op 'ghl-store'.
  // Vale per TUTTI i progetti (fuori dal gate Gaia): l'array è popolato solo per i progetti collegati a GHL.
  for (const g of (crm.ghl || [])) {
    if (hidden.has(g.id)) continue;
    const tl = Array.isArray(g.timeline) ? g.timeline : [];
    out.push({
      id: g.id, name: g.name || 'Lead', email: g.email || g.phone || '', seg: g.seg || 'lead',
      src: g.src || 'GHL', picture: '', stage: stageOf(g.id, g.phase || 'nuovo'), sig: g.sig || 'cold',
      zona: g.zona || '', note: g.note || '', ghl: true,
      won: (typeof g.won === 'boolean' ? g.won : null),
      timeline: tl,
      hist: tl.map((t) => (t.label || (t.phase + (t.at ? ' — ' + day(t.at) : '')))).filter(Boolean),
    });
  }
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
// --- Inventario prodotti (self-service): ogni prodotto è una scheda ricca. ---
// Mesi di disponibilità: array di interi 1..12, dedup e ordinati.
const monthsOf = (v) => (Array.isArray(v) ? [...new Set(v.map((n) => parseInt(n, 10)).filter((n) => n >= 1 && n <= 12))].sort((a, b) => a - b) : []);
// Fascia di prezzo: '€' | '€€' | '€€€' oppure { from: numero }. Vuoto → null (facoltativo).
function cleanPriceBand(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'object' && v.from != null) { const f = num(v.from); return f != null ? { from: f } : null; }
  const s = str(v, 8); return ['€', '€€', '€€€'].includes(s) ? s : null;
}
// Un prodotto. PATCH parziale-safe: i campi assenti nel payload conservano il valore esistente (base).
function cleanProduct(p, base = {}) {
  if (!p || typeof p !== 'object') return null;
  const has = (k) => k in p;
  const returns = has('returnsMonth') ? (monthsOf([p.returnsMonth])[0] || null) : (base.returnsMonth ?? null);
  return {
    id: base.id || ('p' + crypto.randomBytes(4).toString('hex')),
    name: has('name') ? str(p.name, 120) : (base.name || ''),
    category: has('category') ? str(p.category, 60) : (base.category || ''),
    photos: has('photos') ? (Array.isArray(p.photos) ? p.photos.slice(0, 7).map((s) => str(s, 1200)) : []) : (base.photos || []),
    unit: has('unit') ? str(p.unit, 60) : (base.unit || ''),
    months: has('months') ? monthsOf(p.months) : (base.months || []),
    always: has('always') ? !!p.always : !!base.always,
    price: has('price') ? ((num(p.price) != null && num(p.price) >= 0) ? num(p.price) : null) : (base.price ?? null),
    description: has('description') ? str(p.description, 400) : (base.description || ''),
    availability: has('availability') ? (['available', 'out', 'returns'].includes(p.availability) ? p.availability : 'available') : (base.availability || 'available'),
    returnsMonth: returns,
  };
}
const PRODUCER_STATES = ['draft', 'in_review', 'published', 'in_scadenza', 'sospeso', 'archiviato'];
// Blocchi mancanti perché la scheda possa essere inviata alla verifica (onboarding tassativo, §D6 del piano 13).
function producerReadiness(p) {
  const miss = [];
  const productOk = (p.products || []).some((x) => x.name && (x.photos || []).length >= 1 && x.unit && ((x.months || []).length > 0 || x.always));
  if (!productOk) miss.push('product');            // ≥1 prodotto completo (nome+foto+unità+mesi)
  if (!(p.story && p.photo)) miss.push('identity'); // storia + almeno 1 foto azienda
  const phone = p.contact && (String(p.contact.whatsapp || '').trim() || String(p.contact.phone || '').trim());
  if (!phone) miss.push('phone');                   // ≥1 numero di telefono
  if (!(p.address && p.hours)) miss.push('reach');  // come si raggiunge + orari
  return miss;
}
// Scheda "pubblica": nascosta finché non è pubblicata. Le schede seed (senza status) sono considerate pubbliche.
const isPublished = (p) => !p.status || p.status === 'published';
// Normalizza solo i campi presenti nel patch (PATCH parziale-safe); lascia intatto il resto.
function normalizePatch(patch) {
  const out = { ...patch };
  if ('km' in out) out.km = num(out.km) || 0;
  if ('lat' in out) out.lat = num(out.lat);
  if ('lng' in out) out.lng = num(out.lng);
  if ('categories' in out) out.categories = Array.isArray(out.categories) ? out.categories.map(c => str(c, 60)) : [];
  if ('videos' in out) out.videos = (Array.isArray(out.videos) ? out.videos : []).map(cleanVideo).filter(Boolean);
  if ('seasonal' in out) out.seasonal = (Array.isArray(out.seasonal) ? out.seasonal : []).map(cleanSeasonal).filter(Boolean);
  if ('products' in out) out.products = (Array.isArray(out.products) ? out.products : []).map((p) => cleanProduct(p)).filter(Boolean);
  if ('status' in out) out.status = PRODUCER_STATES.includes(out.status) ? out.status : 'draft';
  if ('story' in out) out.story = str(out.story, 4000);
  if ('howToReach' in out) out.howToReach = str(out.howToReach, 600);
  if ('verify' in out && out.verify && typeof out.verify === 'object') {
    out.verify = { state: str(out.verify.state, 40) || 'valid', date: str(out.verify.date, 60), next: str(out.verify.next, 60) };
  }
  if ('contact' in out && out.contact && typeof out.contact === 'object') out.contact = { ...out.contact };
  return out;
}

// --- Social Gaia Food (MVP) -------------------------------------------------
// Il social vive nello store documentale già esistente (`crm_doc/__social`): nessuna nuova tabella/file.
// Gli ID account (oggi spesso email) restano SOLO nel documento interno. Ogni risposta usa un publicId
// HMAC opaco, stabile finché resta stabile il segreto di sessione.
const SOCIAL_KINDS = new Set(['question', 'tip', 'field', 'availability', 'story']);
const SOCIAL_KIND_ALIASES = {
  domanda: 'question', consiglio: 'tip', 'dal-campo': 'field', campo: 'field',
  disponibilita: 'availability', storia: 'story',
};
const SOCIAL_EMAIL_IN_TEXT_RE = /[^@\s]+@[^@\s]+\.[^@\s]+/;

function cleanSocialText(value, max = 700) {
  const cleaned = (value == null ? '' : String(value))
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
  return Array.from(cleaned).slice(0, max).join('');
}
function cleanSocialKind(value) {
  const key = cleanSocialText(value, 40).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[\s_]+/g, '-');
  const canonical = SOCIAL_KIND_ALIASES[key] || key;
  return SOCIAL_KINDS.has(canonical) ? canonical : 'story';
}
function socialPageParams(limitValue, offsetValue) {
  const integer = (value, fallback) => {
    const raw = String(value == null ? '' : value).trim();
    return /^\d+$/.test(raw) ? Number(raw) : fallback;
  };
  return {
    limit: Math.max(1, Math.min(50, integer(limitValue, 20))),
    offset: Math.max(0, Math.min(2000, integer(offsetValue, 0))),
  };
}
function socialPublicId(rawId, secret) {
  const key = String(secret || 'gaia-food-public-id');
  return 'gf_' + crypto.createHmac('sha256', key).update('social:' + String(rawId || '')).digest('base64url').slice(0, 22);
}
function socialDisplayName(value, fallback) {
  const name = cleanSocialText(value, 80);
  return (!name || SOCIAL_EMAIL_IN_TEXT_RE.test(name)) ? fallback : name;
}
// Snapshot volutamente grossolano: città + zona + regione. Coordinate e lista comuni non entrano mai nel social.
function socialLocation(input) {
  const src = (input && typeof input === 'object') ? input : {};
  const zone = (src.zone && typeof src.zone === 'object') ? src.zone : {};
  return {
    city: cleanSocialText(src.city, 120),
    zoneId: cleanSocialText(src.zoneId != null ? src.zoneId : zone.id, 80),
    zoneLabel: cleanSocialText(src.zoneLabel != null ? src.zoneLabel : zone.label, 160),
    region: cleanSocialText(src.region != null ? src.region : zone.region, 80),
  };
}
const socialLocationKey = (v) => cleanSocialText(v, 160).toLocaleLowerCase('it').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
function socialLocality(postLocation, viewerLocation) {
  const p = socialLocation(postLocation), v = socialLocation(viewerLocation);
  if (p.city && v.city && socialLocationKey(p.city) === socialLocationKey(v.city)) return 'city';
  const sameZoneId = p.zoneId && v.zoneId && socialLocationKey(p.zoneId) === socialLocationKey(v.zoneId);
  const sameZoneLabel = p.zoneLabel && v.zoneLabel && socialLocationKey(p.zoneLabel) === socialLocationKey(v.zoneLabel);
  if (sameZoneId || sameZoneLabel) return 'zone';
  if (p.region && v.region && socialLocationKey(p.region) === socialLocationKey(v.region)) return 'region';
  return 'other';
}
const socialNewestFirst = (a, b) => ((Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0))
  || String(a.id || '').localeCompare(String(b.id || ''));
const socialAuthorKey = (post) => {
  if (post && post.authorId) return 'account:' + post.authorId;
  if (post && post.author && post.author.id) return 'public:' + post.author.id;
  if (post && post.authorType === 'system') return 'system:gaia-food';
  return 'post:' + String(post && post.id || '');
};
function diversifySocialTier(posts) {
  const byAuthor = new Map();
  for (const post of posts) {
    const key = socialAuthorKey(post);
    if (!byAuthor.has(key)) byAuthor.set(key, []);
    byAuthor.get(key).push(post);
  }
  const authors = [...byAuthor.entries()].map(([key, authorPosts]) => ({ key, posts: authorPosts.sort(socialNewestFirst) }));
  // L'autore col contenuto più recente apre il primo giro; poi un post per autore a ogni giro.
  authors.sort((a, b) => socialNewestFirst(a.posts[0], b.posts[0]) || a.key.localeCompare(b.key));
  const out = [];
  for (let round = 0; ; round++) {
    let added = false;
    for (const author of authors) if (author.posts[round]) { out.push(author.posts[round]); added = true; }
    if (!added) return out;
  }
}
const SOCIAL_DECAY_HOURS = 72, SOCIAL_PRODUCER_WINDOW_MS = 30 * 86400e3;
const socialLocalityRank = (value) => ({ city: 0, zone: 1, region: 2, other: 3 }[value] ?? 3);
function socialPostVirality(post, now = Date.now()) {
  const authorId = post && post.authorId;
  const likes = socialUniqueIds(post && post.likes).filter((id) => id !== authorId).length;
  const saves = socialUniqueIds(post && post.saves).filter((id) => id !== authorId).length;
  const shares = socialUniqueIds(post && post.shares).filter((id) => id !== authorId).length;
  const commenters = new Set((Array.isArray(post && post.comments) ? post.comments : [])
    .map((comment) => comment && comment.authorId).filter((id) => id && id !== authorId)).size;
  const useful = likes + commenters * 2 + saves * 3 + shares * 4;
  const ageHours = Math.max(0, (now - (Date.parse(post && post.createdAt) || now)) / 36e5);
  const decay = Math.pow(2, -ageHours / SOCIAL_DECAY_HOURS);
  return { score: useful * decay, useful, decay, likes, commenters, saves, shares };
}
function socialProducerScores(posts, now = Date.now()) {
  const grouped = new Map();
  for (const post of Array.isArray(posts) ? posts : []) {
    if (!post || post.authorType !== 'producer') continue;
    const ts = Date.parse(post.createdAt) || 0;
    if (!ts || now - ts > SOCIAL_PRODUCER_WINDOW_MS) continue;
    const key = post.producerId || post.authorId;
    if (!key) continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(socialPostVirality(post, now).score);
  }
  const scores = new Map();
  for (const [key, values] of grouped) scores.set(key, values.sort((a, b) => b - a).slice(0, 3).reduce((sum, value) => sum + value, 0));
  return scores;
}
function socialViralityLabel(score) {
  if (score >= 25) return 'Molto virale';
  if (score >= 8) return 'In crescita';
  return 'Dal territorio';
}
function rankProducerSocialPosts(posts, viewerLocation, now = Date.now()) {
  const scores = socialProducerScores(posts, now), groups = new Map();
  for (const located of posts) {
    const key = located.producerId || located.authorId;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(located);
  }
  const producers = [...groups.entries()].map(([key, items]) => {
    items.sort((a, b) => socialPostVirality(b, now).score - socialPostVirality(a, now).score || socialNewestFirst(a, b));
    return { key, items, score: scores.get(key) || 0 };
  });
  producers.sort((a, b) => b.score - a.score
    || socialLocalityRank(a.items[0].locality) - socialLocalityRank(b.items[0].locality)
    || socialNewestFirst(a.items[0], b.items[0]) || String(a.key).localeCompare(String(b.key)));
  const out = [];
  for (let round = 0; ; round++) {
    let added = false;
    for (let producerIndex = 0; producerIndex < producers.length; producerIndex++) {
      const producer = producers[producerIndex];
      const post = producer.items[round];
      if (!post) continue;
      const postScore = socialPostVirality(post, now).score;
      out.push({ ...post, _socialVirality: { rank: producerIndex + 1, score: producer.score, postScore, label: socialViralityLabel(producer.score) } });
      added = true;
    }
    if (!added) return out;
  }
}
// `Per te` resta local-first; `Seguiti` è cronologico; `Vicino` scopre solo autori non seguiti;
// `Produttori` usa viralità utile come criterio primario e un giro equo per produttore.
function rankSocialPosts(posts, viewerLocation, scope = 'for-you', opts = {}) {
  const selectedScope = ['for-you', 'following', 'nearby', 'producers'].includes(scope) ? scope : 'for-you';
  const following = opts.following instanceof Set ? opts.following : new Set(Array.isArray(opts.following) ? opts.following : []);
  const located = (Array.isArray(posts) ? posts : [])
    .map((post) => ({ ...post, locality: socialLocality(post && post.location, viewerLocation) }))
    .filter((post) => !(Array.isArray(post.reports) && opts.viewerId && post.reports.includes(opts.viewerId)))
    .filter((post) => selectedScope !== 'following' || following.has(post.authorId))
    .filter((post) => selectedScope !== 'nearby' || (post.locality !== 'other'
      && (!opts.viewerId || post.authorId !== opts.viewerId) && !following.has(post.authorId)))
    .filter((post) => selectedScope !== 'producers' || post.authorType === 'producer');
  if (selectedScope === 'following') return located.sort(socialNewestFirst);
  if (selectedScope === 'producers') return rankProducerSocialPosts(located, viewerLocation, opts.now || Date.now());
  const ranked = [];
  for (const locality of ['city', 'zone', 'region', 'other']) ranked.push(...diversifySocialTier(located.filter((post) => post.locality === locality)));
  return ranked;
}
// Un post firmato come produttore mantiene quel ruolo in output SOLO finché account e scheda sono
// ancora collegati, owned e pubblicati. La trasformazione è live e non muta lo storico salvato.
function revalidateSocialAuthors(posts, users, producers) {
  const userById = new Map((Array.isArray(users) ? users : []).map((user) => [user.id, user]));
  const producerById = new Map((Array.isArray(producers) ? producers : []).map((producer) => [producer.id, producer]));
  return (Array.isArray(posts) ? posts : []).map((post) => {
    if (!post || post.authorType !== 'producer') return post && typeof post === 'object' ? { ...post } : post;
    const user = userById.get(post.authorId) || null;
    // Il legame storico è il producerId DEL POST: un nuovo producerId sul medesimo account
    // non può riappropriarsi di contenuti firmati da una scheda precedente.
    const producer = producerById.get(post.producerId) || null;
    const hasProducerAnchor = !!(producer && Object.prototype.hasOwnProperty.call(producer, 'socialLocation'));
    const valid = !!(user && producer
      && user.producerId === producer.id
      && user.producerStatus === 'published'
      && producer.ownerId === user.id
      && producer.status === 'published'
      && hasProducerAnchor);
    if (valid) return {
      ...post,
      authorName: socialDisplayName(producer.name, 'Produttore locale'),
      authorPicture: cleanSocialText(producer.photo || user.picture, 1200),
      authorType: 'producer', authorVerified: true, producerId: producer.id,
      location: socialLocation(producer.socialLocation),
    };
    return {
      ...post,
      authorName: socialDisplayName(user && user.name, 'Membro Gaia'),
      authorPicture: cleanSocialText(user && user.picture, 1200),
      authorType: 'person', authorVerified: false, producerId: null,
    };
  });
}
const socialUniqueIds = (value) => [...new Set((Array.isArray(value) ? value : []).filter((x) => typeof x === 'string' && x))];
function cleanSocialMedia(value, max = 10) {
  return (Array.isArray(value) ? value : []).slice(0, max).map((item) => {
    const type = item && item.type === 'video' ? 'video' : (item && item.type === 'image' ? 'image' : '');
    const url = cleanSocialText(item && item.url, 2200);
    const mime = cleanSocialText(item && item.mime, 80);
    return type && url ? { type, url, mime } : null;
  }).filter(Boolean);
}
function socialMediaFormat(media) {
  if (!media.length) return 'text';
  if (media.length > 1) return 'carousel';
  return media[0].type === 'video' ? 'video' : 'image';
}
function projectSocialPost(post, viewerId, secret, opts = {}) {
  const type = ['person', 'producer', 'system'].includes(post && post.authorType) ? post.authorType : 'person';
  const authorId = type === 'system' ? 'gaia-food' : socialPublicId(post && post.authorId, secret);
  const likes = socialUniqueIds(post && post.likes), saves = socialUniqueIds(post && post.saves), shares = socialUniqueIds(post && post.shares);
  const reports = socialUniqueIds(post && post.reports), following = opts.following instanceof Set ? opts.following : new Set();
  const media = cleanSocialMedia(post && post.media);
  const allComments = Array.isArray(post && post.comments) ? post.comments : [];
  const comments = allComments.slice(-20).map((comment) => {
    const commentType = ['person', 'producer', 'system'].includes(comment.authorType) ? comment.authorType : 'person';
    return {
      id: cleanSocialText(comment.id, 80),
      text: cleanSocialText(comment.text, 280),
      createdAt: cleanSocialText(comment.createdAt, 40),
      author: {
        id: commentType === 'system' ? 'gaia-food' : socialPublicId(comment.authorId, secret),
        name: socialDisplayName(comment.authorName, commentType === 'producer' ? 'Produttore locale' : 'Membro Gaia'),
        picture: cleanSocialText(comment.authorPicture, 1200),
        type: commentType,
      },
    };
  });
  const out = {
    id: cleanSocialText(post && post.id, 80),
    text: cleanSocialText(post && post.text, 700),
    kind: cleanSocialKind(post && post.kind),
    createdAt: cleanSocialText(post && post.createdAt, 40),
    format: socialMediaFormat(media),
    media,
    mediaUrl: media[0] ? media[0].url : '',
    author: {
      id: authorId,
      name: socialDisplayName(post && post.authorName, type === 'producer' ? 'Produttore locale' : (type === 'system' ? 'Gaia Food' : 'Membro Gaia')),
      picture: cleanSocialText(post && post.authorPicture, 1200),
      type,
      verified: type === 'system' || !!(post && post.authorVerified),
    },
    location: socialLocation(post && post.location),
    locality: ['city', 'zone', 'region', 'other'].includes(post && post.locality) ? post.locality : 'other',
    counts: { likes: likes.length, saves: saves.length, comments: allComments.length, shares: shares.length },
    viewer: {
      liked: !!viewerId && likes.includes(viewerId),
      saved: !!viewerId && saves.includes(viewerId),
      shared: !!viewerId && shares.includes(viewerId),
      followingAuthor: !!viewerId && following.has(post && post.authorId),
      ownAuthor: !!viewerId && post && post.authorId === viewerId,
      reported: !!viewerId && reports.includes(viewerId),
    },
    comments,
  };
  if (type === 'producer' && post.producerId) out.author.producerId = cleanSocialText(post.producerId, 80);
  if (type === 'producer') {
    const v = post && post._socialVirality;
    const postScore = v ? v.postScore : socialPostVirality(post, opts.now || Date.now()).score;
    const score = v ? v.score : postScore;
    out.virality = { score: Number(score.toFixed(2)), postScore: Number(postScore.toFixed(2)), label: v && v.label || socialViralityLabel(score) };
    if (v && Number.isInteger(v.rank)) out.virality.rank = v.rank;
  }
  if (reports.length >= 3 || post && post.pendingModeration) out.pendingModeration = true;
  if (post && post.isExample) out.isExample = true;
  return out;
}

function projectSocialStory(story, viewerId, secret, opts = {}) {
  const type = story && story.authorType === 'producer' ? 'producer' : 'person';
  const views = socialUniqueIds(story && story.views), reports = socialUniqueIds(story && story.reports);
  const following = opts.following instanceof Set ? opts.following : new Set();
  const out = {
    id: cleanSocialText(story && story.id, 80),
    text: cleanSocialText(story && story.text, 280),
    createdAt: cleanSocialText(story && story.createdAt, 40),
    expiresAt: cleanSocialText(story && story.expiresAt, 40),
    media: cleanSocialMedia(story && story.media, 1),
    author: {
      id: socialPublicId(story && story.authorId, secret),
      name: socialDisplayName(story && story.authorName, type === 'producer' ? 'Produttore locale' : 'Membro Gaia'),
      picture: cleanSocialText(story && story.authorPicture, 1200),
      type,
      verified: type === 'producer' && !!(story && story.authorVerified),
    },
    location: socialLocation(story && story.location),
    locality: ['city', 'zone', 'region', 'other'].includes(story && story.locality) ? story.locality : 'other',
    viewsCount: views.length,
    viewer: {
      seen: !!viewerId && views.includes(viewerId),
      followingAuthor: !!viewerId && following.has(story && story.authorId),
      ownAuthor: !!viewerId && story && story.authorId === viewerId,
      reported: !!viewerId && reports.includes(viewerId),
    },
  };
  if (type === 'producer' && story.producerId) out.author.producerId = cleanSocialText(story.producerId, 80);
  if (reports.length >= 3 || story && story.pendingModeration) out.pendingModeration = true;
  return out;
}

const SOCIAL_EXAMPLE_POST = {
  id: 'social-welcome',
  text: 'Questo spazio nasce per scambiarci domande, consigli ed esperienze sul cibo sano e sul territorio. I primi contenuti della comunità arriveranno qui.',
  kind: 'story', createdAt: '2026-08-26T06:00:00.000Z', mediaUrl: '', isExample: true,
  authorId: null, authorName: 'Gaia Food', authorPicture: '', authorType: 'system', authorVerified: true,
  producerId: null, location: { city: '', zoneId: '', zoneLabel: '', region: '' }, likes: [], saves: [], shares: [], reports: [], comments: [],
};
function normalizeSocialDoc(rawValue) {
  const raw = rawValue && typeof rawValue === 'object' ? rawValue : {};
  const posts = Array.isArray(raw.posts) ? raw.posts : [{ ...SOCIAL_EXAMPLE_POST, location: { ...SOCIAL_EXAMPLE_POST.location }, likes: [], saves: [], shares: [], reports: [], comments: [] }];
  return {
    socialVersion: 2,
    posts,
    stories: Array.isArray(raw.stories) ? raw.stories : [],
    follows: (Array.isArray(raw.follows) ? raw.follows : []).filter((item) => item && typeof item.from === 'string' && typeof item.to === 'string' && item.from !== item.to)
      .map((item) => ({ from: item.from, to: item.to, createdAt: cleanSocialText(item.createdAt, 40) })),
  };
}
function readSocialDoc() {
  const raw = readCrm('__social') || {}, doc = normalizeSocialDoc(raw);
  if (raw.socialVersion === 2 && Array.isArray(raw.posts) && Array.isArray(raw.stories) && Array.isArray(raw.follows)) return doc;
  writeCrm('__social', doc);
  return doc;
}
// Le mutazioni sono senza `await` fra read e write, quindi atomiche nel singolo event-loop. Il document
// store replace-all resta volutamente last-write-wins fra più ISTANZE: sarà da migrare prima dello scale-out.
function writeSocialDoc(doc) {
  writeCrm('__social', {
    socialVersion: 2,
    posts: Array.isArray(doc.posts) ? doc.posts : [],
    stories: Array.isArray(doc.stories) ? doc.stories : [],
    follows: Array.isArray(doc.follows) ? doc.follows : [],
  });
}
const SOCIAL_MEDIA_REF_TTL_MS = 60 * 60 * 1000;
function signSocialMediaRef(media, accountId, now = Date.now(), secret = sessionSecret()) {
  const payload = {
    v: 1, a: socialPublicId(accountId, secret), i: now,
    u: cleanSocialText(media && media.url, 2200), t: media && media.type, m: cleanSocialText(media && media.mime, 80),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', secret).update('social-media:' + encoded).digest('base64url');
  return 'smr_' + encoded + '.' + mac;
}
function verifySocialMediaRef(ref, accountId, now = Date.now(), secret = sessionSecret()) {
  const token = String(ref || '');
  if (!token.startsWith('smr_') || token.indexOf('.') < 0) return null;
  const dot = token.lastIndexOf('.'), encoded = token.slice(4, dot), mac = token.slice(dot + 1);
  const expected = crypto.createHmac('sha256', secret).update('social-media:' + encoded).digest('base64url');
  let a, b; try { a = Buffer.from(mac); b = Buffer.from(expected); } catch { return null; }
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload; try { payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')); } catch { return null; }
  if (!payload || payload.v !== 1 || payload.a !== socialPublicId(accountId, secret)) return null;
  if (!Number.isFinite(payload.i) || now < payload.i - 5 * 60 * 1000 || now - payload.i > SOCIAL_MEDIA_REF_TTL_MS) return null;
  if (!['image', 'video'].includes(payload.t) || !cleanSocialText(payload.u, 2200)) return null;
  return { type: payload.t, url: cleanSocialText(payload.u, 2200), mime: cleanSocialText(payload.m, 80) };
}
function socialFollowingIds(doc, viewerId) {
  return new Set((Array.isArray(doc && doc.follows) ? doc.follows : []).filter((item) => item.from === viewerId).map((item) => item.to));
}
function purgeExpiredSocialStories(doc, now = Date.now()) {
  const before = Array.isArray(doc.stories) ? doc.stories.length : 0;
  doc.stories = (Array.isArray(doc.stories) ? doc.stories : []).filter((story) => (Date.parse(story && story.expiresAt) || 0) > now);
  return doc.stories.length !== before;
}
function anchorProducerSocialLocation(producer) {
  const owner = producer && producer.ownerId ? readUsers().users.find((user) => user.id === producer.ownerId) : null;
  producer.socialLocation = socialLocation(owner);
  return producer.socialLocation;
}
function socialAuthorSnapshot(me) {
  let producer = null;
  if (me && me.producerId && me.producerStatus === 'published') {
    producer = readStore().producers.find((p) => p.id === me.producerId && p.ownerId === me.id
      && p.status === 'published' && Object.prototype.hasOwnProperty.call(p, 'socialLocation')) || null;
  }
  if (producer) return {
    authorId: me.id,
    authorName: socialDisplayName(producer.name, 'Produttore locale'),
    authorPicture: cleanSocialText(producer.photo || me.picture, 1200),
    authorType: 'producer', authorVerified: true, producerId: producer.id,
    location: socialLocation(producer.socialLocation),
  };
  return {
    authorId: me.id,
    authorName: socialDisplayName(me.name, 'Membro Gaia'),
    authorPicture: cleanSocialText(me.picture, 1200),
    authorType: 'person', authorVerified: false, producerId: null,
    location: socialLocation(me),
  };
}
function socialThrottle(bucket, req, me, max, windowMs) {
  const accountKey = crypto.createHash('sha256').update(String(me.id)).digest('hex').slice(0, 16);
  // Due limiti indipendenti: cambiare IP non resetta quello account; cambiare account non resetta
  // quello IP. Il vecchio bucket combinato account|IP permetteva entrambi gli aggiramenti.
  const accountReq = { headers: { 'x-forwarded-for': 'account:' + accountKey }, socket: {} };
  const ipReq = { headers: { 'x-forwarded-for': 'ip:' + clientIp(req) }, socket: {} };
  const byAccount = throttle(bucket, accountReq, max, windowMs);
  const byIp = throttle(bucket, ipReq, max, windowMs);
  return {
    limited: byAccount.limited || byIp.limited,
    retryAfter: Math.max(byAccount.retryAfter || 0, byIp.retryAfter || 0),
    accountLimited: byAccount.limited,
    ipLimited: byIp.limited,
  };
}
const socialUploadAccounts = new Set();
let socialUploadActive = 0;
function acquireSocialUploadSlot(accountId, maxGlobal = 2) {
  const key = crypto.createHash('sha256').update(String(accountId || '')).digest('hex').slice(0, 24);
  if (!accountId || socialUploadAccounts.has(key) || socialUploadActive >= maxGlobal) return null;
  socialUploadAccounts.add(key); socialUploadActive++;
  let released = false;
  return () => {
    if (released) return;
    released = true; socialUploadAccounts.delete(key); socialUploadActive = Math.max(0, socialUploadActive - 1);
  };
}
function socialDiscoverableAuthorIds(doc, now = Date.now()) {
  const ids = new Set();
  for (const post of Array.isArray(doc && doc.posts) ? doc.posts : []) if (post && post.authorId) ids.add(post.authorId);
  for (const story of Array.isArray(doc && doc.stories) ? doc.stories : []) {
    if (story && story.authorId && (Date.parse(story.expiresAt) || 0) > now) ids.add(story.authorId);
  }
  const users = readUsers().users, producers = readStore().producers;
  const userById = new Map(users.map((user) => [user.id, user]));
  for (const producer of producers) {
    const owner = producer && producer.ownerId && userById.get(producer.ownerId);
    if (owner && producer.status === 'published' && owner.producerId === producer.id && owner.producerStatus === 'published') ids.add(owner.id);
  }
  return ids;
}
function resolveSocialAuthorPublicId(publicId, doc, now = Date.now()) {
  const wanted = cleanSocialText(publicId, 80), secret = sessionSecret();
  if (!wanted || wanted === 'gaia-food') return null;
  for (const rawId of socialDiscoverableAuthorIds(doc, now)) if (socialPublicId(rawId, secret) === wanted) return rawId;
  return null;
}
function socialPostForViewer(post, me, doc = null) {
  const socialDoc = doc || readSocialDoc(), users = readUsers().users, producers = readStore().producers;
  const allLive = revalidateSocialAuthors(socialDoc.posts, users, producers);
  const live = allLive.find((item) => item.id === post.id) || revalidateSocialAuthors([post], users, producers)[0] || post;
  if (live.authorType === 'producer') {
    const score = socialProducerScores(allLive).get(live.producerId || live.authorId) || 0;
    live._socialVirality = { score, postScore: socialPostVirality(live).score, label: socialViralityLabel(score) };
  }
  const located = { ...live, locality: socialLocality(live.location, socialLocation(me)) };
  return projectSocialPost(located, me && me.id, sessionSecret(), { following: socialFollowingIds(socialDoc, me && me.id) });
}
function socialStoryForViewer(story, me, doc = null) {
  const socialDoc = doc || readSocialDoc();
  const live = revalidateSocialAuthors([story], readUsers().users, readStore().producers)[0] || story;
  const located = { ...live, locality: socialLocality(live.location, socialLocation(me)) };
  return projectSocialStory(located, me && me.id, sessionSecret(), { following: socialFollowingIds(socialDoc, me && me.id) });
}
function rankSocialStories(stories, me, following, now = Date.now()) {
  const viewerLocation = socialLocation(me);
  return revalidateSocialAuthors(stories, readUsers().users, readStore().producers)
    .filter((story) => (Date.parse(story && story.expiresAt) || 0) > now)
    .filter((story) => !(Array.isArray(story.reports) && story.reports.includes(me.id)))
    .map((story) => ({ ...story, locality: socialLocality(story.location, viewerLocation) }))
    .sort((a, b) => {
      const aSeen = socialUniqueIds(a.views).includes(me.id), bSeen = socialUniqueIds(b.views).includes(me.id);
      if (aSeen !== bSeen) return aSeen ? 1 : -1;
      const aFollow = following.has(a.authorId), bFollow = following.has(b.authorId);
      if (aFollow !== bFollow) return aFollow ? -1 : 1;
      return socialLocalityRank(a.locality) - socialLocalityRank(b.locality) || socialNewestFirst(a, b);
    });
}

async function api(req, res, url) {
  const seg = url.split('/').filter(Boolean); // ['api','producers',':id', ...]
  const method = req.method;

  // ============ GESTIONE UTENTI & INVITI (solo admin, via account utente) ============
  // Elenco persone + livelli (per la schermata "Gestione").
  if (url === '/api/admin/users' && method === 'GET') {
    if (!isAdminReq(req)) return send(res, 403, { error: 'Accesso riservato' });
    const users = readUsers().users.map(u => ({
      id: u.id, email: u.email || u.id, name: u.name || '', picture: u.picture || '',
      provider: u.provider || '', createdAt: u.createdAt || '',
      level: userLevel(u), owner: isOwnerEmail(u.email || u.id),
      producerStatus: u.producerStatus || null, producerId: u.producerId || null,
    })).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const nowIso = new Date().toISOString();
    const invites = ((readCrm('__invites') || {}).invites || [])
      .filter(x => !x.usedAt && (!x.expiresAt || x.expiresAt > nowIso))
      .map(x => ({ token: x.token, email: x.email, level: x.level, createdAt: x.createdAt, expiresAt: x.expiresAt }));
    return send(res, 200, { users, invites, owners: OWNER_EMAILS });
  }

  // Cambia il livello di un utente esistente.
  if (url === '/api/admin/users/level' && method === 'POST') {
    if (!isAdminReq(req)) return send(res, 403, { error: 'Accesso riservato' });
    const d = await body(req);
    const uid = String(d.userId || d.email || '').trim().toLowerCase();
    const level = String(d.level || '').trim();
    if (!['cliente', 'produttore', 'verificatore', 'admin'].includes(level)) return send(res, 400, { error: 'livello non valido' });
    if (isOwnerEmail(uid)) return send(res, 400, { error: "L'owner è admin fisso: non modificabile." });
    const target = readUsers().users.find(u => u.id === uid);
    if (!target) return send(res, 404, { error: 'utente non trovato' });
    if (level === 'produttore') {
      if (target.staffRole) upsertUser({ id: target.id, staffRole: null });
      const r = promoteToProducer(req, readUsers().users.find(u => u.id === uid), {});
      if (r.error) return send(res, r.code || 400, { error: r.error });
      return send(res, 200, { ok: true, level, producer: r.producer || null });
    }
    if (level === 'admin' || level === 'verificatore') {
      const u = upsertUser({ id: target.id, staffRole: level });
      return send(res, 200, { ok: true, level, user: publicUser(u) });
    }
    // cliente: togli lo staff; se era produttore attivo → vetrina offline (non distruttivo, dati preservati).
    upsertUser({ id: target.id, staffRole: null });
    if (target.producerId) {
      const store = readStore(); const p = store.producers.find(x => x.id === target.producerId);
      if (p && p.status === 'published') { p.status = 'sospeso'; auditPush(p, req, 'declassata a cliente'); writeStore(store); }
      upsertUser({ id: target.id, producerStatus: null });
    }
    return send(res, 200, { ok: true, level: 'cliente' });
  }

  // Elimina un account utente (admin). Cascata: se possiede una scheda produttore, la rimuove.
  if (url.split('?')[0] === '/api/admin/users' && method === 'DELETE') {
    if (!isAdminReq(req)) return send(res, 403, { error: 'Accesso riservato' });
    // NB: `url` è già senza query string (vedi requestHandler) → il parametro va letto da req.url.
    const id = (new URLSearchParams(req.url.split('?')[1] || '').get('id') || '').trim().toLowerCase();
    if (!id) return send(res, 400, { error: 'id mancante' });
    if (isOwnerEmail(id)) return send(res, 400, { error: 'Non puoi eliminare un owner.' });
    const db = readUsers(); const i = db.users.findIndex((u) => u.id === id);
    if (i < 0) return send(res, 404, { error: 'utente non trovato' });
    const target = db.users[i];
    if (target.producerId) { // cascata: via anche la scheda produttore orfana
      const store = readStore(); const pi = store.producers.findIndex((p) => p.id === target.producerId);
      if (pi >= 0) { store.producers.splice(pi, 1); writeStore(store); }
    }
    db.users.splice(i, 1); writeUsers(db);
    return send(res, 200, { ok: true });
  }

  // Crea un invito → link che porta a creazione account + onboarding col livello scelto.
  if (url === '/api/admin/invites' && method === 'POST') {
    if (!isAdminReq(req)) return send(res, 403, { error: 'Accesso riservato' });
    const d = await body(req);
    const email = String(d.email || '').trim().toLowerCase();
    const level = String(d.level || 'produttore').trim();
    if (!EMAIL_RE.test(email)) return send(res, 400, { error: 'Email non valida' });
    if (!['produttore', 'verificatore', 'admin'].includes(level)) return send(res, 400, { error: 'livello non valido' });
    if (isOwnerEmail(email)) return send(res, 400, { error: 'Email owner: è già admin, nessun invito serve.' });
    const token = crypto.randomBytes(18).toString('base64url');
    const nowIso = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 14 * 24 * 3600e3).toISOString(); // 14 giorni
    const doc = readCrm('__invites') || {}; const list = Array.isArray(doc.invites) ? doc.invites : [];
    const kept = list.filter(x => !(x.email === email && !x.usedAt)); // un solo invito attivo per email
    kept.push({ token, email, level, by: actorOf(req).name, createdAt: nowIso, expiresAt, usedAt: null });
    writeCrm('__invites', { ...doc, invites: kept });
    return send(res, 200, { ok: true, token, email, level, expiresAt });
  }

  // Revoca un invito pendente.
  if (url.split('?')[0] === '/api/admin/invites' && method === 'DELETE') {
    if (!isAdminReq(req)) return send(res, 403, { error: 'Accesso riservato' });
    const tk = (new URLSearchParams(req.url.split('?')[1] || '').get('token') || '').trim();
    const doc = readCrm('__invites') || {}; const list = (doc.invites || []).filter(x => x.token !== tk);
    writeCrm('__invites', { ...doc, invites: list });
    return send(res, 200, { ok: true });
  }

  // Info invito (pubblico) — per la schermata di accettazione.
  if (seg[1] === 'invite' && seg[2] && !seg[3] && method === 'GET') {
    const inv = ((readCrm('__invites') || {}).invites || []).find(x => x.token === seg[2]);
    if (!inv) return send(res, 404, { error: 'invito non trovato' });
    const expired = !!(inv.expiresAt && inv.expiresAt < new Date().toISOString());
    return send(res, 200, { email: inv.email, level: inv.level, used: !!inv.usedAt, expired, valid: !inv.usedAt && !expired });
  }

  // Accetta invito (utente già loggato con la mail invitata) → applica il livello + segna usato.
  if (seg[1] === 'invite' && seg[2] && seg[3] === 'accept' && method === 'POST') {
    const me = userOf(req); if (!me) return send(res, 401, { error: 'non_autenticato' });
    const doc = readCrm('__invites') || {}; const list = doc.invites || [];
    const inv = list.find(x => x.token === seg[2]);
    if (!inv) return send(res, 404, { error: 'invito non trovato' });
    if (inv.usedAt) return send(res, 409, { error: 'invito già usato' });
    if (inv.expiresAt && inv.expiresAt < new Date().toISOString()) return send(res, 410, { error: 'invito scaduto' });
    if (String(me.email || me.id).toLowerCase() !== inv.email) return send(res, 403, { error: `Questo invito è per ${inv.email}. Accedi con quella email.` });
    let producer = null;
    if (inv.level === 'produttore') {
      const r = promoteToProducer(req, readUsers().users.find(u => u.id === me.id), {});
      if (r.error) return send(res, r.code || 400, { error: r.error });
      producer = r.producer || null;
    } else if (inv.level === 'admin' || inv.level === 'verificatore') {
      upsertUser({ id: me.id, staffRole: inv.level });
    }
    inv.usedAt = new Date().toISOString(); inv.usedBy = me.id; writeCrm('__invites', { ...doc, invites: list });
    return send(res, 200, { ok: true, level: inv.level, producer });
  }

  // --- auth ---
  if (url === '/api/login' && method === 'POST') {
    const t = loginThrottle(req);
    if (t.limited) {
      res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8', 'Retry-After': String(t.retryAfter) });
      return res.end(JSON.stringify({ error: `Troppi tentativi. Riprova tra ${t.retryAfter}s.`, retryAfter: t.retryAfter }));
    }
    const { password, name } = await body(req); const cfg = config();
    let role = null;
    if (password && password === adminPass(cfg)) role = 'admin';
    else if (password && password === verifierPass(cfg)) role = 'verificatore';
    if (!role) return send(res, 401, { error: 'Password errata' });
    const tok = signSession({ t: 'staff', role, name: str(name, 60).trim() || (role === 'admin' ? 'Admin' : 'Verificatore'), iat: Date.now() });
    res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': `gf_sess=${tok}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${secureFlag(req)}` });
    return res.end(JSON.stringify({ role }));
  }
  if (url === '/api/logout' && method === 'POST') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': 'gf_sess=; Path=/; Max-Age=0' }); return res.end('{}'); // stateless: basta cancellare il cookie
  }
  if (url === '/api/me') return send(res, 200, { role: staffRole(req) });

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
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Set-Cookie': startUserSession(req, user.id) });
    return res.end(JSON.stringify({ user: publicUser(user) }));
  }
  // Registrazione: email + password (min PW_MIN). Se esiste già un account CON password → 409.
  if (url === '/api/auth/register' && method === 'POST') {
    { const t = throttle(authHits, req, 10); if (t.limited) return send(res, 429, { error: 'Troppi tentativi, riprova tra poco', retryAfter: t.retryAfter }); }
    const d = await body(req);
    const email = String(d.email || '').trim().toLowerCase();
    const pw = String(d.password || '');
    if (!EMAIL_RE.test(email)) return send(res, 400, { error: 'Email non valida' });
    // Sicurezza: le email owner (admin fisso) NON possono registrarsi con password → solo Google (email verificata),
    // così nessuno può "occupare" la tua email con un account password e ottenere l'admin.
    if (isOwnerEmail(email)) return send(res, 403, { error: 'Questa email è riservata: accedi con Google.' });
    if (pw.length < PW_MIN) return send(res, 400, { error: `La password deve avere almeno ${PW_MIN} caratteri` });
    const existing = readUsers().users.find(x => x.id === email);
    if (existing && existing.passHash) return send(res, 409, { error: 'Esiste già un account con questa email. Accedi.' });
    const isNew = !existing;
    const user = upsertUser({ id: email, email, provider: 'email', passHash: hashPassword(pw) });
    if (isNew) linkReferral(user, d.seme);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Set-Cookie': startUserSession(req, user.id) });
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
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Set-Cookie': startUserSession(req, user.id) });
    return res.end(JSON.stringify({ user: publicUser(user) }));
  }
  // Config pubblica per il client: espone SOLO il Google client id (non è un segreto)
  // così il bottone GSI può renderizzarsi senza hard-coding nel JS. Vuoto = login Google "da configurare".
  if (url === '/api/auth/config' && method === 'GET') return send(res, 200, { googleClientId: GOOGLE_CLIENT_ID });
  if (url === '/api/auth/me' && method === 'GET') return send(res, 200, { user: publicUser(userOf(req)) });
  if (url === '/api/auth/logout' && method === 'POST') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': 'gf_user=; Path=/; Max-Age=0' });
    return res.end('{}'); // stateless
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

  // --- Social territoriale: area gated, feed e mutazioni richiedono un account utente. ---
  if (seg[1] === 'social') {
    // Upload isolato dal post: il riferimento HMAC è legato all'account e scade dopo 60 minuti.
    if (seg[2] === 'media' && !seg[3] && method === 'POST') {
      const me = userOf(req); if (!me) return send(res, 401, { error: 'non_autenticato' });
      const t = socialThrottle(socialMediaHits, req, me, 12, 10 * LOGIN_WINDOW_MS);
      if (t.limited) { res.setHeader('Retry-After', String(t.retryAfter)); return send(res, 429, { error: 'Troppi caricamenti, riprova tra poco', retryAfter: t.retryAfter }); }
      const releaseUpload = acquireSocialUploadSlot(me.id);
      if (!releaseUpload) {
        res.setHeader('Retry-After', '2');
        return send(res, 429, { error: 'Caricamento già in corso, riprova tra poco', retryAfter: 2 });
      }
      try {
        const d = await body(req, BODY_MAX_MEDIA);
        const uploaded = await saveMedia(d.dataUrl, {
          folder: `social/${socialPublicId(me.id, sessionSecret())}`,
          diskDir: SOCIALMEDIADIR, diskUrlBase: 'assets/media/social',
          filenameBase: `social-${crypto.randomBytes(10).toString('hex')}`,
          allowedMimes: ['image/png', 'image/jpg', 'image/jpeg', 'image/webp', 'video/mp4', 'video/webm'],
          maxImageBytes: 8 * 1024 * 1024, maxVideoBytes: 18 * 1024 * 1024,
          diskQuotaBytes: SOCIAL_DISK_CAP_BYTES,
        });
        return send(res, 201, {
          mediaRef: signSocialMediaRef(uploaded, me.id), type: uploaded.type, mime: uploaded.mime,
          url: uploaded.url, expiresIn: Math.floor(SOCIAL_MEDIA_REF_TTL_MS / 1000),
        });
      } finally {
        releaseUpload();
      }
    }

    if (seg[2] === 'feed' && !seg[3] && method === 'GET') {
      const me = userOf(req); if (!me) return send(res, 401, { error: 'non_autenticato' });
      const query = new URLSearchParams(req.url.split('?')[1] || '');
      const requested = cleanSocialText(query.get('scope'), 24);
      const scope = ['for-you', 'following', 'nearby', 'producers'].includes(requested) ? requested : 'for-you';
      const { limit, offset } = socialPageParams(query.get('limit'), query.get('offset'));
      const viewerLocation = socialLocation(me), doc = readSocialDoc(), following = socialFollowingIds(doc, me.id);
      const livePosts = revalidateSocialAuthors(doc.posts, readUsers().users, readStore().producers);
      const ranked = rankSocialPosts(livePosts, viewerLocation, scope, { viewerId: me.id, following });
      const page = ranked.slice(offset, offset + limit);
      const posts = page.map((post) => projectSocialPost(post, me.id, sessionSecret(), { following }));
      const hasMore = offset + page.length < ranked.length;
      return send(res, 200, {
        posts,
        context: { scope, city: viewerLocation.city, zone: { id: viewerLocation.zoneId, label: viewerLocation.zoneLabel }, region: viewerLocation.region },
        hasMore, nextOffset: hasMore ? offset + page.length : null, pagination: { limit, offset },
      });
    }

    // Suggerimenti privacy-safe: solo persone che hanno già pubblicato post/story e produttori live.
    if (seg[2] === 'suggestions' && !seg[3] && method === 'GET') {
      const me = userOf(req); if (!me) return send(res, 401, { error: 'non_autenticato' });
      const query = new URLSearchParams(req.url.split('?')[1] || '');
      const limit = Math.max(1, Math.min(20, Number(query.get('limit')) || 5));
      const doc = readSocialDoc(), following = socialFollowingIds(doc, me.id), viewerLocation = socialLocation(me);
      const users = readUsers().users, userById = new Map(users.map((user) => [user.id, user]));
      const suggestions = [...socialDiscoverableAuthorIds(doc)].filter((id) => id !== me.id && !following.has(id) && userById.has(id))
        .map((id) => {
          const snapshot = socialAuthorSnapshot(userById.get(id)), locality = socialLocality(snapshot.location, viewerLocation);
          const author = {
            id: socialPublicId(id, sessionSecret()), name: snapshot.authorName, picture: snapshot.authorPicture,
            type: snapshot.authorType, verified: !!snapshot.authorVerified,
          };
          if (snapshot.authorType === 'producer' && snapshot.producerId) author.producerId = snapshot.producerId;
          return { author, location: snapshot.location, locality, following: false };
        })
        .filter((item) => item.locality !== 'other')
        .sort((a, b) => socialLocalityRank(a.locality) - socialLocalityRank(b.locality)
          || Number(b.author.type === 'producer') - Number(a.author.type === 'producer') || a.author.name.localeCompare(b.author.name))
        .slice(0, limit);
      return send(res, 200, { suggestions });
    }

    if (seg[2] === 'authors' && seg[3] && seg[4] === 'follow' && !seg[5] && (method === 'PUT' || method === 'DELETE')) {
      const me = userOf(req); if (!me) return send(res, 401, { error: 'non_autenticato' });
      const t = socialThrottle(socialFollowHits, req, me, 60, LOGIN_WINDOW_MS);
      if (t.limited) { res.setHeader('Retry-After', String(t.retryAfter)); return send(res, 429, { error: 'Troppe richieste follow', retryAfter: t.retryAfter }); }
      const doc = readSocialDoc(), targetId = resolveSocialAuthorPublicId(seg[3], doc);
      if (!targetId) return send(res, 404, { error: 'autore_non_trovato' });
      if (targetId === me.id) return send(res, 400, { error: 'non_puoi_seguire_te_stesso' });
      doc.follows = Array.isArray(doc.follows) ? doc.follows : [];
      const index = doc.follows.findIndex((item) => item.from === me.id && item.to === targetId);
      if (method === 'PUT' && index < 0) doc.follows.push({ from: me.id, to: targetId, createdAt: new Date().toISOString() });
      if (method === 'DELETE' && index >= 0) doc.follows.splice(index, 1);
      writeSocialDoc(doc);
      return send(res, 200, { ok: true, following: method === 'PUT', authorId: socialPublicId(targetId, sessionSecret()) });
    }

    if (seg[2] === 'stories') {
      const storyId = seg[3], action = seg[4], me = userOf(req), admin = isAdminReq(req);
      if (!me && !(method === 'DELETE' && storyId && !action && admin)) return send(res, 401, { error: 'non_autenticato' });
      if (!storyId && method === 'GET') {
        const doc = readSocialDoc(), following = socialFollowingIds(doc, me.id);
        const stories = rankSocialStories(doc.stories, me, following).map((story) => projectSocialStory(story, me.id, sessionSecret(), { following }));
        return send(res, 200, { stories });
      }
      if (!storyId && method === 'POST') {
        const t = socialThrottle(socialPostHits, req, me, 12, 10 * LOGIN_WINDOW_MS);
        if (t.limited) { res.setHeader('Retry-After', String(t.retryAfter)); return send(res, 429, { error: 'Troppe storie, riprova tra poco', retryAfter: t.retryAfter }); }
        const d = await body(req), text = cleanSocialText(d.text, 280);
        const ref = d.mediaRef || (Array.isArray(d.mediaRefs) && d.mediaRefs[0]);
        const mediaItem = ref ? verifySocialMediaRef(ref, me.id) : null;
        if (ref && !mediaItem) return send(res, 400, { error: 'mediaRef_non_valido_o_scaduto' });
        if (!text && !mediaItem) return send(res, 400, { error: 'contenuto_mancante' });
        const now = Date.now(), doc = readSocialDoc(); purgeExpiredSocialStories(doc, now);
        if (doc.stories.length >= 1000) return send(res, 409, { error: 'limite_storie_raggiunto' });
        const story = {
          id: 'ss_' + crypto.randomBytes(10).toString('base64url'), text, createdAt: new Date(now).toISOString(),
          expiresAt: new Date(now + 24 * 60 * 60 * 1000).toISOString(), media: mediaItem ? [mediaItem] : [],
          ...socialAuthorSnapshot(me), views: [], reports: [],
        };
        doc.stories.push(story); writeSocialDoc(doc);
        return send(res, 201, { story: socialStoryForViewer(story, me, doc) });
      }
      if (!storyId) return send(res, 405, { error: 'metodo_non_consentito' });
      const doc = readSocialDoc(); purgeExpiredSocialStories(doc);
      const index = doc.stories.findIndex((story) => story.id === storyId);
      if (index < 0) return send(res, 404, { error: 'storia_non_trovata' });
      const story = doc.stories[index];
      if (!action && method === 'DELETE') {
        if (!admin && (!me || story.authorId !== me.id)) return send(res, 403, { error: 'non_autorizzato' });
        doc.stories.splice(index, 1); writeSocialDoc(doc);
        return send(res, 200, { ok: true, id: storyId });
      }
      if (action === 'view' && method === 'POST') {
        const t = socialThrottle(socialReactionHits, req, me, 180, LOGIN_WINDOW_MS);
        if (t.limited) { res.setHeader('Retry-After', String(t.retryAfter)); return send(res, 429, { error: 'Troppe visualizzazioni', retryAfter: t.retryAfter }); }
        story.views = socialUniqueIds(story.views); if (!story.views.includes(me.id)) story.views.push(me.id);
        writeSocialDoc(doc); return send(res, 200, { story: socialStoryForViewer(story, me, doc) });
      }
      if (action === 'report' && method === 'POST') {
        if (story.authorId === me.id) return send(res, 400, { error: 'non_puoi_segnalare_un_tuo_contenuto' });
        const t = socialThrottle(socialReportHits, req, me, 20, 60 * LOGIN_WINDOW_MS);
        if (t.limited) { res.setHeader('Retry-After', String(t.retryAfter)); return send(res, 429, { error: 'Troppe segnalazioni', retryAfter: t.retryAfter }); }
        story.reports = socialUniqueIds(story.reports); if (!story.reports.includes(me.id)) story.reports.push(me.id);
        if (story.reports.length >= 3) story.pendingModeration = true;
        writeSocialDoc(doc); return send(res, 200, { ok: true, reported: true, pendingModeration: !!story.pendingModeration });
      }
      return send(res, 405, { error: 'metodo_non_consentito' });
    }

    if (seg[2] === 'posts') {
      const postId = seg[3], action = seg[4], me = userOf(req), admin = isAdminReq(req);
      if (!me && !(method === 'DELETE' && postId && !action && admin)) return send(res, 401, { error: 'non_autenticato' });
      if (!postId && method === 'POST') {
        const t = socialThrottle(socialPostHits, req, me, 8, 10 * LOGIN_WINDOW_MS);
        if (t.limited) { res.setHeader('Retry-After', String(t.retryAfter)); return send(res, 429, { error: 'Troppi post, riprova tra poco', retryAfter: t.retryAfter }); }
        const d = await body(req), text = cleanSocialText(d.text, 700), refs = Array.isArray(d.mediaRefs) ? d.mediaRefs : [];
        if (refs.length > 10) return send(res, 400, { error: 'massimo_10_media' });
        const media = refs.map((ref) => verifySocialMediaRef(ref, me.id));
        if (media.some((item) => !item)) return send(res, 400, { error: 'mediaRef_non_valido_o_scaduto' });
        if (!text && !media.length) return send(res, 400, { error: 'contenuto_mancante' });
        const doc = readSocialDoc();
        if (doc.posts.length >= 2000) return send(res, 409, { error: 'limite_post_raggiunto' });
        const post = {
          id: 'sp_' + crypto.randomBytes(10).toString('base64url'), text, kind: cleanSocialKind(d.kind),
          createdAt: new Date().toISOString(), media, mediaUrl: media[0] ? media[0].url : '',
          ...socialAuthorSnapshot(me), likes: [], saves: [], shares: [], reports: [], comments: [],
        };
        doc.posts.push(post); writeSocialDoc(doc);
        return send(res, 201, { post: socialPostForViewer(post, me, doc) });
      }
      if (!postId) return send(res, 405, { error: 'metodo_non_consentito' });

      if (action === 'comments' && method === 'POST') {
        const t = socialThrottle(socialCommentHits, req, me, 30, LOGIN_WINDOW_MS);
        if (t.limited) { res.setHeader('Retry-After', String(t.retryAfter)); return send(res, 429, { error: 'Troppi commenti, riprova tra poco', retryAfter: t.retryAfter }); }
        const d = await body(req), text = cleanSocialText(d.text, 280);
        if (!text) return send(res, 400, { error: 'testo_mancante' });
        const doc = readSocialDoc(), index = doc.posts.findIndex((item) => item.id === postId);
        if (index < 0) return send(res, 404, { error: 'post_non_trovato' });
        const post = doc.posts[index];
        post.comments = Array.isArray(post.comments) ? post.comments : [];
        if (post.comments.length >= 200) return send(res, 409, { error: 'limite_commenti_raggiunto' });
        const actor = socialAuthorSnapshot(me), comment = {
          id: 'sc_' + crypto.randomBytes(9).toString('base64url'), text, createdAt: new Date().toISOString(),
          authorId: actor.authorId, authorName: actor.authorName, authorPicture: actor.authorPicture, authorType: actor.authorType,
        };
        post.comments.push(comment); writeSocialDoc(doc);
        const projectedPost = socialPostForViewer(post, me, doc);
        return send(res, 201, { post: projectedPost, comment: projectedPost.comments.find((item) => item.id === comment.id) });
      }

      const doc = readSocialDoc(), index = doc.posts.findIndex((post) => post.id === postId);
      if (index < 0) return send(res, 404, { error: 'post_non_trovato' });
      const post = doc.posts[index];
      if (!action && method === 'DELETE') {
        if (!admin && (!me || post.authorId !== me.id)) return send(res, 403, { error: 'non_autorizzato' });
        const limiterIdentity = me || { id: 'staff-admin' }, t = socialThrottle(socialPostHits, req, limiterIdentity, 30, LOGIN_WINDOW_MS);
        if (t.limited) { res.setHeader('Retry-After', String(t.retryAfter)); return send(res, 429, { error: 'Troppe richieste, riprova tra poco', retryAfter: t.retryAfter }); }
        doc.posts.splice(index, 1); writeSocialDoc(doc); return send(res, 200, { ok: true, id: postId });
      }
      if ((action === 'like' || action === 'save') && method === 'POST') {
        const t = socialThrottle(socialReactionHits, req, me, 120, LOGIN_WINDOW_MS);
        if (t.limited) { res.setHeader('Retry-After', String(t.retryAfter)); return send(res, 429, { error: 'Troppe reazioni, riprova tra poco', retryAfter: t.retryAfter }); }
        const key = action === 'like' ? 'likes' : 'saves', ids = socialUniqueIds(post[key]), at = ids.indexOf(me.id);
        if (at >= 0) ids.splice(at, 1); else ids.push(me.id);
        post[key] = ids; writeSocialDoc(doc); return send(res, 200, { post: socialPostForViewer(post, me, doc) });
      }
      if (action === 'share' && method === 'POST') {
        const t = socialThrottle(socialShareHits, req, me, 120, LOGIN_WINDOW_MS);
        if (t.limited) { res.setHeader('Retry-After', String(t.retryAfter)); return send(res, 429, { error: 'Troppe condivisioni', retryAfter: t.retryAfter }); }
        post.shares = socialUniqueIds(post.shares);
        if (post.authorId !== me.id && !post.shares.includes(me.id)) post.shares.push(me.id);
        writeSocialDoc(doc); return send(res, 200, { post: socialPostForViewer(post, me, doc) });
      }
      if (action === 'report' && method === 'POST') {
        if (post.authorId === me.id) return send(res, 400, { error: 'non_puoi_segnalare_un_tuo_contenuto' });
        const t = socialThrottle(socialReportHits, req, me, 20, 60 * LOGIN_WINDOW_MS);
        if (t.limited) { res.setHeader('Retry-After', String(t.retryAfter)); return send(res, 429, { error: 'Troppe segnalazioni', retryAfter: t.retryAfter }); }
        post.reports = socialUniqueIds(post.reports); if (!post.reports.includes(me.id)) post.reports.push(me.id);
        if (post.reports.length >= 3) post.pendingModeration = true;
        writeSocialDoc(doc); return send(res, 200, { ok: true, reported: true, pendingModeration: !!post.pendingModeration });
      }
      return send(res, 405, { error: 'metodo_non_consentito' });
    }
    return send(res, 404, { error: 'route_social_inesistente' });
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
      // ghl-store: snapshot completo dei contatti sincronizzati da GHL (scritto dal connettore Vercel /api/ghl-sync).
      // Sostituisce interamente cr.ghl ad ogni sync (riflette lo stato attuale su GHL); states/hidden/manual restano.
      if (op === 'ghl-store') {
        const list = Array.isArray(d.contacts) ? d.contacts.slice(0, 3000) : [];
        cr.ghl = list.map((c) => ({
          id: (str(c.id, 80).trim()) || ('g:' + crypto.randomBytes(6).toString('hex')),
          name: str(c.name, 120), email: str(c.email, 160), phone: str(c.phone, 40),
          seg: str(c.seg, 24) || 'lead', src: str(c.src, 60) || 'GHL',
          phase: str(c.phase, 40) || 'lead', sig: ['hot', 'warm', 'cold'].includes(c.sig) ? c.sig : 'cold',
          zona: str(c.zona, 120), note: str(c.note, 2000),
          won: typeof c.won === 'boolean' ? c.won : null,
          timeline: (Array.isArray(c.timeline) ? c.timeline.slice(0, 12) : [])
            .map((t) => ({ phase: str(t && t.phase, 40), at: str(t && t.at, 40), label: str(t && t.label, 160) }))
            .filter((t) => t.phase || t.label),
        }));
        cr.ghlSyncedAt = str(d.syncedAt, 40) || new Date().toISOString();
        // semina la pipeline del progetto solo se non ancora personalizzata (primo sync)
        if (!(cr.pipeline || []).length && Array.isArray(d.pipeline) && d.pipeline.length) {
          const seen = new Set();
          cr.pipeline = d.pipeline.slice(0, 12)
            .map((s) => ({ id: slugify(str((s && (s.id || s.label)) || '', 40)), label: str((s && s.label) || '', 40).trim() }))
            .filter((s) => s.id && s.label && !seen.has(s.id) && seen.add(s.id));
        }
        writeCrm(project, cr); return send(res, 200, { ok: true, count: cr.ghl.length, syncedAt: cr.ghlSyncedAt });
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
      if (!canEdit(staffRole(req))) return send(res, 403, { error: 'Accesso riservato' });
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
      if (!canEdit(staffRole(req))) return send(res, 403, { error: 'Accesso riservato' });
      const c = readCand().candidature.find(x => x.id === id);
      return c ? send(res, 200, c) : send(res, 404, { error: 'not found' });
    }
    if (method === 'GET' && !id) { // lista candidature (staff)
      if (!canEdit(staffRole(req))) return send(res, 403, { error: 'Accesso riservato' });
      return send(res, 200, readCand());
    }
    if (id && (method === 'PUT' || method === 'PATCH')) { // aggiorna stato (staff)
      if (!canEdit(staffRole(req))) return send(res, 403, { error: 'Accesso riservato' });
      const d = await body(req); const cand = readCand();
      const c = cand.candidature.find(x => x.id === id);
      if (!c) return send(res, 404, { error: 'not found' });
      if ('state' in d) c.state = ['todo', 'visita', 'done'].includes(d.state) ? d.state : c.state;
      writeCand(cand); return send(res, 200, c);
    }
    if (id && method === 'DELETE') { // rimuovi (staff)
      if (!canEdit(staffRole(req))) return send(res, 403, { error: 'Accesso riservato' });
      const cand = readCand(); const i = cand.candidature.findIndex(x => x.id === id);
      if (i < 0) return send(res, 404, { error: 'not found' });
      cand.candidature.splice(i, 1); writeCand(cand); return send(res, 200, { ok: true });
    }
  }

  // --- Portale self-service produttori (piano 13): richiesta · area "La mia azienda" · verifica staff ---
  if (seg[1] === 'producer') {
    const action = seg[2];

    // ===== Azioni STAFF (browser admin, cookie gf_sess) =====
    if (['approve', 'direct-unlock', 'verify', 'publish', 'suspend'].includes(action)) {
      if (!canEdit(staffRole(req))) return send(res, 403, { error: 'Accesso riservato' });
      if (method !== 'POST') return send(res, 405, { error: 'metodo non consentito' });
      const d = await body(req);

      // approve / direct-unlock: sblocca l'area, crea la scheda-bozza, lega owner + stato utente.
      // (logica estratta in promoteToProducer → riusata anche da Gestione livelli e accettazione invito)
      if (action === 'approve' || action === 'direct-unlock') {
        const uid = String(d.userId || '').trim().toLowerCase();
        const target = readUsers().users.find(u => u.id === uid);
        const r = promoteToProducer(req, target, { name: d.name });
        if (r.error) return send(res, r.code || 400, { error: r.error });
        return send(res, 200, r);
      }

      // verify / publish / suspend operano su una scheda esistente (producerId nel body).
      const pid = String(d.producerId || '').trim();
      const store = readStore();
      const p = store.producers.find(x => x.id === pid);
      if (!p) return send(res, 404, { error: 'scheda non trovata' });
      if (action === 'verify') { // verifica in sede fatta → pronta per il go-live
        const st = auditPush(p, req, 'verificata');
        p.verifiedAt = new Date().toISOString();
        p.verify = { state: 'valid', date: str(d.date, 60) || p.verifiedAt.slice(0, 10), next: str(d.next, 60), by: st.name };
        anchorProducerSocialLocation(p);
        writeStore(store); return send(res, 200, { ok: true, producer: p });
      }
      if (action === 'publish') { // go-live col badge: richiede la verifica in sede
        if (!p.verifiedAt) return send(res, 400, { error: 'verifica in sede mancante: /verify prima di pubblicare' });
        if (!Object.prototype.hasOwnProperty.call(p, 'socialLocation')) {
          return send(res, 400, { error: 'località social non verificata: esegui nuovamente /verify prima di pubblicare' });
        }
        const st = auditPush(p, req, 'pubblicata');
        p.status = 'published'; p.publishedAt = new Date().toISOString(); p.publishedBy = st.name;
        // `socialLocation` è un attestato creato da /verify: publish lo preserva ESATTAMENTE, anche se vuoto.
        writeStore(store);
        if (p.ownerId) upsertUser({ id: p.ownerId, producerStatus: 'published' });
        return send(res, 200, { ok: true, producer: p });
      }
      if (action === 'suspend') {
        auditPush(p, req, 'sospesa');
        p.status = 'sospeso'; writeStore(store);
        if (p.ownerId) upsertUser({ id: p.ownerId, producerStatus: 'in_review' });
        return send(res, 200, { ok: true, producer: p });
      }
    }

    // ===== Azioni UTENTE-OWNER (cookie gf_user) =====
    // Richiesta "diventa produttore": crea una candidatura legata all'account + stato 'requested'.
    if (action === 'request' && method === 'POST') {
      const me = userOf(req); if (!me) return send(res, 401, { error: 'non_autenticato' });
      if (me.producerId) return send(res, 200, { status: me.producerStatus || 'approved', producerId: me.producerId });
      const d = await body(req);
      const dc = (d.contact && typeof d.contact === 'object') ? d.contact : {};
      const cand = readCand(); const cid = crypto.randomBytes(8).toString('hex');
      cand.candidature.push({
        id: cid, userId: me.id,
        name: str(d.name, 160).trim() || (me.name || (me.email || '').split('@')[0] || 'Produttore'),
        place: str(d.place, 160).trim(),
        categories: Array.isArray(d.categories) ? d.categories.map(c => str(c, 60)) : [],
        contact: {
          whatsapp: str(dc.whatsapp || d.whatsapp, 80).trim(),
          phone: str(dc.phone || d.phone, 80).trim(),
          email: str(dc.email || d.email, 160).trim() || (me.email || ''),
        },
        note: str(d.note, 2000).trim(), photos: [], state: 'todo', ts: new Date().toISOString(),
      });
      writeCand(cand);
      const user = upsertUser({ id: me.id, producerStatus: 'requested' });
      return send(res, 200, { ok: true, status: 'requested', candidaturaId: cid, user: publicUser(user) });
    }

    // Area "La mia azienda": tutto sotto /api/producer/me/*
    if (action === 'me') {
      const me = userOf(req); if (!me) return send(res, 401, { error: 'non_autenticato' });
      const sub = seg[3];

      // GET → stato + scheda + blocchi mancanti per l'invio
      if (!sub && method === 'GET') {
        const store = readStore();
        const p = me.producerId ? store.producers.find(x => x.id === me.producerId) || null : null;
        return send(res, 200, { status: me.producerStatus || null, producer: p, readiness: p ? producerReadiness(p) : null });
      }

      // Le mutazioni richiedono owner + scheda posseduta.
      const { store, p } = ownedProducer(req);
      if (!p) return send(res, 403, { error: 'nessuna scheda da gestire' });

      // PATCH identità/contatti/come-si-raggiunge — WHITELIST: mai status/verify/ownerId (anti-escalation).
      if (!sub && (method === 'PATCH' || method === 'PUT')) {
        const d = await body(req);
        if ('name' in d) p.name = str(d.name, 160);
        if ('place' in d) p.place = str(d.place, 160);
        if ('story' in d) p.story = str(d.story, 4000);
        if ('categories' in d) p.categories = Array.isArray(d.categories) ? d.categories.map(c => str(c, 60)) : [];
        if ('primary' in d) p.primary = str(d.primary, 60);
        if ('photo' in d) p.photo = str(d.photo, 1200);
        if ('photoPos' in d) p.photoPos = str(d.photoPos, 40); // focal point copertina, es. "50% 30%"
        if ('hours' in d) p.hours = str(d.hours, 200);           // stringa componibile per la scheda
        if ('hoursOpen' in d) p.hoursOpen = str(d.hoursOpen, 10);  // "HH:MM" apertura
        if ('hoursClose' in d) p.hoursClose = str(d.hoursClose, 10);
        if ('hoursNote' in d) p.hoursNote = str(d.hoursNote, 200); // giorni/note libere
        if ('address' in d) p.address = str(d.address, 240);
        if ('howToReach' in d) p.howToReach = str(d.howToReach, 600);
        if ('lat' in d) p.lat = num(d.lat);
        if ('lng' in d) p.lng = num(d.lng);
        if ('contact' in d && d.contact && typeof d.contact === 'object') {
          p.contact = { whatsapp: str(d.contact.whatsapp, 80).trim(), phone: str(d.contact.phone, 80).trim(), email: str(d.contact.email, 160).trim() };
        }
        if (me.producerStatus === 'approved') upsertUser({ id: me.id, producerStatus: 'onboarding' });
        writeStore(store); return send(res, 200, { producer: p });
      }

      // Prodotti (CRUD)
      if (sub === 'products') {
        const pid = seg[4]; p.products = Array.isArray(p.products) ? p.products : [];
        if (!pid && method === 'POST') { const prod = cleanProduct(await body(req)); if (!prod) return send(res, 400, { error: 'prodotto non valido' }); p.products.push(prod); writeStore(store); return send(res, 200, { product: prod, producer: p }); }
        const idx = p.products.findIndex(x => x.id === pid);
        if (pid && (method === 'PATCH' || method === 'PUT')) { if (idx < 0) return send(res, 404, { error: 'prodotto non trovato' }); p.products[idx] = cleanProduct(await body(req), p.products[idx]); writeStore(store); return send(res, 200, { product: p.products[idx], producer: p }); }
        if (pid && method === 'DELETE') { if (idx < 0) return send(res, 404, { error: 'prodotto non trovato' }); const [removed] = p.products.splice(idx, 1); writeStore(store); return send(res, 200, { ok: true, removed }); }
      }

      // Disponibilità (toggle) — live subito anche a scheda pubblicata (§D8).
      if (sub === 'availability' && seg[4] && method === 'POST') {
        const prod = (p.products || []).find(x => x.id === seg[4]);
        if (!prod) return send(res, 404, { error: 'prodotto non trovato' });
        const d = await body(req);
        prod.availability = ['available', 'out', 'returns'].includes(d.availability) ? d.availability : prod.availability;
        if ('returnsMonth' in d) prod.returnsMonth = monthsOf([d.returnsMonth])[0] || null;
        writeStore(store); return send(res, 200, { product: prod });
      }

      // Upload media (foto prodotto/azienda o clip) → Cloudinary o disco → URL da salvare poi nel campo.
      if (sub === 'media' && method === 'POST') {
        const d = await body(req, BODY_MAX_MEDIA);
        try {
          const r = await saveMedia(d.dataUrl, { folder: `producers/${p.id}`, diskDir: PRODMEDIADIR, diskUrlBase: 'assets/media/producers', filenameBase: `${p.id}-${crypto.randomBytes(4).toString('hex')}` });
          return send(res, 200, r);
        } catch (e) { return send(res, e.code === 400 ? 400 : 502, { error: e.message }); }
      }

      // Invio per la verifica: valida i blocchi tassativi + consenso → in_review.
      if (sub === 'submit' && method === 'POST') {
        const d = await body(req);
        const missing = producerReadiness(p);
        if (!d.acceptTerms) missing.push('consent');
        if (missing.length) return send(res, 400, { error: 'onboarding incompleto', missing });
        p.status = 'in_review'; p.submittedAt = new Date().toISOString();
        p.consent = { acceptedInApp: true, acceptedAt: p.submittedAt, signedOnSite: false, signedAt: '' };
        writeStore(store);
        const user = upsertUser({ id: me.id, producerStatus: 'in_review' });
        return send(res, 200, { ok: true, producer: p, user: publicUser(user) });
      }
    }
    return send(res, 404, { error: 'route produttore inesistente' });
  }

  // --- producers ---
  if (seg[1] === 'producers') {
    const store = readStore();
    const id = seg[2];
    const staff = canEdit(staffRole(req));
    // GET list / one — pubblico, ma le schede NON pubblicate (bozza/in-verifica) sono visibili solo allo staff.
    if (method === 'GET' && !id) {
      const producers = staff ? store.producers : store.producers.filter(isPublished).map(publicProducer);
      return send(res, 200, { ...store, producers });
    }
    if (method === 'GET' && id) {
      const p = store.producers.find(x => x.id === id);
      if (!p || (!staff && !isPublished(p))) return send(res, 404, { error: 'not found' });
      return send(res, 200, staff ? p : publicProducer(p));
    }

    // mutazioni: serve ruolo
    const role = staffRole(req);
    if (!canEdit(role)) return send(res, 403, { error: 'Accesso riservato' });

    if (method === 'POST' && !id) { // crea
      const data = normalizePatch(await body(req));
      let nid = slugify(data.name || data.id || 'produttore'); let n = nid, i = 2;
      while (store.producers.some(p => p.id === n)) n = nid + '-' + (i++);
      const p = Object.assign({ categories: [], primary: 'latte', tone: 'pascolo', verify: { state: 'valid', date: '' }, seasonal: [], videos: [], products: [], contact: {}, status: 'published', ownerId: null }, data, { id: n });
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

function serveFileFromDisk(req, res, file, onMissing) {
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) return onMissing();
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const isVideoFile = type.startsWith('video/'), range = req.headers.range;
    if (isVideoFile && range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(String(range).trim());
      let start, end;
      if (match) {
        if (match[1]) {
          start = Number(match[1]); end = match[2] ? Number(match[2]) : stat.size - 1;
        } else if (match[2]) {
          const suffix = Number(match[2]); start = Math.max(0, stat.size - suffix); end = stat.size - 1;
        }
      }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= stat.size || end < start) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}`, 'Accept-Ranges': 'bytes' }); return res.end();
      }
      end = Math.min(end, stat.size - 1);
      res.writeHead(206, {
        'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Content-Length': end - start + 1,
      });
      if (req.method === 'HEAD') return res.end();
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    const headers = { 'Content-Type': type, 'Content-Length': stat.size };
    if (isVideoFile) headers['Accept-Ranges'] = 'bytes';
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

function requestHandler(req, res) {
  let url;
  try { url = decodeURIComponent(String(req.url || '/').split('?')[0]); }
  catch { return send(res, 400, { error: 'url_non_valido' }); }
  if (url.startsWith('/api/')) {
    // CORS (audit S4, rivisto): `*` è sicuro qui. L'app è same-origin (server serve UI+API), quindi non usa CORS;
    // per le richieste CREDENZIALATE cross-origin il browser blocca comunque `*` (non si può usare con i cookie),
    // quindi il `*` espone solo i GET GIÀ pubblici (es. lista produttori). Nessun dato auth trapela. Lasciato apposta.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    return api(req, res, url).catch((e) => {
      const status = Number(e && e.code);
      const code = [400, 401, 403, 404, 409, 413, 429, 502, 503, 507].includes(status) ? status : 500;
      return send(res, code, { error: code === 500 ? 'errore_interno' : cleanSocialText(e && e.message, 240) || 'richiesta_non_valida' });
    });
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
        return serveFileFromDisk(req, res, alt, () => { res.writeHead(404); res.end('not found'); });
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
  cleanProduct, cleanPriceBand, monthsOf, producerReadiness, isPublished,
  cleanSocialText, cleanSocialKind, socialPageParams, socialPublicId, socialLocation, socialLocality,
  diversifySocialTier, rankSocialPosts, revalidateSocialAuthors, projectSocialPost, projectSocialStory,
  cleanSocialMedia, socialMediaFormat, socialPostVirality, socialProducerScores, socialViralityLabel,
  normalizeSocialDoc, signSocialMediaRef, verifySocialMediaRef, purgeExpiredSocialStories,
  socialThrottle, acquireSocialUploadSlot,
};
