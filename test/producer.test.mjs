// Integration test — Portale self-service produttori (piano 13).
// Copre il ciclo completo: richiesta → approvazione staff → onboarding tassativo → invio → verifica → go-live,
// più i due invarianti critici: le bozze NON sono pubbliche e un utente tocca SOLO la propria scheda.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'gf-producer-'));
process.env.GF_DATA_DIR = TMP;
process.env.GF_ADMIN_PASSWORD = 'test-admin-pw';
process.env.GF_GOOGLE_CLIENT_ID = '';
// Nessuna env Cloudinary → media.js usa il fallback su disco (test ermetici, niente rete).
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
  assert.equal(r.status, 200, `register ${email} → ${r.status}`);
  return userCookie(r);
}
async function loginAdmin(ip) {
  const r = await api('POST', '/api/login', { body: { password: 'test-admin-pw' }, ip });
  assert.equal(r.status, 200); return staffCookie(r);
}
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

// ---------------------------------------------------------------- ciclo completo (happy path)
test('ciclo produttore: request → approve → onboarding → submit → verify → publish → live', async () => {
  const staff = await loginAdmin('pr-staff');
  const A = await signIn('conta@x.it', 'pr-a');

  // request senza login → 401
  assert.equal((await api('POST', '/api/producer/request')).status, 401);

  // A richiede di diventare produttore
  const reqd = await api('POST', '/api/producer/request', { cookie: A, body: { name: 'Cascina di Conta', place: 'Villetta Barrea' } });
  assert.equal(reqd.status, 200);
  assert.equal(reqd.json.status, 'requested');
  assert.equal(reqd.json.user.producerStatus, 'requested');

  // la candidatura è arrivata nella coda staff, legata all'account
  const cand = await api('GET', '/api/candidature', { cookie: staff });
  const mine = cand.json.candidature.find((c) => c.userId === 'conta@x.it');
  assert.ok(mine, 'candidatura legata a userId');

  // me: ha stato requested, nessuna scheda ancora
  const me0 = await api('GET', '/api/producer/me', { cookie: A });
  assert.equal(me0.json.status, 'requested');
  assert.equal(me0.json.producer, null);

  // prima dell'approvazione non può gestire nulla
  assert.equal((await api('PATCH', '/api/producer/me', { cookie: A, body: { name: 'X' } })).status, 403);

  // staff approva → crea la bozza legata all'owner
  const appr = await api('POST', '/api/producer/approve', { cookie: staff, body: { userId: 'conta@x.it' } });
  assert.equal(appr.status, 200);
  const producerId = appr.json.producer.id;
  assert.equal(appr.json.producer.ownerId, 'conta@x.it');
  assert.equal(appr.json.producer.status, 'draft');
  assert.equal(appr.json.user.producerStatus, 'approved');

  // la bozza NON è pubblica
  const pub0 = await api('GET', '/api/producers');
  assert.ok(!pub0.json.producers.some((p) => p.id === producerId), 'bozza non pubblica nella lista');
  assert.equal((await api('GET', `/api/producers/${producerId}`)).status, 404, 'bozza non pubblica nel dettaglio');

  // invio con onboarding vuoto → 400 con tutti i blocchi mancanti
  const early = await api('POST', '/api/producer/me/submit', { cookie: A, body: { acceptTerms: true } });
  assert.equal(early.status, 400);
  assert.deepEqual(early.json.missing.sort(), ['identity', 'phone', 'product', 'reach']);

  // A carica un media (fallback su disco) → URL
  const media = await api('POST', '/api/producer/me/media', { cookie: A, body: { dataUrl: PNG } });
  assert.equal(media.status, 200);
  assert.match(media.json.url, /^assets\/media\/producers\//);
  assert.equal(media.json.provider, 'disk');

  // A compila identità + contatti + come si raggiunge (→ passa a onboarding)
  const patched = await api('PATCH', '/api/producer/me', { cookie: A, body: {
    name: 'Cascina di Conta', story: 'Storia della cascina, tre generazioni.', photo: media.json.url,
    contact: { phone: '+39 333 1234567' }, address: 'Contrada Colli, Villetta Barrea (AQ)', hours: 'Aperto ora · chiude 19:00' } });
  assert.equal(patched.status, 200);
  const meOn = await api('GET', '/api/producer/me', { cookie: A });
  assert.equal(meOn.json.status, 'onboarding');

  // A aggiunge un prodotto completo
  const prod = await api('POST', '/api/producer/me/products', { cookie: A, body: {
    name: 'Uova fresche', category: 'uova', photos: [media.json.url], unit: 'dozzina', months: [1, 2, 3, 12], price: 4.5, description: 'galline all\'aperto' } });
  assert.equal(prod.status, 200);
  const pid = prod.json.product.id;
  assert.deepEqual(prod.json.product.months, [1, 2, 3, 12]);
  assert.equal(prod.json.product.price, 4.5); // prezzo preciso

  // submit senza consenso → manca 'consent'
  const noConsent = await api('POST', '/api/producer/me/submit', { cookie: A, body: {} });
  assert.equal(noConsent.status, 400);
  assert.ok(noConsent.json.missing.includes('consent'));

  // submit completo → in_review
  const sub = await api('POST', '/api/producer/me/submit', { cookie: A, body: { acceptTerms: true } });
  assert.equal(sub.status, 200);
  assert.equal(sub.json.producer.status, 'in_review');
  assert.equal(sub.json.producer.consent.acceptedInApp, true);
  assert.equal(sub.json.user.producerStatus, 'in_review');

  // ancora non pubblica
  assert.ok(!(await api('GET', '/api/producers')).json.producers.some((p) => p.id === producerId));

  // publish prima della verifica → 400
  assert.equal((await api('POST', '/api/producer/publish', { cookie: staff, body: { producerId } })).status, 400);

  // verifica in sede → publish → live
  assert.equal((await api('POST', '/api/producer/verify', { cookie: staff, body: { producerId } })).status, 200);
  const published = await api('POST', '/api/producer/publish', { cookie: staff, body: { producerId } });
  assert.equal(published.status, 200);
  assert.equal(published.json.producer.status, 'published');

  // ORA è pubblica
  assert.ok((await api('GET', '/api/producers')).json.producers.some((p) => p.id === producerId), 'scheda live nella lista pubblica');

  // disponibilità: toggle live anche a scheda pubblicata (§D8)
  const avail = await api('POST', `/api/producer/me/availability/${pid}`, { cookie: A, body: { availability: 'out' } });
  assert.equal(avail.status, 200);
  assert.equal(avail.json.product.availability, 'out');
});

// ---------------------------------------------------------------- ownership & autorizzazione
test('ownership: chi ha solo richiesto non gestisce; le mutazioni sono scoped alla propria scheda', async () => {
  const staff = await loginAdmin('pr-staff2');
  const B = await signIn('bruno@x.it', 'pr-b');
  const C = await signIn('carla@x.it', 'pr-c');

  // C richiede ma NON è approvato → non può gestire alcuna scheda
  await api('POST', '/api/producer/request', { cookie: C });
  assert.equal((await api('POST', '/api/producer/me/products', { cookie: C, body: { name: 'X' } })).status, 403);

  // B viene approvato → ottiene la SUA scheda
  await api('POST', '/api/producer/request', { cookie: B });
  const apprB = await api('POST', '/api/producer/approve', { cookie: staff, body: { userId: 'bruno@x.it' } });
  const pidB = apprB.json.producer.id;

  // B aggiunge un prodotto: finisce nella scheda di B, e C continua a non avere nulla
  await api('POST', '/api/producer/me/products', { cookie: B, body: { name: 'Miele', unit: 'vasetto', photos: ['assets/x.png'], months: [6, 7] } });
  const meB = await api('GET', '/api/producer/me', { cookie: B });
  assert.equal(meB.json.producer.id, pidB);
  assert.equal(meB.json.producer.products.length, 1);
  const meC = await api('GET', '/api/producer/me', { cookie: C });
  assert.equal(meC.json.producer, null, 'C non possiede schede');

  // un utente owner NON può alzarsi lo status via PATCH (whitelist): status/verify/ownerId ignorati
  await api('PATCH', '/api/producer/me', { cookie: B, body: { status: 'published', ownerId: 'carla@x.it', verify: { state: 'valid' } } });
  const meB2 = await api('GET', '/api/producer/me', { cookie: B });
  assert.notEqual(meB2.json.producer.status, 'published', 'status non modificabile dal produttore');
  assert.equal(meB2.json.producer.ownerId, 'bruno@x.it', 'ownerId non modificabile dal produttore');
});

// ---------------------------------------------------------------- media invalido
test('media: data-url invalido → 400', async () => {
  const staff = await loginAdmin('pr-staff3');
  const D = await signIn('dora@x.it', 'pr-d');
  await api('POST', '/api/producer/request', { cookie: D });
  await api('POST', '/api/producer/approve', { cookie: staff, body: { userId: 'dora@x.it' } });
  assert.equal((await api('POST', '/api/producer/me/media', { cookie: D, body: { dataUrl: 'non-un-media' } })).status, 400);
});
