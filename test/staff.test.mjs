// Integration test — rotte STAFF/admin (le mutazioni gated dietro login staff).
// Copre la parte di server.js finora non testata: CRUD producers, upload foto/video,
// revisione candidature, GET waitlist, rate-limit del login staff.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'gf-staff-'));
process.env.GF_DATA_DIR = TMP;
process.env.GF_ADMIN_PASSWORD = 'test-admin-pw';   // password staff via env (come in produzione)
const { requestHandler } = await import('../server.js');

let server, port;
before(async () => { server = http.createServer(requestHandler); await new Promise((r) => server.listen(0, r)); port = server.address().port; });
after(() => { try { server.close(); } catch {} try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {} });

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
const staffCookie = (res) => ((res.headers['set-cookie'] || []).map((s) => s.split(';')[0]).find((s) => s.startsWith('gf_sess=')) || '');
// 1×1 PNG e uno spezzone mp4 fittizio (il server valida solo il data-URL, non decodifica il media).
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const MP4 = 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAAAAA==';

async function loginAdmin(ip = 'staff-main') {
  const r = await api('POST', '/api/login', { body: { password: 'test-admin-pw' }, ip });
  assert.equal(r.status, 200);
  assert.equal(r.json.role, 'admin');
  return staffCookie(r);
}

// -------------------------------------------------- login staff
test('login staff: password errata → 401, /api/me riflette il ruolo dopo il login', async () => {
  assert.equal((await api('POST', '/api/login', { body: { password: 'sbagliata' }, ip: 's1' })).status, 401);
  const cookie = await loginAdmin('s2');
  const me = await api('GET', '/api/me', { cookie });
  assert.equal(me.json.role, 'admin');
});

test('login staff: oltre 5 tentativi/min dallo stesso IP → 429', async () => {
  const statuses = [];
  for (let i = 0; i < 6; i++) statuses.push((await api('POST', '/api/login', { body: { password: 'x' }, ip: 'staff-flood' })).status);
  assert.equal(statuses.at(-1), 429, `statuses=${statuses.join(',')}`);
});

// -------------------------------------------------- producers CRUD (staff)
test('producers: create → patch → foto → video → delete (tutto gated su staff)', async () => {
  const cookie = await loginAdmin('s3');

  // senza cookie le mutazioni sono vietate
  assert.equal((await api('POST', '/api/producers', { body: { name: 'X' } })).status, 403);

  // create
  const created = await api('POST', '/api/producers', { cookie, body: { name: 'Cascina di Prova', km: '4.2', categories: ['Latte', 1] } });
  assert.equal(created.status, 200);
  const id = created.json.id;
  assert.ok(id, 'id generato');
  assert.equal(created.json.km, 4.2);
  assert.deepEqual(created.json.categories, ['Latte', '1']);

  // patch parziale
  const patched = await api('PATCH', `/api/producers/${id}`, { cookie, body: { km: 9 } });
  assert.equal(patched.status, 200);
  assert.equal(patched.json.km, 9);
  assert.equal(patched.json.name, 'Cascina di Prova'); // resto invariato

  // upload foto → imposta p.photo
  const photo = await api('POST', `/api/producers/${id}/photo`, { cookie, body: { dataUrl: PNG } });
  assert.equal(photo.status, 200);
  assert.match(photo.json.photo, /^assets\/photos\/producers\//);

  // upload video → ritorna url + slot
  const video = await api('POST', `/api/producers/${id}/video`, { cookie, body: { dataUrl: MP4, type: 'storia' } });
  assert.equal(video.status, 200);
  assert.equal(video.json.type, 'storia');
  assert.match(video.json.url, /^assets\/videos\/producers\//);

  // foto con data-url non valido → 400
  assert.equal((await api('POST', `/api/producers/${id}/photo`, { cookie, body: { dataUrl: 'non-una-immagine' } })).status, 400);

  // delete + verifica 404
  assert.equal((await api('DELETE', `/api/producers/${id}`, { cookie })).status, 200);
  assert.equal((await api('GET', `/api/producers/${id}`)).status, 404);
});

// -------------------------------------------------- candidature (revisione staff)
test('candidature: invio pubblico → lista/dettaglio/patch stato/delete (staff)', async () => {
  const cookie = await loginAdmin('s4');
  const sent = await api('POST', '/api/candidature', { body: { name: 'Apicoltura Test', place: 'Scanno' }, ip: 'cand1' });
  assert.equal(sent.status, 200);
  const id = sent.json.id;

  assert.equal((await api('GET', '/api/candidature', { cookie })).status, 200);
  const detail = await api('GET', `/api/candidature/${id}`, { cookie });
  assert.equal(detail.status, 200);
  assert.equal(detail.json.name, 'Apicoltura Test');

  const upd = await api('PATCH', `/api/candidature/${id}`, { cookie, body: { state: 'visita' } });
  assert.equal(upd.json.state, 'visita');
  const bad = await api('PATCH', `/api/candidature/${id}`, { cookie, body: { state: 'stato-inventato' } });
  assert.equal(bad.json.state, 'visita'); // stato non valido → ignorato

  assert.equal((await api('DELETE', `/api/candidature/${id}`, { cookie })).status, 200);
  assert.equal((await api('GET', `/api/candidature/${id}`, { cookie })).status, 404);
});

// -------------------------------------------------- waitlist (GET staff)
test('waitlist: GET consentito allo staff', async () => {
  const cookie = await loginAdmin('s5');
  await api('POST', '/api/waitlist', { body: { email: 'lista@x.it', zona: 'Molise' }, ip: 'wl1' });
  const r = await api('GET', '/api/waitlist', { cookie });
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.json.leads));
  assert.ok(r.json.leads.some((l) => l.email === 'lista@x.it'));
});

// -------------------------------------------------- logout
test('logout staff: cancella il cookie di sessione (stateless)', async () => {
  const cookie = await loginAdmin('s6');
  const out = await api('POST', '/api/logout', { cookie });
  // Sessioni stateless (token firmati): il logout CANCELLA il cookie (Set-Cookie: gf_sess=; Max-Age=0),
  // così il browser non lo invia più. Non c'è invalidazione server-side del token (trade-off noto, ADR-01: scadenza breve).
  const sc = (out.headers['set-cookie'] || []).join(' ; ');
  assert.match(sc, /gf_sess=;/);
  assert.match(sc, /Max-Age=0/);
});
