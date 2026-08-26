// Unit test — logica di business PURA del server (nessun I/O, nessuna rete).
// Runner: `node --test` (built-in, zero dipendenze). Ogni file gira in un processo isolato.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

// Importare server.js esegue dei mkdir su GF_DATA_DIR: puntiamo a una temp così NON si tocca ./data reale.
process.env.GF_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'gf-unit-'));
const {
  custodiSummary, slugify, num, str, cleanVideo, cleanSeasonal, normalizePatch, throttle, EMAIL_RE,
  hashPassword, verifyPassword, publicUser,
  cleanSocialText, cleanSocialKind, socialPageParams, socialPublicId, socialLocation, socialLocality,
  diversifySocialTier, rankSocialPosts, revalidateSocialAuthors, projectSocialPost, projectSocialStory,
  socialPostVirality, socialProducerScores, normalizeSocialDoc, signSocialMediaRef, verifySocialMediaRef,
  socialThrottle, acquireSocialUploadSlot,
} = await import('../server.js');
const {
  inspectDataUrl, stripJpegMetadata, stripPngMetadata, stripWebpMetadata,
  hasSensitiveVideoMetadata, diskDirectoryBytes, ensureDiskCapacity,
} = await import('../media.js');

// ---------------------------------------------------------------- password (scrypt)
test('hashPassword/verifyPassword: roundtrip + password errata + salt casuale', () => {
  const h = hashPassword('correct horse battery');
  assert.match(h, /^[0-9a-f]+:[0-9a-f]+$/);           // formato salt:hash
  assert.equal(verifyPassword('correct horse battery', h), true);
  assert.equal(verifyPassword('sbagliata', h), false);
  assert.equal(verifyPassword('correct horse battery', ''), false);     // stored vuoto
  assert.equal(verifyPassword('correct horse battery', 'senza-due-punti'), false);
  assert.notEqual(hashPassword('x'), hashPassword('x')); // salt diverso ogni volta
});
test('publicUser: rimuove passHash, tiene il resto; null-safe', () => {
  assert.deepEqual(publicUser({ id: 'a@x.it', email: 'a@x.it', passHash: 'salt:hash', name: 'A' }),
    { id: 'a@x.it', email: 'a@x.it', name: 'A' });
  assert.equal(publicUser(null), null);
});

// ---------------------------------------------------------------- slugify
test('slugify: minuscole, trattini, niente accenti', () => {
  assert.equal(slugify('Cascina Del Sole'), 'cascina-del-sole');
  assert.equal(slugify('Perché però'), 'perche-pero');
  assert.equal(slugify('  spazi  vari  '), 'spazi-vari');
  assert.equal(slugify('!!!'), ''); // solo simboli → stringa vuota
});
test('slugify: fallback e taglio a 40 char', () => {
  assert.equal(slugify(''), 'produttore');
  assert.equal(slugify(null), 'produttore');
  assert.ok(slugify('a'.repeat(80)).length <= 40);
});

// ---------------------------------------------------------------- num / str
test('num: numeri validi o null', () => {
  assert.equal(num('12.5'), 12.5);
  assert.equal(num(3), 3);
  assert.equal(num('abc'), null);
  assert.equal(num(''), null);
  assert.equal(num(undefined), null);
});
test('str: coercizione, null→"", taglio a max', () => {
  assert.equal(str('ciao'), 'ciao');
  assert.equal(str(null), '');
  assert.equal(str(undefined), '');
  assert.equal(str(42), '42');
  assert.equal(str('a'.repeat(50), 10).length, 10);
});

// ---------------------------------------------------------------- EMAIL_RE
test('EMAIL_RE: valide vs invalide', () => {
  for (const e of ['a@b.co', 'mario.rossi@gaia.food', 'x+y@dominio.it']) assert.ok(EMAIL_RE.test(e), e);
  for (const e of ['nope', 'a@b', '@b.co', 'a b@c.co', 'a@b .co']) assert.ok(!EMAIL_RE.test(e), e);
});

