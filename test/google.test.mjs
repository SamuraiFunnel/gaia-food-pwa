// Integration test — login Google (percorso di successo + fallimenti) con `fetch` MOCKATO.
// Nessuna chiamata di rete reale: sostituiamo globalThis.fetch così da simulare la risposta
// dell'endpoint tokeninfo di Google. GF_GOOGLE_CLIENT_ID è impostato → si supera il ramo 503.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'gf-google-'));
const CID = 'test-client.apps.googleusercontent.com';
process.env.GF_DATA_DIR = TMP;
process.env.GF_GOOGLE_CLIENT_ID = CID;
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

// Installa un fetch fittizio per la durata di fn(), poi ripristina l'originale.
async function withFetch(fake, fn) {
  const orig = globalThis.fetch;
  globalThis.fetch = fake;
  try { return await fn(); } finally { globalThis.fetch = orig; }
}
// tokeninfo "ok" con i campi passati.
const okTokenInfo = (info) => async () => ({ ok: true, json: async () => info });

test('idToken mancante → 400 (non chiama nemmeno Google)', async () => {
  const r = await withFetch(() => { throw new Error('fetch non dovrebbe essere chiamato'); },
    () => api('POST', '/api/auth/google', { body: {}, ip: 'g0' }));
  assert.equal(r.status, 400);
});

test('token valido → 200, utente creato/normalizzato, cookie di sessione, /me lo riconosce', async () => {
  const cookie = await withFetch(okTokenInfo({ aud: CID, email_verified: 'true', email: 'Nuovo@X.it', name: 'Nuovo Utente', picture: 'http://x/p.jpg' }),
    async () => {
      const r = await api('POST', '/api/auth/google', { body: { idToken: 'valid' }, ip: 'g1' });
      assert.equal(r.status, 200);
      assert.equal(r.json.user.email, 'nuovo@x.it'); // lowercase
      assert.equal(r.json.user.name, 'Nuovo Utente');
      assert.equal(r.json.user.provider, 'google');
      return userCookie(r);
    });
  const me = await api('GET', '/api/auth/me', { cookie });
  assert.equal(me.json.user.email, 'nuovo@x.it');
});

test('aud diverso dal client id → 401', async () => {
  const r = await withFetch(okTokenInfo({ aud: 'altro-client', email_verified: 'true', email: 'a@x.it' }),
    () => api('POST', '/api/auth/google', { body: { idToken: 'x' }, ip: 'g2' }));
  assert.equal(r.status, 401);
});

test('email non verificata → 401', async () => {
  const r = await withFetch(okTokenInfo({ aud: CID, email_verified: 'false', email: 'a@x.it' }),
    () => api('POST', '/api/auth/google', { body: { idToken: 'x' }, ip: 'g3' }));
  assert.equal(r.status, 401);
});

test('tokeninfo risponde non-ok → 401', async () => {
  const r = await withFetch(async () => ({ ok: false, json: async () => ({ error: 'invalid_token' }) }),
    () => api('POST', '/api/auth/google', { body: { idToken: 'x' }, ip: 'g4' }));
  assert.equal(r.status, 401);
});

test('fetch che lancia (rete giù) → 502', async () => {
  const r = await withFetch(async () => { throw new Error('network down'); },
    () => api('POST', '/api/auth/google', { body: { idToken: 'x' }, ip: 'g5' }));
  assert.equal(r.status, 502);
});
