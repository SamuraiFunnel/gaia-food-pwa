// db.js — Persistenza dati Gaia Food. Due modalità, decise da DATABASE_URL:
//
//  • DB-mode  (DATABASE_URL presente) → Postgres/Neon. I dati sopravvivono a riavvii e deploy.
//       Cache in-memory (letture sincrone, come prima) + write-through SERIALIZZATO al DB.
//       Le scritture sono "replace-all" per collezione, in transazione: dati minuscoli, semplice e corretto.
//  • File-mode (nessun DATABASE_URL) → file JSON su GF_DATA_DIR/./data. Identico allo storico:
//       sviluppo locale e test continuano a girare senza database né dipendenze.
//
// Il server usa SEMPRE le stesse funzioni (readUsers/writeUsers/…): non sa quale modalità è attiva.
const fs = require('fs'), path = require('path');

const ROOT = __dirname;
const DATA_RW = process.env.GF_DATA_DIR || path.join(ROOT, 'data');
const SEED_STORE = path.join(ROOT, 'data', 'producers.json'); // seed del repo (zona+categorie+produttori)
const STORE = path.join(DATA_RW, 'producers.json');
const WAITLIST = path.join(DATA_RW, 'waitlist.json');
const CANDIDATURE = path.join(DATA_RW, 'candidature.json');
const USERS = path.join(DATA_RW, 'users.json');
const CRM = path.join(DATA_RW, 'crm.json'); // stato CRM per contatto (stage), gestito dal cruscotto del Lab

const DB_URL = process.env.DATABASE_URL || '';
const useDb = !!DB_URL;

// ---------- utility file (file-mode + sorgente di SEED per il DB) ----------
const readJson = (f, fallback) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fallback; } };
const writeJson = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 2));
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const toIso = (v) => (v instanceof Date ? v.toISOString() : (v || null));
const clone = (x) => structuredClone(x);

// Zona attiva + categorie: dato di riferimento, sempre dal seed nel repo (non sono dati-utente).
function seedMeta() { const s = readJson(SEED_STORE, { zone: null, categories: [] }); return { zone: s.zone || null, categories: s.categories || [] }; }

// ========================= mapper utente <-> riga (puri, testabili) =========================
// L'oggetto-utente dell'app ha campi camelCase e opzionali (assenti quando non impostati).
function userToRow(u) {
  return {
    id: u.id, email: u.email || null, provider: u.provider || null,
    pass_hash: u.passHash || null, name: u.name || null, picture: u.picture || null,
    city: u.city || null, phone: u.phone || null, lang: u.lang || null, notif: !!u.notif,
    zone: u.zone ? JSON.stringify(u.zone) : null, // colonna jsonb → serializzo io (node-pg non lo fa)
    seed: u.seed || null, referred_by: u.referredBy || null,
    referred_at: u.referredAt || null, created_at: u.createdAt || null,
    // stato "produttore" (self-service): ruolo, scheda posseduta, stato del ciclo di onboarding.
    role: u.role || null, producer_id: u.producerId || null, producer_status: u.producerStatus || null,
    // livello di accesso staff (gestione app): 'admin' | 'verificatore' | null. Distinto da `role` (produttore).
    staff_role: u.staffRole || null,
  };
}
function rowToUser(r) {
  const u = { id: r.id };
  if (r.email) u.email = r.email;
  if (r.provider) u.provider = r.provider;
  if (r.pass_hash) u.passHash = r.pass_hash;
  if (r.name) u.name = r.name;
  if (r.picture) u.picture = r.picture;
  if (r.city) u.city = r.city;
  if (r.phone) u.phone = r.phone;
  if (r.lang) u.lang = r.lang;
  if (r.notif) u.notif = true;
  if (r.zone) u.zone = typeof r.zone === 'string' ? JSON.parse(r.zone) : r.zone; // jsonb → già oggetto da pg
  if (r.seed) u.seed = r.seed;
  if (r.referred_by) u.referredBy = r.referred_by;
  if (r.referred_at) u.referredAt = toIso(r.referred_at);
  if (r.role) u.role = r.role;
  if (r.producer_id) u.producerId = r.producer_id;
  if (r.producer_status) u.producerStatus = r.producer_status;
  if (r.staff_role) u.staffRole = r.staff_role;
  u.createdAt = toIso(r.created_at) || u.createdAt;
  return u;
}
const rowToLead = (r) => ({ email: r.email, zona: r.zona || '', source: r.source || '', ts: toIso(r.ts), ip: r.ip || '' });