// ---------------------------------------------------------------- cleanVideo
test('cleanVideo: whitelist tipo, stato, campi opzionali', () => {
  const v = cleanVideo({ type: 'storia', title: 'La mia storia', duration: '2:10', state: 'ready', tone: 'caldo', src: 'a.mp4', poster: 'p.jpg' });
  assert.deepEqual(v, { type: 'storia', title: 'La mia storia', duration: '2:10', state: 'ready', tone: 'caldo', src: 'a.mp4', poster: 'p.jpg' });
});
test('cleanVideo: stato ignoto → coming, src/poster assenti se mancanti, non-oggetto → null', () => {
  const v = cleanVideo({ type: 'metodo', state: 'boh' });
  assert.equal(v.state, 'coming');
  assert.ok(!('src' in v));
  assert.ok(!('poster' in v));
  assert.equal(cleanVideo(null), null);
  assert.equal(cleanVideo('x'), null);
});

// ---------------------------------------------------------------- cleanSeasonal
test('cleanSeasonal: forma stabile o null', () => {
  assert.deepEqual(cleanSeasonal({ label: 'Zucchine', tone: 'verde', note: 'da giugno' }), { label: 'Zucchine', tone: 'verde', note: 'da giugno' });
  assert.equal(cleanSeasonal(0), null);
});

// ---------------------------------------------------------------- normalizePatch
test('normalizePatch: PATCH parziale-safe (chiavi assenti non toccate)', () => {
  const out = normalizePatch({ name: 'Tenuta', note: 'ciao' });
  assert.equal(out.name, 'Tenuta');
  assert.equal(out.note, 'ciao');
  assert.ok(!('km' in out) && !('lat' in out)); // non presenti nel patch → non aggiunti
});
test('normalizePatch: coercizioni km/lat/lng/categories', () => {
  const out = normalizePatch({ km: 'x', lat: '41.7', lng: 'nan', categories: ['Latte', 123] });
  assert.equal(out.km, 0);        // non numerico → 0
  assert.equal(out.lat, 41.7);
  assert.equal(out.lng, null);
  assert.deepEqual(out.categories, ['Latte', '123']);
});
test('normalizePatch: videos/seasonal filtrano gli invalidi, verify default valid', () => {
  const out = normalizePatch({ videos: [{ type: 'presentazione' }, null, 5], seasonal: [{ label: 'A' }, 'x'], verify: {} });
  assert.equal(out.videos.length, 1);
  assert.equal(out.seasonal.length, 1);
  assert.equal(out.verify.state, 'valid');
});

// ---------------------------------------------------------------- throttle (rate-limit puro)
test('throttle: entro il limite passa, oltre limita con retryAfter', () => {
  const bucket = new Map();
  const req = { headers: { 'x-forwarded-for': '9.9.9.9' }, socket: {} };
  for (let i = 0; i < 3; i++) assert.equal(throttle(bucket, req, 3).limited, false);
  const over = throttle(bucket, req, 3);
  assert.equal(over.limited, true);
  assert.ok(over.retryAfter >= 1);
});
test('throttle: la finestra si resetta nel tempo', () => {
  const bucket = new Map();
  const req = { headers: { 'x-forwarded-for': '8.8.8.8' }, socket: {} };
  assert.equal(throttle(bucket, req, 1, 1).limited, false); // finestra 1ms
  const past = Date.now() + 5;
  while (Date.now() < past) { /* attesa busy < 5ms per superare la finestra */ }
  assert.equal(throttle(bucket, req, 1, 1).limited, false); // finestra scaduta → riparte
});
test('throttle: IP diversi = bucket indipendenti', () => {
  const bucket = new Map();
  const a = { headers: { 'x-forwarded-for': '1.1.1.1' }, socket: {} };
  const b = { headers: { 'x-forwarded-for': '2.2.2.2' }, socket: {} };
  assert.equal(throttle(bucket, a, 1).limited, false);
  assert.equal(throttle(bucket, a, 1).limited, true);
  assert.equal(throttle(bucket, b, 1).limited, false); // b non è influenzato da a
});

