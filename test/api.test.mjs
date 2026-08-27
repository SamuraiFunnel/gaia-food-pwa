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
process.env.GF_ADMIN_PASSWORD = 'social-admin-test';
process.env.GF_SOCIAL_DISK_CAP_BYTES = String(64 * 1024);
delete process.env.CLOUDINARY_URL;
delete process.env.CLOUDINARY_CLOUD_NAME;
delete process.env.CLOUDINARY_API_KEY;
delete process.env.CLOUDINARY_API_SECRET;
const { requestHandler, acquireSocialUploadSlot } = await import('../server.js');
const dbImport = await import('../db.js');
const TEST_DB = dbImport.default || dbImport;

let server, port;
before(async () => {
  server = http.createServer(requestHandler);
  await new Promise((r) => server.listen(0, r));
  port = server.address().port;
});
after(() => { try { server.close(); } catch {} try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {} });

// Client HTTP minimale. opts: { body, rawBody, cookie, ip, headers }.
function api(method, p, { body, rawBody, cookie, ip, headers: extraHeaders } = {}) {
  return new Promise((resolve, reject) => {
    const data = rawBody != null ? rawBody : (body != null ? JSON.stringify(body) : null);
    const headers = { 'Content-Type': 'application/json', ...(extraHeaders || {}) };
    if (cookie) headers['Cookie'] = cookie;
    if (ip) headers['x-forwarded-for'] = ip;
    if (data && !Object.keys(headers).some((key) => key.toLowerCase() === 'content-length')) headers['Content-Length'] = Buffer.byteLength(data);
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers }, (res) => {
      const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => {
        const raw = Buffer.concat(chunks), text = raw.toString('utf8');
        let json = null; try { json = text ? JSON.parse(text) : null; } catch {}
        resolve({ status: res.statusCode, json, headers: res.headers, raw, text });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}
// Estrae il cookie di sessione utente da una risposta di login.
const userCookie = (res) => ((res.headers['set-cookie'] || []).map((s) => s.split(';')[0]).find((s) => s.startsWith('gf_user=')) || '');
const staffCookie = (res) => ((res.headers['set-cookie'] || []).map((s) => s.split(';')[0]).find((s) => s.startsWith('gf_sess=')) || '');
// Crea un account (email+password) e ritorna il cookie di sessione.
async function signIn(email, ip, seme) {
  const body = { email, password: 'testPassword1' }; if (seme) body.seme = seme;
  const r = await api('POST', '/api/auth/register', { body, ip });
  assert.equal(r.status, 200, `register ${email} → ${r.status}`);
  return userCookie(r);
}
const SOCIAL_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const SOCIAL_MP4 = 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAAAAA==';

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

// -------------------------------------------------- social territoriale
test('social feed: gated, scope invalido normalizzato, seed solo editoriale', async () => {
  assert.equal((await api('GET', '/api/social/feed?scope=for-you')).status, 401);
  const cookie = await signIn('social-gated@example.test', 'soc-gated-auth');
  const feed = await api('GET', '/api/social/feed?scope=non-valido', { cookie });
  assert.equal(feed.status, 200);
  assert.deepEqual(feed.json.context, { scope: 'for-you', city: '', zone: { id: '', label: '' }, region: '' });
  assert.deepEqual(feed.json.pagination, { limit: 20, offset: 0 });
  assert.equal(feed.json.hasMore, false);
  assert.equal(feed.json.nextOffset, null);
  assert.ok(Array.isArray(feed.json.posts));
  assert.ok(feed.json.posts.length <= 2);
  for (const post of feed.json.posts) {
    assert.equal(post.author.type, 'system');
    assert.equal(post.author.name, 'Gaia Food');
    assert.equal(post.isExample, true);
  }
  assert.equal((await api('POST', '/api/social/posts', { body: { text: 'no login' } })).status, 401);
  assert.equal((await api('POST', '/api/social/posts/qualunque/like')).status, 401);
  assert.equal((await api('POST', '/api/social/posts/qualunque/comments', { body: { text: 'x' } })).status, 401);
});

test('social: crea, proietta senza PII, like/save toggle, commenta, filtra nearby ed elimina solo owner', async () => {
  const terniCookie = await signIn('social-terni@example.test', 'soc-auth-1');
  const romaCookie = await signIn('social-roma@example.test', 'soc-auth-2');
  await api('PATCH', '/api/auth/profile', {
    cookie: terniCookie,
    body: { name: 'Teresa', city: 'Terni', zone: { id: 'tr', label: 'Conca ternana', region: 'Umbria', comuni: ['Terni'] } },
  });
  await api('PATCH', '/api/auth/profile', {
    cookie: romaCookie,
    body: { name: 'Romolo', city: 'Roma', zone: { id: 'rm', label: 'Area romana', region: 'Lazio', comuni: ['Roma'] } },
  });

  const created = await api('POST', '/api/social/posts', {
    cookie: terniCookie, ip: 'soc-create-1', body: { kind: 'domanda', text: '  Dove trovo pomodori buoni?\u0000 ' + '🍅'.repeat(710), mediaUrl: 'https://non-accettato.test/x.jpg' },
  });
  assert.equal(created.status, 201);
  const post = created.json.post, id = post.id;
  assert.equal(post.kind, 'question');
  assert.equal(Array.from(post.text).length, 700);
  assert.equal(post.mediaUrl, '');
  assert.match(post.author.id, /^gf_[A-Za-z0-9_-]{22}$/);
  assert.equal(post.author.name, 'Teresa');
  assert.equal(post.author.type, 'person');
  assert.equal(post.author.verified, false);
  assert.deepEqual(post.location, { city: 'Terni', zoneId: 'tr', zoneLabel: 'Conca ternana', region: 'Umbria' });
  assert.equal(post.locality, 'city');
  assert.ok(!JSON.stringify(post).includes('social-terni@example.test'));

  const romaFeed = await api('GET', '/api/social/feed?scope=for-you', { cookie: romaCookie });
  const seen = romaFeed.json.posts.find((item) => item.id === id);
  assert.equal(seen.locality, 'other');
  assert.equal((await api('GET', '/api/social/feed?scope=nearby', { cookie: romaCookie })).json.posts.some((item) => item.id === id), false);
  const firstPage = await api('GET', '/api/social/feed?scope=for-you&limit=1&offset=0', { cookie: romaCookie });
  assert.equal(firstPage.json.posts.length, 1);
  assert.deepEqual(firstPage.json.pagination, { limit: 1, offset: 0 });
  assert.equal(firstPage.json.hasMore, true);
  assert.equal(firstPage.json.nextOffset, 1);
  const secondPage = await api('GET', `/api/social/feed?scope=for-you&limit=999&offset=${firstPage.json.nextOffset}`, { cookie: romaCookie });
  assert.deepEqual(secondPage.json.pagination, { limit: 50, offset: 1 });
  assert.ok(secondPage.json.posts.length <= 50);

  const like1 = await api('POST', `/api/social/posts/${id}/like`, { cookie: romaCookie, ip: 'soc-react-1' });
  assert.equal(like1.status, 200);
  assert.deepEqual(like1.json.post.viewer, {
    liked: true, saved: false, shared: false, followingAuthor: false, ownAuthor: false, reported: false,
  });
  assert.equal(like1.json.post.counts.likes, 1);
  const like2 = await api('POST', `/api/social/posts/${id}/like`, { cookie: romaCookie, ip: 'soc-react-1' });
  assert.equal(like2.json.post.viewer.liked, false);
  assert.equal(like2.json.post.counts.likes, 0);
  const saved = await api('POST', `/api/social/posts/${id}/save`, { cookie: romaCookie, ip: 'soc-react-1' });
  assert.equal(saved.json.post.viewer.saved, true);
  assert.equal(saved.json.post.counts.saves, 1);

  const commented = await api('POST', `/api/social/posts/${id}/comments`, {
    cookie: romaCookie, ip: 'soc-comment-1', body: { text: 'Utile! ' + 'a'.repeat(300) },
  });
  assert.equal(commented.status, 201);
  assert.equal(Array.from(commented.json.comment.text).length, 280);
  assert.equal(commented.json.comment.author.name, 'Romolo');
  assert.match(commented.json.comment.author.id, /^gf_[A-Za-z0-9_-]{22}$/);
  assert.equal(commented.json.post.counts.comments, 1);
  assert.ok(!JSON.stringify(commented.json).includes('social-roma@example.test'));

  // Due body arrivano in parallelo: dopo la validazione ciascun handler rilegge lo stato più recente,
  // quindi nella singola istanza nessun commento viene perso.
  const concurrent = await Promise.all([
    api('POST', `/api/social/posts/${id}/comments`, { cookie: romaCookie, ip: 'soc-comment-race', body: { text: 'Commento concorrente A' } }),
    api('POST', `/api/social/posts/${id}/comments`, { cookie: romaCookie, ip: 'soc-comment-race', body: { text: 'Commento concorrente B' } }),
  ]);
  assert.deepEqual(concurrent.map((r) => r.status), [201, 201]);
  const afterConcurrent = await api('GET', '/api/social/feed?scope=for-you', { cookie: terniCookie });
  const withComments = afterConcurrent.json.posts.find((item) => item.id === id);
  assert.equal(withComments.counts.comments, 3);
  assert.ok(withComments.comments.some((item) => item.text === 'Commento concorrente A'));
  assert.ok(withComments.comments.some((item) => item.text === 'Commento concorrente B'));

  assert.equal((await api('DELETE', `/api/social/posts/${id}`, { cookie: romaCookie, ip: 'soc-delete-other' })).status, 403);
  assert.equal((await api('DELETE', `/api/social/posts/${id}`, { cookie: terniCookie, ip: 'soc-delete-owner' })).status, 200);
  assert.equal((await api('GET', '/api/social/feed', { cookie: terniCookie })).json.posts.some((item) => item.id === id), false);
});

test('social: solo account con scheda pubblicata posta come produttore; scope producers e delete admin', async () => {
  const producerEmail = 'social-producer@example.test';
  const producerCookie = await signIn(producerEmail, 'soc-prod-auth');
  await api('PATCH', '/api/auth/profile', {
    cookie: producerCookie,
    body: { name: 'Nome persona', city: 'Narni', zone: { id: 'tr', label: 'Conca ternana', region: 'Umbria' } },
  });
  const login = await api('POST', '/api/login', { body: { password: 'social-admin-test', name: 'Moderatore test' }, ip: 'soc-staff-login' });
  assert.equal(login.status, 200);
  const adminCookie = staffCookie(login);
  const promoted = await api('POST', '/api/admin/users/level', {
    cookie: adminCookie, body: { userId: producerEmail, level: 'produttore' },
  });
  assert.equal(promoted.status, 200);
  const producerId = promoted.json.producer.id;
  const beforePublish = await api('POST', '/api/social/posts', {
    cookie: producerCookie, ip: 'soc-prod-before-publish', body: { kind: 'storia', text: 'Scheda ancora in bozza.' },
  });
  assert.equal(beforePublish.status, 201);
  assert.equal(beforePublish.json.post.author.type, 'person');
  assert.equal(beforePublish.json.post.author.producerId, undefined);

  // Simula scheda legacy già verificata ma senza anchor: publish deve obbligare una nuova verify.
  assert.equal((await api('PATCH', `/api/producers/${producerId}`, {
    cookie: adminCookie, body: { verifiedAt: '2026-01-01T00:00:00.000Z', status: 'in_review' },
  })).status, 200);
  const legacyPublish = await api('POST', '/api/producer/publish', { cookie: adminCookie, body: { producerId } });
  assert.equal(legacyPublish.status, 400);
  assert.match(legacyPublish.json.error, /località social non verificata/);

  const verified = await api('POST', '/api/producer/verify', { cookie: adminCookie, body: { producerId } });
  assert.equal(verified.status, 200);
  const verifiedAnchor = { city: 'Narni', zoneId: 'tr', zoneLabel: 'Conca ternana', region: 'Umbria' };
  assert.deepEqual(verified.json.producer.socialLocation, verifiedAnchor);

  // Cambio zona TRA verify e publish: publish non deve ricalcolare l'attestato.
  await api('PATCH', '/api/auth/profile', {
    cookie: producerCookie,
    body: { city: 'Roma', zone: { id: 'rm', label: 'Area romana', region: 'Lazio' } },
  });
  const published = await api('POST', '/api/producer/publish', { cookie: adminCookie, body: { producerId } });
  assert.equal(published.status, 200);
  assert.deepEqual(published.json.producer.socialLocation, verifiedAnchor);

  const created = await api('POST', '/api/social/posts', {
    cookie: producerCookie, ip: 'soc-prod-create', body: { kind: 'dal-campo', text: 'Oggi raccolta di stagione.' },
  });
  assert.equal(created.status, 201);
  assert.equal(created.json.post.author.type, 'producer');
  assert.equal(created.json.post.author.producerId, producerId);
  assert.equal(created.json.post.author.verified, true);
  assert.equal(created.json.post.kind, 'field');
  assert.deepEqual(created.json.post.location, { city: 'Narni', zoneId: 'tr', zoneLabel: 'Conca ternana', region: 'Umbria' });
  assert.ok(!JSON.stringify(created.json).includes(producerEmail));

  const producerFeed = await api('GET', '/api/social/feed?scope=producers', { cookie: producerCookie });
  assert.ok(producerFeed.json.posts.some((post) => post.id === created.json.post.id));
  assert.ok(producerFeed.json.posts.every((post) => post.author.type === 'producer'));

  // Sospensione live: lo storico resta, ma perde badge e sparisce immediatamente dal filtro produttori.
  assert.equal((await api('POST', '/api/producer/suspend', { cookie: adminCookie, body: { producerId } })).status, 200);
  const afterSuspendProducers = await api('GET', '/api/social/feed?scope=producers', { cookie: producerCookie });
  assert.equal(afterSuspendProducers.json.posts.some((post) => post.id === created.json.post.id), false);
  const afterSuspendAll = await api('GET', '/api/social/feed?scope=for-you', { cookie: producerCookie });
  const demoted = afterSuspendAll.json.posts.find((post) => post.id === created.json.post.id);
  assert.equal(demoted.author.type, 'person');
  assert.equal(demoted.author.verified, false);
  assert.equal(demoted.author.producerId, undefined);
  assert.equal(demoted.author.name, 'Nome persona');
  const toggledAfterSuspend = await api('POST', `/api/social/posts/${created.json.post.id}/save`, { cookie: producerCookie, ip: 'soc-prod-demoted-save' });
  assert.equal(toggledAfterSuspend.json.post.author.type, 'person');
  assert.equal(toggledAfterSuspend.json.post.author.verified, false);
  assert.equal((await api('DELETE', `/api/social/posts/${created.json.post.id}`, { cookie: adminCookie, ip: 'soc-admin-delete' })).status, 200);
  assert.equal((await api('DELETE', `/api/social/posts/${beforePublish.json.post.id}`, { cookie: adminCookie, ip: 'soc-admin-delete' })).status, 200);
});

test('social: rate limit creazione post per account+IP', async () => {
  const cookie = await signIn('social-rate@example.test', 'soc-rate-auth');
  const statuses = [];
  for (let i = 0; i < 9; i++) {
    const r = await api('POST', '/api/social/posts', { cookie, ip: 'soc-rate-posts', body: { text: `Post ${i}`, kind: 'story' } });
    statuses.push(r.status);
  }
  assert.deepEqual(statuses.slice(0, 8), Array(8).fill(201));
  assert.equal(statuses[8], 429);
});

test('social v2 media: MIME reale, 413, mediaRef account-bound, 4 formati e Range video 206', async () => {
  const cookie = await signIn('social-media-owner@example.test', 'soc-media-auth');
  const otherCookie = await signIn('social-media-other@example.test', 'soc-media-auth-other');
  assert.equal((await api('POST', '/api/social/media', { body: { dataUrl: SOCIAL_PNG }, ip: 'soc-media-noauth' })).status, 401);
  assert.equal((await api('POST', '/api/social/media', {
    cookie, ip: 'soc-media-fake', body: { dataUrl: 'data:image/png;base64,ZmFrZQ==' },
  })).status, 400);
  const tooLarge = await api('POST', '/api/social/media', {
    cookie, ip: 'soc-media-oversize', rawBody: JSON.stringify({ dataUrl: 'a'.repeat(26 * 1024 * 1024) }),
  });
  assert.equal(tooLarge.status, 413);

  const image = await api('POST', '/api/social/media', { cookie, ip: 'soc-media-image', body: { dataUrl: SOCIAL_PNG } });
  const video = await api('POST', '/api/social/media', { cookie, ip: 'soc-media-video', body: { dataUrl: SOCIAL_MP4 } });
  assert.equal(image.status, 201); assert.equal(image.json.type, 'image'); assert.equal(image.json.expiresIn, 3600);
  assert.equal(video.status, 201); assert.equal(video.json.type, 'video');
  assert.ok(!image.json.mediaRef.includes('social-media-owner@example.test'));

  const wrongOwner = await api('POST', '/api/social/posts', {
    cookie: otherCookie, ip: 'soc-media-wrong-owner', body: { text: 'Non mio', mediaRefs: [image.json.mediaRef] },
  });
  assert.equal(wrongOwner.status, 400);
  const arbitrary = await api('POST', '/api/social/posts', {
    cookie, ip: 'soc-media-arbitrary', body: { mediaUrl: 'https://example.test/arbitrario.jpg' },
  });
  assert.equal(arbitrary.status, 400);

  const text = await api('POST', '/api/social/posts', { cookie, ip: 'soc-media-post-text', body: { text: 'Solo testo' } });
  const picture = await api('POST', '/api/social/posts', { cookie, ip: 'soc-media-post-image', body: { mediaRefs: [image.json.mediaRef] } });
  const clip = await api('POST', '/api/social/posts', { cookie, ip: 'soc-media-post-video', body: { text: 'Clip', mediaRefs: [video.json.mediaRef] } });
  const carousel = await api('POST', '/api/social/posts', { cookie, ip: 'soc-media-post-carousel', body: { mediaRefs: [image.json.mediaRef, video.json.mediaRef] } });
  assert.equal(text.json.post.format, 'text');
  assert.equal(picture.json.post.format, 'image');
  assert.equal(clip.json.post.format, 'video');
  assert.equal(carousel.json.post.format, 'carousel');
  assert.deepEqual(carousel.json.post.media.map((item) => item.type), ['image', 'video']);
  assert.equal((await api('POST', '/api/social/posts', {
    cookie, ip: 'soc-media-post-eleven', body: { mediaRefs: Array(11).fill(image.json.mediaRef) },
  })).status, 400);

  const ranged = await api('GET', `/${video.json.url}`, { headers: { Range: 'bytes=4-7' } });
  assert.equal(ranged.status, 206);
  assert.equal(ranged.raw.toString('ascii'), 'ftyp');
  assert.match(ranged.headers['content-range'], /^bytes 4-7\/\d+$/);
  assert.equal(ranged.headers['accept-ranges'], 'bytes');

  const socialDir = path.join(TMP, 'assets', 'media', 'social'), reserve = path.join(socialDir, 'quota-reserve.bin');
  fs.writeFileSync(reserve, Buffer.alloc(64 * 1024));
  try {
    const full = await api('POST', '/api/social/media', { cookie, ip: 'soc-media-quota', body: { dataUrl: SOCIAL_PNG } });
    assert.equal(full.status, 507);
    assert.equal(full.json.error, 'spazio_media_esaurito');
  } finally { fs.unlinkSync(reserve); }
});

test('social upload semaphore: 429 per stesso account e terzo upload globale', async () => {
  const emailA = 'social-slot-a@example.test', emailB = 'social-slot-b@example.test', emailC = 'social-slot-c@example.test';
  const a = await signIn(emailA, 'soc-slot-auth-a');
  await signIn(emailB, 'soc-slot-auth-b');
  const c = await signIn(emailC, 'soc-slot-auth-c');
  const releaseA = acquireSocialUploadSlot(emailA);
  assert.equal(typeof releaseA, 'function');
  try {
    const duplicate = await api('POST', '/api/social/media', { cookie: a, ip: 'soc-slot-duplicate', body: { dataUrl: SOCIAL_PNG } });
    assert.equal(duplicate.status, 429); assert.equal(duplicate.headers['retry-after'], '2');
    const releaseB = acquireSocialUploadSlot(emailB);
    assert.equal(typeof releaseB, 'function');
    try {
      const global = await api('POST', '/api/social/media', { cookie: c, ip: 'soc-slot-global', body: { dataUrl: SOCIAL_PNG } });
      assert.equal(global.status, 429); assert.equal(global.json.retryAfter, 2);
    } finally { releaseB(); }
  } finally { releaseA(); }
  assert.equal((await api('POST', '/api/social/media', { cookie: c, ip: 'soc-slot-released', body: { dataUrl: SOCIAL_PNG } })).status, 201);
});

test('social v2: follow privacy-safe, Seguiti e Vicino con esclusione self/seguiti', async () => {
  const alice = await signIn('social-follow-alice@example.test', 'soc-follow-auth-a');
  const bob = await signIn('social-follow-bob@example.test', 'soc-follow-auth-b');
  const dario = await signIn('social-follow-dario@example.test', 'soc-follow-auth-d');
  const carla = await signIn('social-follow-carla@example.test', 'soc-follow-auth-c');
  const setZone = (cookie, name, city, id, region) => api('PATCH', '/api/auth/profile', {
    cookie, body: { name, city, zone: { id, label: id, region } },
  });
  await setZone(alice, 'Alice', 'Terni', 'tr', 'Umbria');
  await setZone(bob, 'Bob', 'Terni', 'tr', 'Umbria');
  await setZone(dario, 'Dario', 'Narni', 'tr', 'Umbria');
  await setZone(carla, 'Carla', 'Roma', 'rm', 'Lazio');
  const alicePost = await api('POST', '/api/social/posts', { cookie: alice, ip: 'soc-follow-post-a', body: { text: 'Post Alice' } });
  const bobPost = await api('POST', '/api/social/posts', { cookie: bob, ip: 'soc-follow-post-b', body: { text: 'Post Bob' } });
  const darioPost = await api('POST', '/api/social/posts', { cookie: dario, ip: 'soc-follow-post-d', body: { text: 'Post Dario' } });
  await api('POST', '/api/social/posts', { cookie: carla, ip: 'soc-follow-post-c', body: { text: 'Post Carla' } });
  const bobId = bobPost.json.post.author.id, aliceId = alicePost.json.post.author.id;

  const suggestions = await api('GET', '/api/social/suggestions?limit=20', { cookie: alice });
  assert.ok(suggestions.json.suggestions.some((item) => item.author.id === bobId));
  assert.equal(suggestions.json.suggestions.some((item) => item.author.name === 'Carla'), false);
  assert.ok(!JSON.stringify(suggestions.json).includes('@example.test'));
  assert.equal((await api('PUT', `/api/social/authors/${aliceId}/follow`, { cookie: alice, ip: 'soc-follow-self' })).status, 400);
  assert.equal((await api('PUT', `/api/social/authors/${bobId}/follow`, { cookie: alice, ip: 'soc-follow-put' })).json.following, true);
  assert.equal((await api('PUT', `/api/social/authors/${bobId}/follow`, { cookie: alice, ip: 'soc-follow-put' })).status, 200);

  const following = await api('GET', '/api/social/feed?scope=following', { cookie: alice });
  assert.ok(following.json.posts.some((post) => post.id === bobPost.json.post.id));
  assert.ok(following.json.posts.every((post) => post.author.id === bobId));
  assert.equal(following.json.posts[0].viewer.followingAuthor, true);
  const nearby = await api('GET', '/api/social/feed?scope=nearby', { cookie: alice });
  assert.equal(nearby.json.posts.some((post) => post.id === alicePost.json.post.id), false);
  assert.equal(nearby.json.posts.some((post) => post.id === bobPost.json.post.id), false);
  assert.equal(nearby.json.posts.some((post) => post.id === darioPost.json.post.id), true);
  assert.equal((await api('DELETE', `/api/social/authors/${bobId}/follow`, { cookie: alice, ip: 'soc-follow-del' })).json.following, false);
  assert.equal((await api('DELETE', `/api/social/authors/${bobId}/follow`, { cookie: alice, ip: 'soc-follow-del' })).status, 200);
});

test('ricerca social: gated, query 2..80, limit bounded e contratto stabile', async () => {
  assert.equal((await api('GET', '/api/social/search?q=orto')).status, 401);
  const cookie = await signIn('social-search-validation@example.test', 'soc-search-validation-auth');
  assert.equal((await api('GET', '/api/social/search?q=', { cookie, ip: 'soc-search-validation' })).status, 400);
  const tooShort = await api('GET', '/api/social/search?q=a', { cookie, ip: 'soc-search-validation' });
  assert.equal(tooShort.status, 400); assert.equal(tooShort.json.minChars, 2);
  assert.equal((await api('GET', '/api/social/search?q=' + 'x'.repeat(81), { cookie, ip: 'soc-search-validation' })).status, 400);
  const empty = await api('GET', '/api/social/search?q=nessunrisultatounico&limit=999', { cookie, ip: 'soc-search-validation' });
  assert.equal(empty.status, 200);
  assert.deepEqual(Object.keys(empty.json).sort(), ['authors', 'hasMore', 'minChars', 'posts', 'producers', 'query'].sort());
  assert.deepEqual(empty.json.authors, []); assert.deepEqual(empty.json.producers, []); assert.deepEqual(empty.json.posts, []);
  assert.equal(empty.json.minChars, 2); assert.match(empty.headers['cache-control'], /no-store/);
});

test('ricerca social: accenti, territorio/follow, produttori pubblicati e privacy/report', async () => {
  const observerEmail = 'social-search-observer@example.test';
  const authorEmail = 'social-search-author@example.test';
  const observer = await signIn(observerEmail, 'soc-search-observer-auth');
  const author = await signIn(authorEmail, 'soc-search-author-auth');
  await api('PATCH', '/api/auth/profile', { cookie: observer, body: { name: 'Osservatore', city: 'Terni', zone: { id: 'tr', label: 'Conca', region: 'Umbria' } } });
  await api('PATCH', '/api/auth/profile', { cookie: author, body: { name: 'José Zaffiro', city: 'Terni', zone: { id: 'tr', label: 'Conca', region: 'Umbria' } } });
  const post = await api('POST', '/api/social/posts', {
    cookie: author, ip: 'soc-search-post', body: { text: 'Raccolto VietatoUnico di zafferano', kind: 'field' },
  });
  const authorId = post.json.post.author.id;
  await api('PUT', `/api/social/authors/${authorId}/follow`, { cookie: observer, ip: 'soc-search-follow' });
  const personSearch = await api('GET', '/api/social/search?q=jose&limit=10', { cookie: observer, ip: 'soc-search-person' });
  assert.equal(personSearch.status, 200);
  const foundAuthor = personSearch.json.authors.find((item) => item.author.id === authorId);
  assert.ok(foundAuthor); assert.equal(foundAuthor.author.name, 'José Zaffiro');
  assert.equal(foundAuthor.locality, 'city'); assert.equal(foundAuthor.following, true);
  assert.match(foundAuthor.author.id, /^gf_[A-Za-z0-9_-]{22}$/);
  assert.ok(!JSON.stringify(personSearch.json).includes(authorEmail));

  await api('POST', `/api/social/posts/${post.json.post.id}/report`, { cookie: observer, ip: 'soc-search-report' });
  const hidden = await api('GET', '/api/social/search?q=vietatounico', { cookie: observer, ip: 'soc-search-hidden' });
  assert.equal(hidden.json.posts.some((item) => item.id === post.json.post.id), false);

  const login = await api('POST', '/api/login', { body: { password: 'social-admin-test', name: 'Admin ricerca' }, ip: 'soc-search-admin-login' });
  const admin = staffCookie(login); assert.ok(admin);
  const publishOwnerEmail = 'social-search-producer-live@example.test';
  const publishOwner = await signIn(publishOwnerEmail, 'soc-search-producer-live-auth');
  await api('PATCH', '/api/auth/profile', { cookie: publishOwner, body: { name: 'Persona azienda', city: 'Terni', phone: '+39 333 0000000', zone: { id: 'tr', label: 'Conca', region: 'Umbria' } } });
  const promoted = await api('POST', '/api/admin/users/level', { cookie: admin, body: { userId: publishOwnerEmail, level: 'produttore' } });
  const producerId = promoted.json.producer.id;
  await api('PATCH', `/api/producers/${producerId}`, { cookie: admin, body: { name: 'Fattoria Ètica Zaffiro', place: 'Terni', categories: ['Ortaggi'], contact: { email: 'privata-prod@example.test', phone: '+39 399 1111111' } } });
  await api('POST', '/api/producer/verify', { cookie: admin, body: { producerId } });
  assert.equal((await api('POST', '/api/producer/publish', { cookie: admin, body: { producerId } })).status, 200);

  const makeHiddenProducer = async (suffix, status) => {
    const email = `social-search-producer-${suffix}@example.test`;
    const cookie = await signIn(email, `soc-search-${suffix}-auth`);
    const created = await api('POST', '/api/admin/users/level', { cookie: admin, body: { userId: email, level: 'produttore' } });
    await api('PATCH', `/api/producers/${created.json.producer.id}`, { cookie: admin, body: { name: `Zaffiro ${suffix}`, status } });
    return email;
  };
  const draftEmail = await makeHiddenProducer('BozzaSegreta', 'draft');
  const suspendedEmail = await makeHiddenProducer('SospesaSegreta', 'sospeso');
  const producerSearch = await api('GET', '/api/social/search?q=etica%20zaffiro', { cookie: observer, ip: 'soc-search-producer' });
  assert.equal(producerSearch.status, 200);
  const foundProducer = producerSearch.json.producers.find((item) => item.id === producerId);
  assert.ok(foundProducer); assert.equal(foundProducer.name, 'Fattoria Ètica Zaffiro'); assert.equal(foundProducer.locality, 'city');
  const allZaffiro = await api('GET', '/api/social/search?q=zaffiro&limit=30', { cookie: observer, ip: 'soc-search-producer-all' });
  assert.equal(allZaffiro.json.producers.some((item) => item.name.includes('BozzaSegreta')), false);
  assert.equal(allZaffiro.json.producers.some((item) => item.name.includes('SospesaSegreta')), false);
  const serialized = JSON.stringify(allZaffiro.json);
  for (const forbidden of [observerEmail, authorEmail, publishOwnerEmail, draftEmail, suspendedEmail, 'privata-prod@example.test', '+39 399 1111111', 'ownerId']) {
    assert.ok(!serialized.includes(forbidden), `PII/campo interno esposto: ${forbidden}`);
  }
});

test('profilo social sincronizzato live su post, storia, commento e ricerca', async () => {
  const owner = await signIn('social-sync-owner@example.test', 'soc-sync-owner-auth');
  const commenter = await signIn('social-sync-commenter@example.test', 'soc-sync-commenter-auth');
  const observer = await signIn('social-sync-observer@example.test', 'soc-sync-observer-auth');
  await api('PATCH', '/api/auth/profile', { cookie: owner, body: { name: 'Nome Vecchio Autore', city: 'Perugia', zone: { id: 'pg', label: 'Perugia', region: 'Umbria' } } });
  await api('PATCH', '/api/auth/profile', { cookie: commenter, body: { name: 'Nome Vecchio Commento', city: 'Terni', zone: { id: 'tr', label: 'Conca', region: 'Umbria' } } });
  await api('PATCH', '/api/auth/profile', { cookie: observer, body: { name: 'Lettore Sync', city: 'Terni', zone: { id: 'tr', label: 'Conca', region: 'Umbria' } } });
  const post = await api('POST', '/api/social/posts', { cookie: owner, ip: 'soc-sync-post', body: { text: 'Contenuto SincronoUnico' } });
  const story = await api('POST', '/api/social/stories', { cookie: owner, ip: 'soc-sync-story', body: { text: 'Storia SincronaUnica' } });
  await api('POST', `/api/social/posts/${post.json.post.id}/comments`, { cookie: commenter, ip: 'soc-sync-comment', body: { text: 'Commento da sincronizzare' } });
  const ownerAvatar = await api('POST', '/api/auth/avatar', { cookie: owner, body: { dataUrl: SOCIAL_PNG } });
  const commenterAvatar = await api('POST', '/api/auth/avatar', { cookie: commenter, body: { dataUrl: SOCIAL_PNG } });
  await api('PATCH', '/api/auth/profile', { cookie: owner, body: { name: 'Autore Sincrono Nuovo', city: 'Terni', zone: { id: 'tr', label: 'Conca', region: 'Umbria' } } });
  await api('PATCH', '/api/auth/profile', { cookie: commenter, body: { name: 'Commentatore Sincrono Nuovo' } });

  const feed = await api('GET', '/api/social/feed?scope=for-you', { cookie: observer });
  const livePost = feed.json.posts.find((item) => item.id === post.json.post.id);
  assert.ok(livePost); assert.equal(livePost.author.name, 'Autore Sincrono Nuovo');
  assert.equal(livePost.author.picture, ownerAvatar.json.user.picture); assert.equal(livePost.location.city, 'Terni'); assert.equal(livePost.locality, 'city');
  const liveComment = livePost.comments.find((item) => item.text === 'Commento da sincronizzare');
  assert.ok(liveComment); assert.equal(liveComment.author.name, 'Commentatore Sincrono Nuovo');
  assert.equal(liveComment.author.picture, commenterAvatar.json.user.picture);
  const stories = await api('GET', '/api/social/stories', { cookie: observer });
  const liveStory = stories.json.stories.find((item) => item.id === story.json.story.id);
  assert.ok(liveStory); assert.equal(liveStory.author.name, 'Autore Sincrono Nuovo');
  assert.equal(liveStory.author.picture, ownerAvatar.json.user.picture); assert.equal(liveStory.location.city, 'Terni');
  const search = await api('GET', '/api/social/search?q=autore%20sincrono', { cookie: observer, ip: 'soc-sync-search' });
  assert.ok(search.json.authors.some((item) => item.author.name === 'Autore Sincrono Nuovo'));
  assert.equal(search.json.authors.some((item) => item.author.name === 'Nome Vecchio Autore'), false);
});

test('ricerca social: rate limit account+IP dedicato', async () => {
  const cookie = await signIn('social-search-rate@example.test', 'soc-search-rate-auth');
  const statuses = [];
  for (let i = 0; i < 61; i++) {
    statuses.push((await api('GET', '/api/social/search?q=campo', { cookie, ip: 'soc-search-rate' })).status);
  }
  assert.equal(statuses[59], 200); assert.equal(statuses[60], 429);
});

test('social v2: share idempotente, report nasconde al reporter e moderazione a soglia 3', async () => {
  const owner = await signIn('social-report-owner@example.test', 'soc-report-auth-o');
  const r1 = await signIn('social-report-r1@example.test', 'soc-report-auth-1');
  const r2 = await signIn('social-report-r2@example.test', 'soc-report-auth-2');
  const r3 = await signIn('social-report-r3@example.test', 'soc-report-auth-3');
  const observer = await signIn('social-report-observer@example.test', 'soc-report-auth-v');
  const created = await api('POST', '/api/social/posts', { cookie: owner, ip: 'soc-report-post', body: { text: 'Contenuto da moderare' } });
  const id = created.json.post.id;
  const share1 = await api('POST', `/api/social/posts/${id}/share`, { cookie: r1, ip: 'soc-report-share' });
  const share2 = await api('POST', `/api/social/posts/${id}/share`, { cookie: r1, ip: 'soc-report-share' });
  assert.equal(share1.json.post.counts.shares, 1);
  assert.equal(share2.json.post.counts.shares, 1);
  const selfShare = await api('POST', `/api/social/posts/${id}/share`, { cookie: owner, ip: 'soc-report-self-share' });
  assert.equal(selfShare.json.post.counts.shares, 1);
  assert.equal((await api('POST', `/api/social/posts/${id}/report`, { cookie: owner, ip: 'soc-report-self' })).status, 400);
  assert.equal((await api('POST', `/api/social/posts/${id}/report`, { cookie: r1, ip: 'soc-report-1' })).json.pendingModeration, false);
  assert.equal((await api('POST', `/api/social/posts/${id}/report`, { cookie: r1, ip: 'soc-report-1' })).json.pendingModeration, false); // idempotente
  assert.equal((await api('GET', '/api/social/feed?scope=for-you', { cookie: r1 })).json.posts.some((post) => post.id === id), false);
  await api('POST', `/api/social/posts/${id}/report`, { cookie: r2, ip: 'soc-report-2' });
  const threshold = await api('POST', `/api/social/posts/${id}/report`, { cookie: r3, ip: 'soc-report-3' });
  assert.equal(threshold.json.pendingModeration, true);
  const visible = (await api('GET', '/api/social/feed?scope=for-you', { cookie: observer })).json.posts.find((post) => post.id === id);
  assert.equal(visible.pendingModeration, true);
  assert.ok(!JSON.stringify(visible).includes('@example.test'));
});

test('social v2 stories: 24h, seen idempotente, report privacy-safe e delete owner', async () => {
  const owner = await signIn('social-story-owner@example.test', 'soc-story-auth-o');
  const r1 = await signIn('social-story-r1@example.test', 'soc-story-auth-1');
  const r2 = await signIn('social-story-r2@example.test', 'soc-story-auth-2');
  const r3 = await signIn('social-story-r3@example.test', 'soc-story-auth-3');
  const observer = await signIn('social-story-observer@example.test', 'soc-story-auth-v');
  const uploaded = await api('POST', '/api/social/media', { cookie: owner, ip: 'soc-story-media', body: { dataUrl: SOCIAL_PNG } });
  const created = await api('POST', '/api/social/stories', {
    cookie: owner, ip: 'soc-story-create', body: { text: 'Dal campo', mediaRef: uploaded.json.mediaRef },
  });
  assert.equal(created.status, 201);
  const story = created.json.story, id = story.id;
  assert.equal(Date.parse(story.expiresAt) - Date.parse(story.createdAt), 24 * 60 * 60 * 1000);
  assert.equal(story.media[0].type, 'image');
  const view1 = await api('POST', `/api/social/stories/${id}/view`, { cookie: r1, ip: 'soc-story-view' });
  const view2 = await api('POST', `/api/social/stories/${id}/view`, { cookie: r1, ip: 'soc-story-view' });
  assert.equal(view1.json.story.viewsCount, 1); assert.equal(view2.json.story.viewsCount, 1); assert.equal(view2.json.story.viewer.seen, true);
  assert.equal((await api('POST', `/api/social/stories/${id}/report`, { cookie: owner, ip: 'soc-story-self-report' })).status, 400);
  await api('POST', `/api/social/stories/${id}/report`, { cookie: r1, ip: 'soc-story-report-1' });
  assert.equal((await api('GET', '/api/social/stories', { cookie: r1 })).json.stories.some((item) => item.id === id), false);
  await api('POST', `/api/social/stories/${id}/report`, { cookie: r2, ip: 'soc-story-report-2' });
  const third = await api('POST', `/api/social/stories/${id}/report`, { cookie: r3, ip: 'soc-story-report-3' });
  assert.equal(third.json.pendingModeration, true);
  const forObserver = (await api('GET', '/api/social/stories', { cookie: observer })).json.stories.find((item) => item.id === id);
  assert.equal(forObserver.pendingModeration, true);
  assert.ok(!JSON.stringify(forObserver).includes('@example.test'));
  assert.equal((await api('DELETE', `/api/social/stories/${id}`, { cookie: r2 })).status, 403);
  assert.equal((await api('DELETE', `/api/social/stories/${id}`, { cookie: owner })).status, 200);
});

test('social v2 Produttori: viralità utile primaria, score/rank server e round-robin', async () => {
  const emailA = 'social-viral-a@example.test', emailB = 'social-viral-b@example.test';
  const a = await signIn(emailA, 'soc-viral-auth-a'), b = await signIn(emailB, 'soc-viral-auth-b');
  await api('PATCH', '/api/auth/profile', { cookie: a, body: { name: 'Podere A', city: 'Terni', zone: { id: 'tr', label: 'Conca', region: 'Umbria' } } });
  await api('PATCH', '/api/auth/profile', { cookie: b, body: { name: 'Podere B', city: 'Roma', zone: { id: 'rm', label: 'Roma', region: 'Lazio' } } });
  const login = await api('POST', '/api/login', { body: { password: 'social-admin-test', name: 'Admin viralità' }, ip: 'soc-viral-admin' });
  const admin = staffCookie(login);
  async function publish(email) {
    const promoted = await api('POST', '/api/admin/users/level', { cookie: admin, body: { userId: email, level: 'produttore' } });
    assert.equal(promoted.status, 200);
    const producerId = promoted.json.producer.id;
    assert.equal((await api('POST', '/api/producer/verify', { cookie: admin, body: { producerId } })).status, 200);
    assert.equal((await api('POST', '/api/producer/publish', { cookie: admin, body: { producerId } })).status, 200);
    return producerId;
  }
  await publish(emailA); await publish(emailB);
  const postA = await api('POST', '/api/social/posts', { cookie: a, ip: 'soc-viral-post-a', body: { text: 'Raccolto A' } });
  const postB1 = await api('POST', '/api/social/posts', { cookie: b, ip: 'soc-viral-post-b1', body: { text: 'Raccolto B virale' } });
  const postB2 = await api('POST', '/api/social/posts', { cookie: b, ip: 'soc-viral-post-b2', body: { text: 'Secondo dal campo B' } });
  assert.equal(postA.json.post.author.type, 'producer'); assert.equal(postB1.json.post.author.type, 'producer');
  const fan = await signIn('social-viral-fan@example.test', 'soc-viral-auth-fan'), target = postB1.json.post.id;
  await api('POST', `/api/social/posts/${target}/like`, { cookie: fan, ip: 'soc-viral-like' });
  await api('POST', `/api/social/posts/${target}/save`, { cookie: fan, ip: 'soc-viral-save' });
  await api('POST', `/api/social/posts/${target}/share`, { cookie: fan, ip: 'soc-viral-share' });
  await api('POST', `/api/social/posts/${target}/comments`, { cookie: fan, ip: 'soc-viral-comment', body: { text: 'Utile' } });
  const feed = await api('GET', '/api/social/feed?scope=producers', { cookie: a });
  const ids = feed.json.posts.map((post) => post.id);
  assert.deepEqual(ids.slice(0, 3), [postB1.json.post.id, postA.json.post.id, postB2.json.post.id]);
  assert.equal(feed.json.posts[0].virality.rank, 1);
  assert.equal(feed.json.posts[1].virality.rank, 2);
  assert.ok(feed.json.posts[0].virality.score > feed.json.posts[1].virality.score);
  assert.ok(feed.json.posts.every((post) => post.author.type === 'producer' && post.virality && post.virality.label));
});

test('social v2: rate-limit dedicati media, follow, share e report', async () => {
  const owner = await signIn('social-rates-owner@example.test', 'soc-rates-auth-o');
  const actor = await signIn('social-rates-actor@example.test', 'soc-rates-auth-a');
  const target = await api('POST', '/api/social/posts', { cookie: owner, ip: 'soc-rates-post', body: { text: 'Target pubblico' } });
  const id = target.json.post.id, authorId = target.json.post.author.id;
  const mediaStatuses = [];
  for (let i = 0; i < 13; i++) mediaStatuses.push((await api('POST', '/api/social/media', { cookie: actor, ip: 'soc-rate-media', body: { dataUrl: SOCIAL_PNG } })).status);
  assert.deepEqual(mediaStatuses.slice(0, 12), Array(12).fill(201)); assert.equal(mediaStatuses[12], 429);
  let followStatus;
  for (let i = 0; i < 61; i++) followStatus = (await api('PUT', `/api/social/authors/${authorId}/follow`, { cookie: actor, ip: 'soc-rate-follow' })).status;
  assert.equal(followStatus, 429);
  let shareStatus;
  for (let i = 0; i < 121; i++) shareStatus = (await api('POST', `/api/social/posts/${id}/share`, { cookie: actor, ip: 'soc-rate-share' })).status;
  assert.equal(shareStatus, 429);
  let reportStatus;
  for (let i = 0; i < 21; i++) reportStatus = (await api('POST', `/api/social/posts/${id}/report`, { cookie: actor, ip: 'soc-rate-report' })).status;
  assert.equal(reportStatus, 429);
});

test('cancellazione account: purge social completo, media in retention e nuova identità sulla stessa email', async () => {
  const victimEmail = 'social-delete-victim@example.test';
  const victim = await signIn(victimEmail, 'soc-delete-auth-v');
  const other = await signIn('social-delete-other@example.test', 'soc-delete-auth-o');
  await api('PATCH', '/api/auth/profile', { cookie: victim, body: { name: 'Profilo da cancellare', city: 'Terni', zone: { id: 'tr', label: 'Conca', region: 'Umbria' } } });
  await api('PATCH', '/api/auth/profile', { cookie: other, body: { name: 'Profilo rimasto', city: 'Terni', zone: { id: 'tr', label: 'Conca', region: 'Umbria' } } });
  const victimAvatar = await api('POST', '/api/auth/avatar', { cookie: victim, body: { dataUrl: SOCIAL_PNG } });
  assert.equal(victimAvatar.status, 200);
  const victimAvatarPath = path.join(TMP, victimAvatar.json.user.picture);
  assert.equal(fs.existsSync(victimAvatarPath), true);
  const otherAvatar = await api('POST', '/api/auth/avatar', { cookie: other, body: { dataUrl: SOCIAL_PNG } });
  assert.equal(otherAvatar.status, 200);
  const otherAvatarPath = path.join(TMP, otherAvatar.json.user.picture);
  assert.equal(fs.existsSync(otherAvatarPath), true);

  const otherPost = await api('POST', '/api/social/posts', { cookie: other, ip: 'soc-delete-other-post', body: { text: 'Post che resta' } });
  const otherStory = await api('POST', '/api/social/stories', { cookie: other, ip: 'soc-delete-other-story', body: { text: 'Storia che resta' } });
  const uploaded = await api('POST', '/api/social/media', { cookie: victim, ip: 'soc-delete-upload', body: { dataUrl: SOCIAL_PNG } });
  const victimPost = await api('POST', '/api/social/posts', {
    cookie: victim, ip: 'soc-delete-victim-post', body: { text: 'Post da cancellare', mediaRefs: [uploaded.json.mediaRef] },
  });
  const victimStory = await api('POST', '/api/social/stories', { cookie: victim, ip: 'soc-delete-victim-story', body: { text: 'Storia da cancellare' } });
  const mediaPath = path.join(TMP, victimPost.json.post.media[0].url);
  assert.equal(fs.existsSync(mediaPath), true);

  const targetId = otherPost.json.post.id;
  await api('POST', `/api/social/posts/${targetId}/like`, { cookie: victim, ip: 'soc-delete-like' });
  await api('POST', `/api/social/posts/${targetId}/save`, { cookie: victim, ip: 'soc-delete-save' });
  await api('POST', `/api/social/posts/${targetId}/share`, { cookie: victim, ip: 'soc-delete-share' });
  await api('POST', `/api/social/posts/${targetId}/comments`, { cookie: victim, ip: 'soc-delete-comment', body: { text: 'Commento da cancellare' } });
  await api('POST', `/api/social/posts/${targetId}/report`, { cookie: victim, ip: 'soc-delete-report' });
  await api('POST', `/api/social/stories/${otherStory.json.story.id}/view`, { cookie: victim, ip: 'soc-delete-view' });
  await api('PUT', `/api/social/authors/${otherPost.json.post.author.id}/follow`, { cookie: victim, ip: 'soc-delete-follow-out' });
  await api('PUT', `/api/social/authors/${victimPost.json.post.author.id}/follow`, { cookie: other, ip: 'soc-delete-follow-in' });

  const staffLogin = await api('POST', '/api/login', { body: { password: 'social-admin-test', name: 'Admin cancellazione' }, ip: 'soc-delete-admin-login' });
  const admin = staffCookie(staffLogin);
  const deleted = await api('DELETE', `/api/admin/users?id=${encodeURIComponent(victimEmail)}`, { cookie: admin });
  assert.equal(deleted.status, 200); assert.equal(deleted.json.social.removedPosts, 1); assert.equal(deleted.json.social.removedStories, 1);
  assert.equal(fs.existsSync(mediaPath), true, 'il media orfano non va eliminato prima di 24h');
  assert.equal(fs.existsSync(victimAvatarPath), false, "l'avatar locale dell'account eliminato va rimosso");
  assert.equal(fs.existsSync(otherAvatarPath), true, "l'avatar di un altro account non va toccato");
  assert.equal((await api('GET', '/api/auth/me', { cookie: victim })).json.user, null);

  const feed = await api('GET', '/api/social/feed?scope=for-you', { cookie: other });
  assert.equal(feed.json.posts.some((post) => post.id === victimPost.json.post.id), false);
  const kept = feed.json.posts.find((post) => post.id === targetId);
  assert.deepEqual(kept.counts, { likes: 0, saves: 0, comments: 0, shares: 0 });
  assert.equal(kept.pendingModeration, undefined);
  const stories = await api('GET', '/api/social/stories', { cookie: other });
  assert.equal(stories.json.stories.some((story) => story.id === victimStory.json.story.id), false);
  assert.equal(stories.json.stories.find((story) => story.id === otherStory.json.story.id).viewsCount, 0);
  const suggestions = await api('GET', '/api/social/suggestions?limit=20', { cookie: other });
  assert.equal(suggestions.json.suggestions.some((item) => item.author.id === victimPost.json.post.author.id), false);

  const reRegistered = await api('POST', '/api/auth/register', {
    body: { email: victimEmail, password: 'nuovaPassword1' }, ip: 'soc-delete-reregister',
  });
  assert.equal(reRegistered.status, 200); assert.match(reRegistered.json.user.id, /^usr_[0-9a-f]{36}$/);
  const newCookie = userCookie(reRegistered);
  const newPost = await api('POST', '/api/social/posts', { cookie: newCookie, ip: 'soc-delete-new-post', body: { text: 'Nuova identità' } });
  assert.notEqual(newPost.json.post.author.id, victimPost.json.post.author.id);
  assert.equal((await api('GET', '/api/auth/me', { cookie: victim })).json.user, null, 'il vecchio cookie non possiede il nuovo account');

  // Tutti i flussi che ricevono un'email continuano a risolvere la nuova identità opaca.
  const loginAgain = await api('POST', '/api/auth/login', {
    body: { email: victimEmail, password: 'nuovaPassword1' }, ip: 'soc-delete-login-opaque',
  });
  assert.equal(loginAgain.status, 200); assert.equal(loginAgain.json.user.id, reRegistered.json.user.id);
  const managed = await api('POST', '/api/admin/users/level', {
    cookie: admin, body: { userId: victimEmail, level: 'verificatore' },
  });
  assert.equal(managed.status, 200); assert.equal(managed.json.user.id, reRegistered.json.user.id);
  const invited = await api('POST', '/api/admin/invites', {
    cookie: admin, body: { email: victimEmail, level: 'produttore' },
  });
  assert.equal(invited.status, 200);
  const accepted = await api('POST', `/api/invite/${invited.json.token}/accept`, { cookie: newCookie });
  assert.equal(accepted.status, 200); assert.equal(accepted.json.level, 'produttore');
});

test('moderazione admin: coda privacy-safe e keep/remove idempotenti, scaduta distinta da 404', async () => {
  const owner = await signIn('social-moderation-owner@example.test', 'soc-mod-auth-o');
  const reporter = await signIn('social-moderation-reporter@example.test', 'soc-mod-auth-r');
  await api('PATCH', '/api/auth/profile', { cookie: owner, body: { name: 'Fattoria Moderata', city: 'Terni', zone: { id: 'tr', label: 'Conca', region: 'Umbria' } } });
  const post = await api('POST', '/api/social/posts', { cookie: owner, ip: 'soc-mod-post', body: { text: 'Post segnalato' } });
  const story = await api('POST', '/api/social/stories', { cookie: owner, ip: 'soc-mod-story', body: { text: 'Storia segnalata' } });
  await api('POST', `/api/social/posts/${post.json.post.id}/report`, { cookie: reporter, ip: 'soc-mod-report-p' });
  await api('POST', `/api/social/stories/${story.json.story.id}/report`, { cookie: reporter, ip: 'soc-mod-report-s' });
  assert.equal((await api('GET', '/api/admin/social/moderation?status=pending')).status, 403);
  assert.equal((await api('GET', '/api/admin/social/moderation?status=pending', { cookie: reporter })).status, 403);
  assert.equal((await api('POST', '/api/admin/social/moderation/resolve', { cookie: reporter, body: { type: 'post', id: post.json.post.id, decision: 'keep' } })).status, 403);

  const login = await api('POST', '/api/login', { body: { password: 'social-admin-test', name: 'Admin moderazione' }, ip: 'soc-mod-admin-login' });
  const admin = staffCookie(login);
  // La suite usa un unico documento social: chiude le segnalazioni lasciate volutamente pending
  // dai test precedenti, senza toccare i due contenuti di questo caso.
  const previousQueue = await api('GET', '/api/admin/social/moderation?status=pending', { cookie: admin });
  for (const item of previousQueue.json.items.filter((item) => item.id !== post.json.post.id && item.id !== story.json.story.id)) {
    await api('POST', '/api/admin/social/moderation/resolve', { cookie: admin, body: { type: item.type, id: item.id, decision: 'keep' } });
  }
  const queue = await api('GET', '/api/admin/social/moderation?status=pending', { cookie: admin });
  assert.equal(queue.status, 200); assert.equal(queue.json.counts.pending, 2);
  assert.deepEqual(new Set(queue.json.items.map((item) => item.type)), new Set(['post', 'story']));
  const queuedPost = queue.json.items.find((item) => item.id === post.json.post.id);
  assert.equal(queuedPost.reportCount, 1); assert.equal(queuedPost.author.name, 'Fattoria Moderata');
  assert.deepEqual(queuedPost.location, { city: 'Terni', zoneId: 'tr', zoneLabel: 'Conca', region: 'Umbria' });
  assert.equal(queuedPost.author.id, undefined);
  assert.ok(!JSON.stringify(queue.json).includes('social-moderation-reporter@example.test'));
  assert.equal((await api('GET', '/api/admin/social/moderation?status=resolved', { cookie: admin })).status, 400);

  const kept = await api('POST', '/api/admin/social/moderation/resolve', { cookie: admin, body: { type: 'post', id: post.json.post.id, decision: 'keep' } });
  assert.deepEqual(kept.json, { ok: true, type: 'post', id: post.json.post.id, decision: 'keep', alreadyResolved: false });
  const keptAgain = await api('POST', '/api/admin/social/moderation/resolve', { cookie: admin, body: { type: 'post', id: post.json.post.id, decision: 'keep' } });
  assert.equal(keptAgain.status, 200); assert.equal(keptAgain.json.alreadyResolved, true);

  // `keep` chiude la pratica ma conserva lo storico interno: il reporter continua a non vedere
  // il contenuto e una segnalazione duplicata non riapre la coda.
  const storedAfterKeep = TEST_DB.readCrm('__social').posts.find((item) => item.id === post.json.post.id);
  assert.deepEqual(storedAfterKeep.reports, ['social-moderation-reporter@example.test']);
  assert.deepEqual(storedAfterKeep.reviewedReports, ['social-moderation-reporter@example.test']);
  const reporterFeed = await api('GET', '/api/social/feed?scope=for-you', { cookie: reporter });
  assert.equal(reporterFeed.json.posts.some((item) => item.id === post.json.post.id), false);
  const duplicate = await api('POST', `/api/social/posts/${post.json.post.id}/report`, { cookie: reporter, ip: 'soc-mod-report-p-duplicate' });
  assert.equal(duplicate.status, 200); assert.equal(duplicate.json.alreadyReported, true); assert.equal(duplicate.json.alreadyReviewed, true);
  let queueAfterKeep = await api('GET', '/api/admin/social/moderation?status=pending', { cookie: admin });
  assert.equal(queueAfterKeep.json.items.some((item) => item.id === post.json.post.id), false);

  // Un reporter realmente nuovo apre una nuova pratica con un nuovo pendingSince; i duplicati
  // dello stesso ciclo restano idempotenti e non gonfiano reportCount.
  await new Promise((resolve) => setTimeout(resolve, 2));
  const newReporter = await signIn('social-moderation-new-reporter@example.test', 'soc-mod-auth-new-r');
  const reopened = await api('POST', `/api/social/posts/${post.json.post.id}/report`, { cookie: newReporter, ip: 'soc-mod-report-p-new' });
  assert.equal(reopened.status, 200); assert.equal(reopened.json.alreadyReported, false); assert.equal(reopened.json.alreadyReviewed, false);
  queueAfterKeep = await api('GET', '/api/admin/social/moderation?status=pending', { cookie: admin });
  const reopenedItem = queueAfterKeep.json.items.find((item) => item.id === post.json.post.id);
  assert.equal(reopenedItem.reportCount, 1); assert.ok(Date.parse(reopenedItem.pendingSince));
  assert.ok(Date.parse(reopenedItem.pendingSince) > Date.parse(queuedPost.pendingSince));
  assert.ok(!JSON.stringify(queueAfterKeep.json).includes('social-moderation-new-reporter@example.test'));
  const duplicateNew = await api('POST', `/api/social/posts/${post.json.post.id}/report`, { cookie: newReporter, ip: 'soc-mod-report-p-new-duplicate' });
  assert.equal(duplicateNew.json.alreadyReported, true); assert.equal(duplicateNew.json.alreadyReviewed, false);
  const stillOne = (await api('GET', '/api/admin/social/moderation?status=pending', { cookie: admin })).json.items.find((item) => item.id === post.json.post.id);
  assert.equal(stillOne.reportCount, 1); assert.equal(stillOne.pendingSince, reopenedItem.pendingSince);
  const keptNewCycle = await api('POST', '/api/admin/social/moderation/resolve', { cookie: admin, body: { type: 'post', id: post.json.post.id, decision: 'keep' } });
  assert.equal(keptNewCycle.status, 200); assert.equal(keptNewCycle.json.alreadyResolved, false);

  const removed = await api('POST', '/api/admin/social/moderation/resolve', { cookie: admin, body: { type: 'story', id: story.json.story.id, decision: 'remove' } });
  assert.equal(removed.status, 200); assert.equal(removed.json.alreadyResolved, false);
  const removedAgain = await api('POST', '/api/admin/social/moderation/resolve', { cookie: admin, body: { type: 'story', id: story.json.story.id, decision: 'remove' } });
  assert.equal(removedAgain.status, 200); assert.equal(removedAgain.json.alreadyResolved, true);
  assert.equal((await api('GET', '/api/admin/social/moderation?status=pending', { cookie: admin })).json.counts.pending, 0);
  assert.equal((await api('POST', '/api/admin/social/moderation/resolve', { cookie: admin, body: { type: 'post', id: 'missing', decision: 'remove' } })).status, 404);
  assert.equal((await api('POST', '/api/admin/social/moderation/resolve', { cookie: admin, body: { type: 'post', id: post.json.post.id, decision: 'invalid' } })).status, 400);

  const expiring = await api('POST', '/api/social/stories', { cookie: owner, ip: 'soc-mod-expiring', body: { text: 'Ormai scaduta' } });
  const socialDoc = TEST_DB.readCrm('__social');
  socialDoc.stories.find((item) => item.id === expiring.json.story.id).expiresAt = new Date(Date.now() - 1000).toISOString();
  TEST_DB.writeCrm('__social', socialDoc);
  const expired = await api('POST', '/api/admin/social/moderation/resolve', { cookie: admin, body: { type: 'story', id: expiring.json.story.id, decision: 'remove' } });
  assert.equal(expired.status, 410); assert.equal(expired.json.error, 'storia_scaduta');
  const expiredAgain = await api('POST', '/api/admin/social/moderation/resolve', { cookie: admin, body: { type: 'story', id: expiring.json.story.id, decision: 'remove' } });
  assert.equal(expiredAgain.status, 410);
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
test('avatar: valida magic bytes/5MiB, rimuove metadata e versiona URL senza cache stantia', async () => {
  const PNG = SOCIAL_PNG;
  const PNG_2 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZL0AAAAAASUVORK5CYII=';
  const png = Buffer.from(PNG.split(',')[1], 'base64');
  assert.equal((await api('POST', '/api/auth/avatar', { body: { dataUrl: PNG } })).status, 401);
  const cookie = await signIn('avatar@x.it', 'av1');
  assert.equal((await api('POST', '/api/auth/avatar', { cookie, body: { dataUrl: 'nope' } })).status, 400);
  assert.equal((await api('POST', '/api/auth/avatar', {
    cookie, body: { dataUrl: 'data:image/png;base64,ZmFrZQ==' },
  })).status, 400, 'il MIME dichiarato non sostituisce le magic bytes');
  const oversized = `data:image/png;base64,${Buffer.concat([png, Buffer.alloc(5 * 1024 * 1024)]).toString('base64')}`;
  assert.equal((await api('POST', '/api/auth/avatar', { cookie, body: { dataUrl: oversized } })).status, 413);

  const first = await api('POST', '/api/auth/avatar', { cookie, body: { dataUrl: PNG } });
  assert.equal(first.status, 200);
  assert.match(first.json.user.picture, /^assets\/photos\/users\/[a-f0-9]{16}-[a-f0-9]{32}\.png$/);
  const firstPath = path.join(TMP, first.json.user.picture);
  assert.equal(fs.existsSync(firstPath), true);
  assert.deepEqual((await api('GET', `/${first.json.user.picture}`)).raw, png);

  const secondBytes = Buffer.from(PNG_2.split(',')[1], 'base64');
  const second = await api('POST', '/api/auth/avatar', { cookie, body: { dataUrl: PNG_2 } });
  assert.equal(second.status, 200);
  assert.notEqual(second.json.user.picture, first.json.user.picture, 'ogni upload deve cambiare URL');
  assert.equal(fs.existsSync(firstPath), false, "l'avatar precedente dello stesso account va rimosso");
  const secondLive = await api('GET', `/${second.json.user.picture}`);
  assert.equal(secondLive.status, 200); assert.deepEqual(secondLive.raw, secondBytes);

  const iend = png.indexOf(Buffer.from('IEND')) - 4, privateValue = Buffer.from('gps-private');
  const textChunk = Buffer.concat([
    Buffer.from([0, 0, 0, privateValue.length]), Buffer.from('tEXt'), privateValue, Buffer.alloc(4),
  ]);
  const withMetadata = Buffer.concat([png.subarray(0, iend), textChunk, png.subarray(iend)]);
  const sanitized = await api('POST', '/api/auth/avatar', {
    cookie, body: { dataUrl: `data:image/png;base64,${withMetadata.toString('base64')}` },
  });
  assert.equal(sanitized.status, 200);
  const sanitizedBytes = fs.readFileSync(path.join(TMP, sanitized.json.user.picture));
  assert.deepEqual(sanitizedBytes, png, 'i chunk metadata PNG non devono arrivare sul disco');
  assert.equal(sanitizedBytes.indexOf(privateValue), -1);
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

test('URL con percent-encoding malformato → 400 senza interrompere il server', async () => {
  const malformed = await api('GET', '/api/%E0%A4%A');
  assert.equal(malformed.status, 400);
  assert.equal(malformed.json.error, 'url_non_valido');
  assert.equal((await api('GET', '/api/auth/config')).status, 200);
});