// ========================= FILE-MODE =========================
// Garantisce i file scrivibili (produttori seeded dal repo) — eseguito al load del modulo,
// così i test che importano il server (senza chiamare init) trovano i dati pronti, come prima.
function ensureFiles() {
  try {
    fs.mkdirSync(DATA_RW, { recursive: true });
    if (!fs.existsSync(STORE) && fs.existsSync(SEED_STORE)) fs.copyFileSync(SEED_STORE, STORE);
  } catch (e) { console.error('ensureFiles:', e.message); }
}
const fileStore = {
  mode: 'file',
  init: async () => {},
  flush: async () => {},
  readUsers: () => readJson(USERS, { users: [] }),
  writeUsers: (d) => writeJson(USERS, d),
  readStore: () => readJson(STORE, { ...seedMeta(), producers: [] }),
  writeStore: (d) => writeJson(STORE, d),
  readWait: () => readJson(WAITLIST, { leads: [] }),
  writeWait: (d) => writeJson(WAITLIST, d),
  readCand: () => readJson(CANDIDATURE, { candidature: [] }),
  writeCand: (d) => writeJson(CANDIDATURE, d),
  readCrm: (project) => { const all = readJson(CRM, { byProject: {} }); return all.byProject[project] || { states: {}, hidden: [], manual: [], pipeline: [] }; },
  writeCrm: (project, doc) => { const all = readJson(CRM, { byProject: {} }); all.byProject = all.byProject || {}; all.byProject[project] = doc; writeJson(CRM, all); },
};

// ========================= DB-MODE (Postgres/Neon) =========================
let pool = null;
const cache = { users: { users: [] }, producers: [], wait: { leads: [] }, cand: { candidature: [] }, crm: { byProject: {} } };
let META = { zone: null, categories: [] };

// Coda di persistenza serializzata per collezione → i "replace-all" non si sovrappongono.
const queues = { users: Promise.resolve(), producers: Promise.resolve(), wait: Promise.resolve(), cand: Promise.resolve(), crm: Promise.resolve() };
function enqueue(coll, fn) {
  queues[coll] = queues[coll].then(fn).catch((e) => console.error(`persist ${coll}:`, e.message));
  return queues[coll];
}

const DDL = `
CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY, email text, provider text, pass_hash text,
  name text, picture text, city text, phone text, lang text, notif boolean DEFAULT false,
  zone jsonb, seed text UNIQUE, referred_by text, referred_at timestamptz, created_at timestamptz DEFAULT now(),
  role text, producer_id text, producer_status text, staff_role text
);
-- Colonne produttore aggiunte a posteriori: ALTER idempotente per i DB già creati prima di questa feature.
ALTER TABLE users ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS producer_id text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS producer_status text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS staff_role text;
CREATE INDEX IF NOT EXISTS idx_users_created ON users (created_at);
CREATE INDEX IF NOT EXISTS idx_users_provider ON users (provider);
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users (referred_by);
CREATE INDEX IF NOT EXISTS idx_users_producer_id ON users (producer_id);
CREATE TABLE IF NOT EXISTS producers (
  id text PRIMARY KEY, name text, place text, km numeric, lat numeric, lng numeric,
  primary_cat text, verify_state text, data jsonb NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS candidature (
  id text PRIMARY KEY, name text, place text, state text, ts timestamptz, data jsonb NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS waitlist (
  id bigserial PRIMARY KEY, email text, zona text, source text, ts timestamptz, ip text
);
CREATE TABLE IF NOT EXISTS crm_doc (
  k text PRIMARY KEY, v jsonb NOT NULL, updated_at timestamptz DEFAULT now()
);`;

// --- persistenze "replace-all" in transazione (volumi minuscoli) ---
async function tx(fn) {
  const c = await pool.connect();
  try { await c.query('BEGIN'); await fn(c); await c.query('COMMIT'); }
  catch (e) { try { await c.query('ROLLBACK'); } catch {} throw e; }
  finally { c.release(); }
}
async function persistUsers(d) {
  await tx(async (c) => {
    await c.query('DELETE FROM users');
    for (const u of d.users) {
      const r = userToRow(u);
      await c.query(
        `INSERT INTO users (id,email,provider,pass_hash,name,picture,city,phone,lang,notif,zone,seed,referred_by,referred_at,created_at,role,producer_id,producer_status,staff_role)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
        [r.id, r.email, r.provider, r.pass_hash, r.name, r.picture, r.city, r.phone, r.lang, r.notif, r.zone, r.seed, r.referred_by, r.referred_at, r.created_at, r.role, r.producer_id, r.producer_status, r.staff_role]);
    }
  });
}
async function persistProducers(list) {
  await tx(async (c) => {
    await c.query('DELETE FROM producers');
    for (const p of list) {
      await c.query(
        `INSERT INTO producers (id,name,place,km,lat,lng,primary_cat,verify_state,data) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [p.id, p.name || null, p.place || null, num(p.km), num(p.lat), num(p.lng), p.primary || null, (p.verify && p.verify.state) || null, JSON.stringify(p)]);
    }
  });
}
async function persistCand(d) {
  await tx(async (c) => {
    await c.query('DELETE FROM candidature');
    for (const x of d.candidature) {
      await c.query(
        `INSERT INTO candidature (id,name,place,state,ts,data) VALUES ($1,$2,$3,$4,$5,$6)`,
        [x.id, x.name || null, x.place || null, x.state || null, x.ts || null, JSON.stringify(x)]);
    }
  });
}
async function persistWait(d) {
  await tx(async (c) => {
    await c.query('DELETE FROM waitlist');
    for (const l of d.leads) {
      await c.query(`INSERT INTO waitlist (email,zona,source,ts,ip) VALUES ($1,$2,$3,$4,$5)`,
        [l.email || null, l.zona || null, l.source || null, l.ts || null, l.ip || null]);
    }
  });
}
async function persistCrmRow(project, doc) {
  await pool.query(
    `INSERT INTO crm_doc (k,v,updated_at) VALUES ($1,$2,now())
     ON CONFLICT (k) DO UPDATE SET v=$2, updated_at=now()`, [project, JSON.stringify(doc)]);
}