test('socialThrottle: limite account resiste al cambio IP e limite IP al cambio account', () => {
  const accountBucket = new Map(), request = (ip) => ({ headers: { 'x-forwarded-for': ip }, socket: {} });
  assert.equal(socialThrottle(accountBucket, request('1.1.1.1'), { id: 'a' }, 2, 60000).limited, false);
  assert.equal(socialThrottle(accountBucket, request('2.2.2.2'), { id: 'a' }, 2, 60000).limited, false);
  const accountOver = socialThrottle(accountBucket, request('3.3.3.3'), { id: 'a' }, 2, 60000);
  assert.equal(accountOver.limited, true); assert.equal(accountOver.accountLimited, true);

  const ipBucket = new Map();
  assert.equal(socialThrottle(ipBucket, request('9.9.9.9'), { id: 'a' }, 2, 60000).limited, false);
  assert.equal(socialThrottle(ipBucket, request('9.9.9.9'), { id: 'b' }, 2, 60000).limited, false);
  const ipOver = socialThrottle(ipBucket, request('9.9.9.9'), { id: 'c' }, 2, 60000);
  assert.equal(ipOver.limited, true); assert.equal(ipOver.ipLimited, true);
});

test('upload semaphore: massimo uno per account, due globali e release idempotente', () => {
  const releaseA = acquireSocialUploadSlot('slot-a');
  assert.equal(typeof releaseA, 'function');
  assert.equal(acquireSocialUploadSlot('slot-a'), null);
  const releaseB = acquireSocialUploadSlot('slot-b');
  assert.equal(typeof releaseB, 'function');
  assert.equal(acquireSocialUploadSlot('slot-c'), null);
  releaseA(); releaseA();
  const releaseC = acquireSocialUploadSlot('slot-c');
  assert.equal(typeof releaseC, 'function');
  releaseB(); releaseC();
});

// ---------------------------------------------------------------- social (testo, privacy, ranking territoriale)
test('social: testo ripulito/limitato e kind IT normalizzati agli enum canonici', () => {
  assert.equal(cleanSocialText('  ciao\u0000\r\nmondo  '), 'ciao\nmondo');
  assert.equal(Array.from(cleanSocialText('🍅'.repeat(710), 700)).length, 700);
  assert.equal(cleanSocialKind('domanda'), 'question');
  assert.equal(cleanSocialKind('Consiglio'), 'tip');
  assert.equal(cleanSocialKind('dal campo'), 'field');
  assert.equal(cleanSocialKind('disponibilità'), 'availability');
  assert.equal(cleanSocialKind('storia'), 'story');
  assert.equal(cleanSocialKind('valore-inventato'), 'story');
});

test('socialPublicId: HMAC stabile, opaco e separato per segreto', () => {
  const raw = 'persona-segreta@example.test';
  const a = socialPublicId(raw, 'segreto-a');
  assert.equal(a, socialPublicId(raw, 'segreto-a'));
  assert.notEqual(a, socialPublicId(raw, 'segreto-b'));
  assert.match(a, /^gf_[A-Za-z0-9_-]{22}$/);
  assert.ok(!a.includes(raw));
});

test('socialPageParams: default sicuri, limit max 50 e offset bounded', () => {
  assert.deepEqual(socialPageParams(null, null), { limit: 20, offset: 0 });
  assert.deepEqual(socialPageParams('999', '999999'), { limit: 50, offset: 2000 });
  assert.deepEqual(socialPageParams('0', '-3'), { limit: 1, offset: 0 });
  assert.deepEqual(socialPageParams('12x', 'boh'), { limit: 20, offset: 0 });
});

test('socialLocation/locality: snapshot senza coordinate e precedenza città > zona > regione > resto', () => {
  const viewer = socialLocation({ city: 'Terni', lat: 42.5, lng: 12.6, zone: { id: 'tr', label: 'Conca ternana', region: 'Umbria', comuni: ['Terni'] } });
  assert.deepEqual(viewer, { city: 'Terni', zoneId: 'tr', zoneLabel: 'Conca ternana', region: 'Umbria' });
  assert.equal(socialLocality({ city: 'tèrni', zoneId: 'x', region: 'Lazio' }, viewer), 'city');
  assert.equal(socialLocality({ city: 'Narni', zoneId: 'TR', region: 'Umbria' }, viewer), 'zone');
  assert.equal(socialLocality({ city: 'Perugia', zoneId: 'pg', region: 'UMBRIA' }, viewer), 'region');
  assert.equal(socialLocality({ city: 'Roma', zoneId: 'rm', region: 'Lazio' }, viewer), 'other');
});

