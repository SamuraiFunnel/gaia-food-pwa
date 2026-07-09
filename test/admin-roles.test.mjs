// Integration test — Gestione utenti (livelli) + Inviti + Admin-come-account.
// L'admin-via-account Google non è testabile offline; qui si copre la LOGICA degli endpoint
// (raggiungibili anche con la sessione admin legacy, che è il fallback della porta unificata),
// più le guardie (owner-email non registrabile, endpoint solo-admin, invito legato all'email).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'gf-adminroles-'));
process.env.GF_DATA_DIR = TMP;
process.env.GF_ADMIN_PASSWORD = 'test-admin-pw';
process.env.GF_OWNER_EMAILS = 'owner@test.com';
process.env.GF_GOOGLE_CLIENT_ID = '';
delete process.env.CLOUDINARY_URL; delete process.env.CLOUDINARY_CLOUD_NAME;
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
const userCookie = (res) => ((res.headers['set-cookie'] || []).map((s) => s.split(';')[0]).find((s) => s.startsWith('gf_user=')) || '');
const staffCookie = (res) => ((res.headers['set-cookie'] || []).map((s) => s.split(';')[0]).find((s) => s.startsWith('gf_sess=')) || '');
async function signIn(email, ip) {
  const r = await api('POST', '/api/auth/register', { body: { email, password: 'testPassword1' }, ip });
  assert.equal(r.status, 200, `register ${email} → ${r.status} ${JSON.stringify(r.json)}`);
  return userCookie(r);
}
async function adminCookie(ip) {
  const r = await api('POST', '/api/login', { body: { password: 'test-admin-pw' }, ip });
  assert.equal(r.status, 200); return staffCookie(r);
}
const levelOf = (users, email) => (users.find(u => u.id === email) || {}).level;

test("owner email non registrabile con password (deve usare Google) → 403", async () => {
  const r = await api('POST', '/api/auth/register', { body: { email: 'owner@test.com', password: 'testPassword1' }, ip: '10.0.0.1' });
  assert.equal(r.status, 403);
});

test("endpoint Gestione sono solo-admin", async () => {
  const u = await signIn('nobody@test.com', '10.0.0.2');
  const asUser = await api('GET', '/api/admin/users', { cookie: u, ip: '10.0.0.2' });
  assert.equal(asUser.status, 403, 'un utente normale non entra in Gestione');
  const anon = await api('GET', '/api/admin/users', { ip: '10.0.0.2' });
  assert.equal(anon.status, 403);
  const admin = await adminCookie('10.0.0.2');
  const ok = await api('GET', '/api/admin/users', { cookie: admin, ip: '10.0.0.2' });
  assert.equal(ok.status, 200);
  assert.ok(Array.isArray(ok.json.users), 'ritorna la lista utenti');
});

test("cambio livello: cliente → produttore → cliente", async () => {
  const admin = await adminCookie('10.0.0.3');
  await signIn('p1@test.com', '10.0.0.3');
  // di default è cliente
  let list = (await api('GET', '/api/admin/users', { cookie: admin })).json.users;
  assert.equal(levelOf(list, 'p1@test.com'), 'cliente');
  // promuovi a produttore → crea la scheda-bozza
  const up = await api('POST', '/api/admin/users/level', { cookie: admin, body: { userId: 'p1@test.com', level: 'produttore' } });
  assert.equal(up.status, 200);
  assert.ok(up.json.producer && up.json.producer.id, 'ha creato la scheda produttore');
  list = (await api('GET', '/api/admin/users', { cookie: admin })).json.users;
  assert.equal(levelOf(list, 'p1@test.com'), 'produttore');
  // declassa a cliente (non distruttivo)
  const down = await api('POST', '/api/admin/users/level', { cookie: admin, body: { userId: 'p1@test.com', level: 'cliente' } });
  assert.equal(down.status, 200);
  list = (await api('GET', '/api/admin/users', { cookie: admin })).json.users;
  assert.equal(levelOf(list, 'p1@test.com'), 'cliente');
});

test("cambio livello: verificatore e admin", async () => {
  const admin = await adminCookie('10.0.0.4');
  await signIn('v1@test.com', '10.0.0.4');
  await api('POST', '/api/admin/users/level', { cookie: admin, body: { userId: 'v1@test.com', level: 'verificatore' } });
  let list = (await api('GET', '/api/admin/users', { cookie: admin })).json.users;
  assert.equal(levelOf(list, 'v1@test.com'), 'verificatore');
  await api('POST', '/api/admin/users/level', { cookie: admin, body: { userId: 'v1@test.com', level: 'admin' } });
  list = (await api('GET', '/api/admin/users', { cookie: admin })).json.users;
  assert.equal(levelOf(list, 'v1@test.com'), 'admin');
});

test("livello non valido → 400", async () => {
  const admin = await adminCookie('10.0.0.5');
  await signIn('x1@test.com', '10.0.0.5');
  const r = await api('POST', '/api/admin/users/level', { cookie: admin, body: { userId: 'x1@test.com', level: 'superuser' } });
  assert.equal(r.status, 400);
});

test("invito: crea → info pubblica → accetta con la mail giusta → livello applicato", async () => {
  const admin = await adminCookie('10.0.0.6');
  const created = await api('POST', '/api/admin/invites', { cookie: admin, body: { email: 'inv@test.com', level: 'produttore' } });
  assert.equal(created.status, 200);
  const token = created.json.token;
  assert.ok(token, 'ritorna un token');
  // info pubblica (nessun cookie)
  const info = await api('GET', '/api/invite/' + token, {});
  assert.equal(info.status, 200);
  assert.equal(info.json.valid, true);
  assert.equal(info.json.level, 'produttore');
  assert.equal(info.json.email, 'inv@test.com');
  // l'invitato crea l'account con QUELLA mail e accetta
  const cookie = await signIn('inv@test.com', '10.0.0.6');
  const accept = await api('POST', '/api/invite/' + token + '/accept', { cookie });
  assert.equal(accept.status, 200);
  assert.equal(accept.json.level, 'produttore');
  assert.ok(accept.json.producer, 'ha creato la scheda produttore');
  // ora è produttore
  const list = (await api('GET', '/api/admin/users', { cookie: admin })).json.users;
  assert.equal(levelOf(list, 'inv@test.com'), 'produttore');
  // secondo uso → 409
  const again = await api('POST', '/api/invite/' + token + '/accept', { cookie });
  assert.equal(again.status, 409);
});

test("invito legato all'email: chi ha un'altra mail non lo può usare → 403", async () => {
  const admin = await adminCookie('10.0.0.7');
  const created = await api('POST', '/api/admin/invites', { cookie: admin, body: { email: 'target@test.com', level: 'produttore' } });
  const token = created.json.token;
  const otherCookie = await signIn('intruso@test.com', '10.0.0.7');
  const r = await api('POST', '/api/invite/' + token + '/accept', { cookie: otherCookie });
  assert.equal(r.status, 403);
});
