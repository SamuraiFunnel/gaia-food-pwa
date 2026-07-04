// Integration test — l'API HTTP reale (server.js) su una porta effimera e una cartella dati usa-e-getta.
// Nessuna dipendenza esterna: si usa il modulo http di Node come client.
// Isolamento: ogni test che tocca il rate-limit usa un IP (x-forwarded-for) diverso → bucket indipendenti.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// GF_DATA_DIR temporaneo + Google client id vuoto (percorso 503, niente rete) — impostati PRIMA dell'import.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'gf-api-'));
process.env.GF_DATA_DIR = TMP;
process.env.GF_GOOGLE_CLIENT_ID = '';
const { requestHandler } = await import('../server.js');

let server, port;
before(async () => {
  server = http.createServer(requestHandler);
  await new Promise((r) => server.listen(0, r));
  port = server.address().port;
});
after(() => { try { server.close(); } catch {} try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {} });

// Client HTTP minimale. opts: { body, cookie, ip }.
function api(method, p, { body, cookie, ip } = {}) {
  return new Promise((resolve, reject) => {
    const data = body != null ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (cookie) headers['Cookie'] = cookie;
    if (ip) headers['x-forwarded-for'] = ip;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers }, (res) => {
      let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => {
        let json = null; try { json = b ? JSON.parse(b) : null; } catch {}
        resolve({ status: res.statusCode, json, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}
// Estrae il cookie di sessione utente da una risposta di login.
const userCookie = (res) => ((res.headers['set-cookie'] || []).map((s) => s.split(';')[0]).find((s) => s.startsWith('gf_user=')) || '');
// Crea un account (email+password) e ritorna il cookie di sessione.
async function signIn(email, ip, seme) {
  const body = { email, password: 'testPassword1' }; if (seme) body.seme = seme;
  const r = await api('POST', '/api/auth/register', { body, ip });
  assert.equal(r.status, 200, `register ${email} → ${r.status}`);
  return userCookie(r);
}

// -------------------------------------------------- config & sessione
test('GET /api/auth/config → googleClientId vuoto quando non configurato', async () => {
  const r = await api('GET', '/api/auth/config');
  assert.equal(r.status, 200);
  assert.equal(r.json.googleClientId, '');
});
test('GET /api/auth/me senza cookie → user null', async () => {
  const r = await api('GET', '/api/auth/me');
  assert.equal(r.status, 200);
  assert.equal(r.json.user, null);
});

// -------------------------------------------------- registrazione email
test('POST /api/auth/register: email non valida → 400', async () => {
  const r = await api('POST', '/api/auth/register', { body: { email: 'non-una-email', password: 'unaPassword1' }, ip: 'e1' });
  assert.equal(r.status, 400);
});
test('POST /api/auth/register: valida → 200, utente creato, cookie di sessione, /me lo riconosce', async () => {
  const r = await api('POST', '/api/auth/register', { body: { email: 'Mario@X.it', password: 'unaPassword1' }, ip: 'e2' });
  assert.equal(r.status, 200);
  assert.equal(r.json.user.email, 'mario@x.it'); // normalizzata lowercase
  const cookie = userCookie(r);
  assert.ok(cookie.startsWith('gf_user='));
  const me = await api('GET', '/api/auth/me', { cookie });
  assert.equal(me.json.user.email, 'mario@x.it');
});

// -------------------------------------------------- Google (senza client id)
test('POST /api/auth/google senza client id → 503 (nessuna chiamata di rete)', async () => {
  const r = await api('POST', '/api/auth/google', { body: { idToken: 'qualsiasi' }, ip: 'g1' });
  assert.equal(r.status, 503);
});

// -------------------------------------------------- profilo
test('PATCH /api/auth/profile senza login → 401', async () => {
  const r = await api('PATCH', '/api/auth/profile', { body: { name: 'X' } });
  assert.equal(r.status, 401);
});
test('PATCH /api/auth/profile: salva nome/città/lingua/notifiche/zona; lingua non valida ignorata', async () => {
  const cookie = await signIn('prof@x.it', 'p1');
  const r = await api('PATCH', '/api/auth/profile', {
    cookie,
    body: { name: '  Mario  ', city: 'Scanno', phone: '333', lang: 'en', notif: true,
      zone: { id: 'ab', label: 'Abruzzo', region: 'Abruzzo', comuni: ['Scanno', 'Villetta Barrea'] } },
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.user.name, 'Mario'); // trim
  assert.equal(r.json.user.lang, 'en');
  assert.equal(r.json.user.notif, true);
  assert.equal(r.json.user.zone.region, 'Abruzzo');
  // lingua non valida → non sovrascrive quella buona
  const r2 = await api('PATCH', '/api/auth/profile', { cookie, body: { lang: 'english' } });
  assert.equal(r2.json.user.lang, 'en');
  // persistenza: /me rilegge da disco
  const me = await api('GET', '/api/auth/me', { cookie });
  assert.equal(me.json.user.name, 'Mario');
});

// -------------------------------------------------- Custodi / referral
test('GET /api/custodi/me senza login → 401', async () => {
  const r = await api('GET', '/api/custodi/me');
  assert.equal(r.status, 401);
});
test('referral: chi si iscrive con il seme di un altro compare tra i suoi Custodi', async () => {
  const cookieA = await signIn('padrino@x.it', 'r1');
  const a = await api('GET', '/api/custodi/me', { cookie: cookieA });
  assert.equal(a.status, 200);
  const seed = a.json.seed;
  assert.ok(seed, 'il padrino ha un seme');
  assert.equal(a.json.counts.total, 0);

  await signIn('invitato@x.it', 'r2', seed); // B si iscrive col seme di A

  const a2 = await api('GET', '/api/custodi/me', { cookie: cookieA });
  assert.equal(a2.json.counts.total, 1);
  assert.equal(a2.json.people.length, 1);
  assert.equal(a2.json.people[0].state, 'seme'); // appena creato → credito ancora 0
  assert.equal(a2.json.credit, 0);
});

// -------------------------------------------------- waitlist
test('waitlist: POST valido ok, email invalida 400, GET senza staff 403', async () => {
  assert.equal((await api('POST', '/api/waitlist', { body: { email: 'lista@x.it', zona: 'Molise' }, ip: 'w1' })).status, 200);
  assert.equal((await api('POST', '/api/waitlist', { body: { email: 'boh' }, ip: 'w1' })).status, 400);
  assert.equal((await api('GET', '/api/waitlist')).status, 403);
});

// -------------------------------------------------- candidature
test('candidature: POST senza nome 400, con nome 200, GET lista senza staff 403', async () => {
  assert.equal((await api('POST', '/api/candidature', { body: { place: 'Scanno' }, ip: 'c1' })).status, 400);
  const ok = await api('POST', '/api/candidature', { body: { name: 'Cascina Test' }, ip: 'c1' });
  assert.equal(ok.status, 200);
  assert.ok(ok.json.id);
  assert.equal((await api('GET', '/api/candidature')).status, 403);
});

// -------------------------------------------------- producers
test('producers: GET pubblico ok (seed), POST senza ruolo → 403', async () => {
  const list = await api('GET', '/api/producers');
  assert.equal(list.status, 200);
  assert.ok(Array.isArray(list.json.producers));
  assert.equal((await api('POST', '/api/producers', { body: { name: 'Nuovo' } })).status, 403);
});

// -------------------------------------------------- rate limiting
test('rate-limit: /api/auth/login oltre 10/min dallo stesso IP → 429', async () => {
  const statuses = [];
  for (let i = 0; i < 11; i++) {
    const r = await api('POST', '/api/auth/login', { body: { email: 'flood@x.it', password: 'qualsiasi1' }, ip: 'flood-ip' });
    statuses.push(r.status);
  }
  assert.equal(statuses.at(-1), 429, `ultima richiesta dovrebbe essere 429, statuses=${statuses.join(',')}`);
});

// -------------------------------------------------- avatar
test('avatar: senza login 401, data-url invalido 400, valido → 200 con picture', async () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  assert.equal((await api('POST', '/api/auth/avatar', { body: { dataUrl: PNG } })).status, 401);
  const cookie = await signIn('avatar@x.it', 'av1');
  assert.equal((await api('POST', '/api/auth/avatar', { cookie, body: { dataUrl: 'nope' } })).status, 400);
  const r = await api('POST', '/api/auth/avatar', { cookie, body: { dataUrl: PNG } });
  assert.equal(r.status, 200);
  assert.match(r.json.user.picture, /^assets\/photos\/users\//);
});

// -------------------------------------------------- static file server
test('statico: index, asset JS, SPA fallback; config.json mai servito (403)', async () => {
  const home = await api('GET', '/');
  assert.equal(home.status, 200);
  assert.match(home.headers['content-type'], /text\/html/);
  assert.equal((await api('GET', '/js/i18n.js')).status, 200);    // asset reale del repo
  assert.equal((await api('GET', '/una/rotta/spa')).status, 200);  // non-file, non-api → fallback index
  assert.equal((await api('GET', '/data/config.json')).status, 403); // segreti mai serviti
});

// -------------------------------------------------- email + password (register / login)
test('register: password corta 400 · valida → 200+cookie+/me (no passHash) · duplicato → 409', async () => {
  assert.equal((await api('POST', '/api/auth/register', { body: { email: 'pw@x.it', password: 'corta1' }, ip: 'reg1' })).status, 400);
  const r = await api('POST', '/api/auth/register', { body: { email: 'pw@x.it', password: 'unaBuonaPassword' }, ip: 'reg2' });
  assert.equal(r.status, 200);
  assert.equal(r.json.user.email, 'pw@x.it');
  assert.equal(r.json.user.passHash, undefined, 'passHash non deve MAI uscire');
  const me = await api('GET', '/api/auth/me', { cookie: userCookie(r) });
  assert.equal(me.json.user.email, 'pw@x.it');
  assert.equal(me.json.user.passHash, undefined);
  assert.equal((await api('POST', '/api/auth/register', { body: { email: 'pw@x.it', password: 'altraPassword12' }, ip: 'reg3' })).status, 409);
});
test('login: giusta → 200 · sbagliata → 401 · inesistente → 401 · senza password → 400', async () => {
  await api('POST', '/api/auth/register', { body: { email: 'log@x.it', password: 'passwordGiusta1' }, ip: 'log1' });
  const ok = await api('POST', '/api/auth/login', { body: { email: 'log@x.it', password: 'passwordGiusta1' }, ip: 'log2' });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.user.passHash, undefined);
  assert.equal((await api('POST', '/api/auth/login', { body: { email: 'log@x.it', password: 'sbagliata' }, ip: 'log3' })).status, 401);
  assert.equal((await api('POST', '/api/auth/login', { body: { email: 'nessuno@x.it', password: 'qualsiasi1' }, ip: 'log4' })).status, 401);
  assert.equal((await api('POST', '/api/auth/login', { body: { email: 'log@x.it' }, ip: 'log5' })).status, 400);
});

// -------------------------------------------------- API inesistente
test('rotta API inesistente → 404', async () => {
  assert.equal((await api('GET', '/api/non-esiste')).status, 404);
});