test('rankSocialPosts: prossimità per Per te/Vicino; viralità primaria per Produttori', () => {
  const viewer = { city: 'Terni', zoneId: 'tr', zoneLabel: 'Conca ternana', region: 'Umbria' };
  const posts = [
    { id: 'other', authorId: 'p-roma', producerId: 'roma', createdAt: '2030-01-01T00:00:00Z', authorType: 'producer', location: { city: 'Roma', zoneId: 'rm', region: 'Lazio' }, likes: ['a', 'b', 'c'] },
    { id: 'region', authorId: 'persona-pg', createdAt: '2029-01-01T00:00:00Z', authorType: 'person', location: { city: 'Perugia', zoneId: 'pg', region: 'Umbria' } },
    { id: 'zone', authorId: 'p-narni', producerId: 'narni', createdAt: '2028-01-01T00:00:00Z', authorType: 'producer', location: { city: 'Narni', zoneId: 'tr', region: 'Umbria' } },
    { id: 'city-old', authorId: 'persona-tr', createdAt: '2026-01-01T00:00:00Z', authorType: 'person', location: { city: 'Terni', zoneId: 'tr', region: 'Umbria' } },
    { id: 'city-new', authorId: 'p-terni', producerId: 'terni', createdAt: '2027-01-01T00:00:00Z', authorType: 'producer', location: { city: 'Terni', zoneId: 'tr', region: 'Umbria' } },
  ];
  assert.deepEqual(rankSocialPosts(posts, viewer, 'for-you').map((p) => p.id), ['city-new', 'city-old', 'zone', 'region', 'other']);
  assert.deepEqual(rankSocialPosts(posts, viewer, 'nearby').map((p) => p.id), ['city-new', 'city-old', 'zone', 'region']);
  assert.deepEqual(rankSocialPosts(posts, viewer, 'producers', { now: Date.parse('2030-01-01T01:00:00Z') }).map((p) => p.id), ['other', 'city-new', 'zone']);
});

test('rankSocialPosts: Seguiti solo followed newest; Vicino esclude self e seguiti', () => {
  const viewer = { city: 'Terni', zoneId: 'tr', region: 'Umbria' }, following = new Set(['seguito']);
  const posts = [
    { id: 'self', authorId: 'me', createdAt: '2026-08-26T12:00:00Z', location: viewer },
    { id: 'followed', authorId: 'seguito', createdAt: '2026-08-26T11:00:00Z', location: viewer },
    { id: 'near', authorId: 'nuovo', createdAt: '2026-08-26T10:00:00Z', location: viewer },
    { id: 'far', authorId: 'lontano', createdAt: '2026-08-26T13:00:00Z', location: { city: 'Roma', zoneId: 'rm', region: 'Lazio' } },
  ];
  assert.deepEqual(rankSocialPosts(posts, viewer, 'following', { viewerId: 'me', following }).map((p) => p.id), ['followed']);
  assert.deepEqual(rankSocialPosts(posts, viewer, 'nearby', { viewerId: 'me', following }).map((p) => p.id), ['near']);
});

test('diversificazione autore: round-robin nel tier, newest per autore e nessun monopolio iniziale', () => {
  const location = { city: 'Terni', zoneId: 'tr', region: 'Umbria' };
  const post = (id, authorId, createdAt, likes = []) => ({ id, authorId, authorType: 'person', createdAt, location, likes });
  const posts = [
    post('a1', 'a', '2026-08-26T10:00:00Z'),
    post('a2', 'a', '2026-08-26T09:00:00Z'),
    post('a3', 'a', '2026-08-26T08:00:00Z'),
    post('a4', 'a', '2026-08-26T07:00:00Z'),
    post('b1', 'b', '2026-08-26T08:30:00Z'),
    post('b2', 'b', '2026-08-26T06:30:00Z'),
    post('c1', 'c', '2026-08-26T08:15:00Z', Array(500).fill('engagement-ignorato')),
  ];
  const direct = diversifySocialTier(posts).map((p) => p.id);
  assert.deepEqual(direct, ['a1', 'b1', 'c1', 'a2', 'b2', 'a3', 'a4']);
  assert.deepEqual(rankSocialPosts(posts, location, 'for-you').map((p) => p.id), direct);
  assert.deepEqual(direct.filter((id) => id.startsWith('a')), ['a1', 'a2', 'a3', 'a4']); // newest preservato per autore
  assert.equal(new Set(direct).size, posts.length); // più contenuti = più occasioni totali, nessun post perso
});