// Carica dal DB; se una tabella è vuota, la semina dai file del repo (migrazione una-tantum).
async function loadOrSeed() {
  META = seedMeta();
  // USERS
  let r = await pool.query('SELECT * FROM users');
  if (r.rowCount === 0) { const s = readJson(USERS, { users: [] }).users || []; if (s.length) { await persistUsers({ users: s }); r = await pool.query('SELECT * FROM users'); } }
  cache.users = { users: r.rows.map(rowToUser).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))) };
  // PRODUCERS
  let p = await pool.query('SELECT data FROM producers');
  if (p.rowCount === 0) { const s = readJson(SEED_STORE, { producers: [] }).producers || []; if (s.length) { await persistProducers(s); p = await pool.query('SELECT data FROM producers'); } }
  cache.producers = p.rows.map((x) => x.data);
  // CANDIDATURE
  let c = await pool.query('SELECT data FROM candidature ORDER BY ts');
  if (c.rowCount === 0) { const s = readJson(CANDIDATURE, { candidature: [] }).candidature || []; if (s.length) { await persistCand({ candidature: s }); c = await pool.query('SELECT data FROM candidature ORDER BY ts'); } }
  cache.cand = { candidature: c.rows.map((x) => x.data) };
  // WAITLIST
  let w = await pool.query('SELECT email,zona,source,ts,ip FROM waitlist ORDER BY ts');
  if (w.rowCount === 0) { const s = readJson(WAITLIST, { leads: [] }).leads || []; if (s.length) { await persistWait({ leads: s }); w = await pool.query('SELECT email,zona,source,ts,ip FROM waitlist ORDER BY ts'); } }
  cache.wait = { leads: w.rows.map(rowToLead) };
  // CRM doc PER-PROGETTO (una riga per progetto: stage, nascosti, manuali, pipeline)
  const cr = await pool.query('SELECT k,v FROM crm_doc');
  cache.crm = { byProject: Object.fromEntries(cr.rows.map((r) => [r.k, r.v])) };
}

const dbStore = {
  mode: 'db',
  async init() {
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false }, max: 5 });
    await pool.query(DDL);
    await loadOrSeed();
    console.log(`DB pronto (Postgres) — utenti:${cache.users.users.length} produttori:${cache.producers.length} candidature:${cache.cand.candidature.length} waitlist:${cache.wait.leads.length}`);
  },
  flush: () => Promise.all(Object.values(queues)),
  readUsers: () => clone(cache.users),
  writeUsers: (d) => { cache.users = clone(d); enqueue('users', () => persistUsers(cache.users)); },
  readStore: () => ({ zone: META.zone, categories: META.categories, producers: clone(cache.producers) }),
  writeStore: (d) => { cache.producers = clone(d.producers || []); if (d.zone) META.zone = d.zone; if (Array.isArray(d.categories) && d.categories.length) META.categories = d.categories; enqueue('producers', () => persistProducers(cache.producers)); },
  readWait: () => clone(cache.wait),
  writeWait: (d) => { cache.wait = clone(d); enqueue('wait', () => persistWait(cache.wait)); },
  readCand: () => clone(cache.cand),
  writeCand: (d) => { cache.cand = clone(d); enqueue('cand', () => persistCand(cache.cand)); },
  readCrm: (project) => clone(cache.crm.byProject[project] || { states: {}, hidden: [], manual: [], pipeline: [] }),
  writeCrm: (project, doc) => { cache.crm.byProject[project] = clone(doc); const snap = clone(doc); enqueue('crm', () => persistCrmRow(project, snap)); },
  query: (...a) => pool.query(...a), // per il cruscotto (read-only) in Fase 2
};

if (!useDb) ensureFiles(); // file-mode: prepara i file al load (i test non chiamano init)

module.exports = Object.assign(useDb ? dbStore : fileStore, { userToRow, rowToUser }); // mapper esportati per i test
