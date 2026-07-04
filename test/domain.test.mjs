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
} = await import('../server.js');

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