test('revalidateSocialAuthors: produttore live resta verified; scheda sospesa demote a persona corrente', () => {
  const stored = [{
    id: 'sp_prod', authorId: 'u1@example.test', authorType: 'producer', authorVerified: true,
    authorName: 'Nome vecchio', authorPicture: 'vecchia.jpg', producerId: 'p1',
    location: { city: 'Roma', zoneId: 'rm', zoneLabel: 'Area romana', region: 'Lazio' },
  }];
  const users = [{ id: 'u1@example.test', name: 'Profilo attuale', picture: 'utente.jpg', producerId: 'p1', producerStatus: 'published' }];
  const published = [{
    id: 'p1', ownerId: 'u1@example.test', status: 'published', name: 'Azienda attuale', photo: 'azienda.jpg',
    socialLocation: { city: 'Narni', zoneId: 'tr', zoneLabel: 'Conca ternana', region: 'Umbria' },
  }];
  const live = revalidateSocialAuthors(stored, users, published)[0];
  assert.equal(live.authorType, 'producer');
  assert.equal(live.authorVerified, true);
  assert.equal(live.authorName, 'Azienda attuale');
  assert.equal(live.authorPicture, 'azienda.jpg');
  assert.deepEqual(live.location, published[0].socialLocation); // profilo/post non possono spoofare lo snapshot verificato

  const { socialLocation: _legacyMissing, ...legacyProducer } = published[0];
  const legacy = revalidateSocialAuthors(stored, users, [legacyProducer])[0];
  assert.equal(legacy.authorType, 'person');
  assert.equal(legacy.authorVerified, false);
  assert.equal(legacy.producerId, null); // una scheda legacy deve essere riverificata, nessun fallback producer

  const emptyAnchor = revalidateSocialAuthors(stored, users, [{ ...published[0], socialLocation: {} }])[0];
  assert.equal(emptyAnchor.authorType, 'producer'); // proprietà presente anche se vuota = attestato verificato
  assert.deepEqual(emptyAnchor.location, { city: '', zoneId: '', zoneLabel: '', region: '' });

  const changedProducer = [{ ...published[0], id: 'p2' }, published[0]];
  const changedUser = [{ ...users[0], producerId: 'p2' }];
  const exactLink = revalidateSocialAuthors(stored, changedUser, changedProducer)[0];
  assert.equal(exactLink.authorType, 'person'); // il post p1 non può agganciarsi al nuovo producerId p2

  const demoted = revalidateSocialAuthors(stored, users, [{ ...published[0], status: 'sospeso' }])[0];
  assert.equal(demoted.authorType, 'person');
  assert.equal(demoted.authorVerified, false);
  assert.equal(demoted.producerId, null);
  assert.equal(demoted.authorName, 'Profilo attuale');
  assert.equal(demoted.authorPicture, 'utente.jpg');
  assert.equal(stored[0].authorType, 'producer'); // rivalidazione non muta lo storico
});

test('projectSocialPost: nessun ID/email interno, counts e flag viewer corretti', () => {
  const rawId = 'privato@example.test', secret = 'segreto-test';
  const projected = projectSocialPost({
    id: 'sp_1', text: '<b>testo UGC</b>', kind: 'question', createdAt: '2026-08-26T10:00:00Z',
    authorId: rawId, authorName: 'Maria', authorPicture: '', authorType: 'person', authorVerified: false,
    location: { city: 'Terni', zoneId: 'tr', zoneLabel: 'Conca', region: 'Umbria', lat: 42 }, locality: 'city',
    likes: [rawId, rawId, 'altro@example.test'], saves: ['altro@example.test'],
    comments: [{ id: 'sc_1', text: 'utile', createdAt: '2026-08-26T10:01:00Z', authorId: 'altro@example.test', authorName: 'Luca', authorType: 'person' }],
  }, rawId, secret);
  assert.equal(projected.author.id, socialPublicId(rawId, secret));
  assert.deepEqual(projected.counts, { likes: 2, saves: 1, comments: 1, shares: 0 });
  assert.deepEqual(projected.viewer, { liked: true, saved: false, shared: false, followingAuthor: false, ownAuthor: true, reported: false });
  assert.equal(projected.locality, 'city');
  assert.equal(projected.location.lat, undefined);
  assert.equal(projected.text, '<b>testo UGC</b>'); // è testo: l'escape è responsabilità del renderer frontend
  const json = JSON.stringify(projected);
  assert.ok(!json.includes('privato@example.test'));
  assert.ok(!json.includes('altro@example.test'));
});

test('social v2: migra il documento v1 preservando i post e inizializza stories/follows', () => {
  const legacyPost = { id: 'legacy', text: 'Preservato' };
  const migrated = normalizeSocialDoc({ socialVersion: 1, posts: [legacyPost] });
  assert.equal(migrated.socialVersion, 2);
  assert.equal(migrated.posts[0], legacyPost);
  assert.deepEqual(migrated.stories, []);
  assert.deepEqual(migrated.follows, []);
});

test('mediaRef: HMAC account-bound, scadenza 60m e manomissione rifiutata', () => {
  const now = Date.parse('2026-08-26T12:00:00Z'), secret = 'social-media-secret';
  const ref = signSocialMediaRef({ type: 'image', mime: 'image/png', url: 'assets/media/social/a.png' }, 'owner@example.test', now, secret);
  assert.deepEqual(verifySocialMediaRef(ref, 'owner@example.test', now + 3599e3, secret),
    { type: 'image', mime: 'image/png', url: 'assets/media/social/a.png' });
  assert.equal(verifySocialMediaRef(ref, 'other@example.test', now, secret), null);
  assert.equal(verifySocialMediaRef(ref, 'owner@example.test', now + 3600e3 + 1, secret), null);
  assert.equal(verifySocialMediaRef(ref.slice(0, -1) + (ref.endsWith('a') ? 'b' : 'a'), 'owner@example.test', now, secret), null);
  assert.ok(!ref.includes('owner@example.test'));
});

test('media: magic bytes coerenti e limiti distinti immagine/video', () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const mp4 = 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAAAAA==';
  assert.equal(inspectDataUrl(png, { maxImageBytes: 100 }).type, 'image');
  assert.equal(inspectDataUrl(mp4, { maxVideoBytes: 30 }).type, 'video');
  assert.throws(() => inspectDataUrl('data:image/png;base64,ZmFrZQ==', { maxImageBytes: 20 }), /non coerente/);
  assert.throws(() => inspectDataUrl(png, { maxImageBytes: 4 }), (error) => error.code === 413);
});

test('media privacy: rimuove metadata JPEG/PNG/WebP e rifiuta posizione MP4', () => {
  const jpeg = Buffer.concat([
    Buffer.from('ffd8ffe10008457869660000', 'hex'), // APP1 Exif
    Buffer.from('ffe000044f4b', 'hex'),             // APP0 preservato
    Buffer.from('ffda00021122ffd9', 'hex'),         // SOS + entropy/EOI
  ]);
  const cleanJpeg = stripJpegMetadata(jpeg);
  assert.equal(cleanJpeg.indexOf(Buffer.from('Exif')), -1);
  assert.ok(cleanJpeg.indexOf(Buffer.from('OK')) >= 0);

  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  const iend = png.indexOf(Buffer.from('IEND')) - 4;
  const textChunk = Buffer.concat([Buffer.from([0, 0, 0, 3]), Buffer.from('tEXt'), Buffer.from('gps'), Buffer.alloc(4)]);
  const pngWithText = Buffer.concat([png.subarray(0, iend), textChunk, png.subarray(iend)]);
  assert.deepEqual(stripPngMetadata(pngWithText), png);

  const webpChunk = (type, data) => {
    const head = Buffer.alloc(8); head.write(type, 0, 'ascii'); head.writeUInt32LE(data.length, 4);
    return Buffer.concat([head, data, data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
  };
  const vp8x = Buffer.alloc(10); vp8x[0] = 0x0c;
  const webpBody = Buffer.concat([Buffer.from('WEBP'), webpChunk('VP8X', vp8x), webpChunk('EXIF', Buffer.from('gps!')), webpChunk('VP8 ', Buffer.alloc(0))]);
  const webp = Buffer.alloc(8 + webpBody.length); webp.write('RIFF'); webp.writeUInt32LE(webpBody.length, 4); webpBody.copy(webp, 8);
  const cleanWebp = stripWebpMetadata(webp);
  assert.equal(cleanWebp.indexOf(Buffer.from('EXIF')), -1);
  assert.equal(cleanWebp[20] & 0x0c, 0);

  const locatedMp4 = Buffer.concat([Buffer.from('000000186674797069736f6d00000000', 'hex'), Buffer.from('location.ISO6709+42.5+12.6/')]);
  assert.equal(hasSensitiveVideoMetadata(locatedMp4, 'video/mp4'), true);
  const locatedUrl = `data:video/mp4;base64,${locatedMp4.toString('base64')}`;
  assert.throws(() => inspectDataUrl(locatedUrl, { maxVideoBytes: 1024 }), /metadata di localizzazione/);
});

test('fallback disk quota: misura solo file e rifiuta prima di superare il cap', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gf-media-cap-'));
  try {
    fs.writeFileSync(path.join(dir, 'a.bin'), Buffer.alloc(10));
    fs.mkdirSync(path.join(dir, 'sottocartella'));
    assert.equal(diskDirectoryBytes(dir), 10);
    assert.doesNotThrow(() => ensureDiskCapacity(dir, 5, 15));
    assert.throws(() => ensureDiskCapacity(dir, 6, 15), (error) => error.code === 507);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('viralità utile: pesi, auto-engagement escluso, decay 72h e top3 produttore', () => {
  const now = Date.parse('2026-08-26T12:00:00Z'), createdAt = new Date(now).toISOString();
  const base = {
    id: 'v1', authorId: 'prod', producerId: 'p1', authorType: 'producer', createdAt,
    likes: ['prod', 'l1'], saves: ['prod', 's1'], shares: ['prod', 'h1'],
    comments: [{ authorId: 'prod' }, { authorId: 'c1' }, { authorId: 'c1' }],
  };
  const fresh = socialPostVirality(base, now);
  assert.equal(fresh.useful, 10); // 1 like + 2 commentatore + 3 save + 4 share
  assert.equal(socialPostVirality(base, now + 72 * 36e5).score, 5);
  const four = [1, 2, 3, 4].map((n) => ({
    id: `v${n}`, authorId: 'prod', producerId: 'p1', authorType: 'producer', createdAt,
    likes: Array.from({ length: n }, (_, i) => `l${n}-${i}`), saves: [], shares: [], comments: [],
  }));
  assert.equal(socialProducerScores(four, now).get('p1'), 9); // migliori tre: 4+3+2
});

test('post/story media: formati proiettati e nessun raw ID di views/report', () => {
  const post = projectSocialPost({
    id: 'p', authorId: 'a@example.test', authorName: 'A', authorType: 'person', text: '',
    media: [{ type: 'image', mime: 'image/png', url: 'assets/a.png' }, { type: 'video', mime: 'video/mp4', url: 'assets/b.mp4' }],
  }, 'viewer@example.test', 'secret');
  assert.equal(post.format, 'carousel');
  assert.equal(post.mediaUrl, 'assets/a.png');
  const story = projectSocialStory({
    id: 's', authorId: 'a@example.test', authorName: 'A', authorType: 'person', views: ['viewer@example.test'], reports: ['reporter@example.test'],
    media: [{ type: 'video', mime: 'video/mp4', url: 'assets/b.mp4' }],
  }, 'viewer@example.test', 'secret');
  assert.equal(story.viewer.seen, true);
  assert.equal(story.viewsCount, 1);
  assert.ok(!JSON.stringify(story).includes('@example.test'));
});

test('projectSocialPost: count commenti totale ma incorpora soltanto gli ultimi 20', () => {
  const comments = Array.from({ length: 25 }, (_, i) => ({
    id: `sc_${i}`, text: `Commento ${i}`, createdAt: `2026-08-26T10:${String(i).padStart(2, '0')}:00Z`,
    authorId: `u${i}@example.test`, authorName: `Utente ${i}`, authorType: 'person',
  }));
  const projected = projectSocialPost({
    id: 'sp_many_comments', text: 'Discussione', kind: 'story', createdAt: '2026-08-26T10:00:00Z',
    authorId: 'owner@example.test', authorName: 'Owner', authorType: 'person', comments,
  }, null, 'secret');
  assert.equal(projected.counts.comments, 25);
  assert.equal(projected.comments.length, 20);
  assert.equal(projected.comments[0].id, 'sc_5');
  assert.equal(projected.comments.at(-1).id, 'sc_24');
});

// ---------------------------------------------------------------- custodiSummary (la matematica dei Custodi)
const DAY = 86400000;
const NOW = Date.UTC(2026, 6, 1); // 2026-07-01, istante fisso → test deterministico
const daysAgo = (n) => new Date(NOW - n * DAY).toISOString();

test('custodiSummary: nessun invitato → tutto a zero, livello Seme, prossimo Custode', () => {
  const s = custodiSummary([], 'mario', 'mario@x.it', NOW);
  assert.equal(s.counts.total, 0);
  assert.equal(s.credit, 0);
  assert.equal(s.commission, 0);
  assert.equal(s.level.key, 'seme');
  assert.equal(s.next.key, 'custode');
  assert.equal(s.perActive, 8);
  assert.equal(s.perCommission, 7.8);
  assert.equal(s.freeAt, 5);
});

test('custodiSummary: stato del seme per età (seme <2g · germoglio 2–60g · radicato ≥60g)', () => {
  const users = [
    { id: 'a@x.it', referredBy: 'mario', referredAt: daysAgo(0) },   // seme
    { id: 'b@x.it', referredBy: 'mario', referredAt: daysAgo(10) },  // germoglio
    { id: 'c@x.it', referredBy: 'mario', referredAt: daysAgo(90) },  // radicato
    { id: 'd@x.it', referredBy: 'ALTRO', referredAt: daysAgo(90) },  // altro invitante → escluso
    { id: 'mario@x.it', referredBy: 'mario', referredAt: daysAgo(90) }, // sé stesso → escluso
  ];
  const s = custodiSummary(users, 'mario', 'mario@x.it', NOW);
  assert.deepEqual(s.counts, { seme: 1, germoglio: 1, radicato: 1, total: 3 });
});

test('custodiSummary: credito e commissione contano solo i RADICATI', () => {
  const users = Array.from({ length: 3 }, (_, i) => ({ id: `r${i}@x.it`, referredBy: 'mario', referredAt: daysAgo(70) }));
  const s = custodiSummary(users, 'mario', 'mario@x.it', NOW);
  assert.equal(s.counts.radicato, 3);
  assert.equal(s.credit, 24);          // 3 × €8
  assert.equal(s.commission, 23.4);    // 3 × €7,80 (arrotondato a 2 decimali)
});

test('custodiSummary: soglie livello (1→Custode, 5→Borgo, 15→Territorio)', () => {
  const radicati = (n) => Array.from({ length: n }, (_, i) => ({ id: `r${i}@x.it`, referredBy: 'm', referredAt: daysAgo(70) }));
  assert.equal(custodiSummary(radicati(1), 'm', 'me', NOW).level.key, 'custode');
  assert.equal(custodiSummary(radicati(5), 'm', 'me', NOW).level.key, 'borgo');
  assert.equal(custodiSummary(radicati(15), 'm', 'me', NOW).level.key, 'territorio');
  assert.equal(custodiSummary(radicati(15), 'm', 'me', NOW).next, null); // massimo livello → nessun prossimo
});

test('custodiSummary: nome mostrato (name > email > "Nuovo seme")', () => {
  const users = [
    { id: 'a@x.it', email: 'a@x.it', referredBy: 'm', name: '  Anna  ', referredAt: daysAgo(0) },
    { id: 'bruno@x.it', email: 'bruno@x.it', referredBy: 'm', referredAt: daysAgo(0) },
    { id: 'senzanome', referredBy: 'm', referredAt: daysAgo(0) }, // né nome né email → "Nuovo seme"
  ];
  const names = custodiSummary(users, 'm', 'me', NOW).people.map(p => p.name);
  assert.deepEqual(names, ['Anna', 'bruno', 'Nuovo seme']);
});
