// Unit test — motore i18n del front-end (ES module, testabile in Node grazie alla rilevazione ESM).
// t() è puro; detectLang()/setLang() toccano solo globali del browser (localStorage/navigator/document)
// che qui stubbiamo o lasciamo cadere nei try/catch del modulo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { t, detectLang, setLang, getLang, SUPPORTED, LANGS } from '../js/i18n.js';
import IT from '../js/i18n/it.js';
import EN from '../js/i18n/en.js';

const jsDir = fileURLToPath(new URL('../js', import.meta.url));

test('SUPPORTED / LANGS coerenti', () => {
  assert.ok(SUPPORTED.includes('it') && SUPPORTED.includes('en'));
  assert.deepEqual(LANGS.map((l) => l.code), SUPPORTED); // ogni lingua elencata ha un loader
});

test('t(): chiave nota (IT di base), chiave ignota → chiave nuda', () => {
  assert.equal(t('nav.scopri'), 'Scopri');
  assert.equal(t('chiave.inesistente'), 'chiave.inesistente'); // fallback visibile in QA
});

test('t(): interpolazione dei parametri {nome}', () => {
  assert.equal(t('Ciao {nome}', { nome: 'Daniele' }), 'Ciao Daniele');
  assert.equal(t('Ciao {nome}', {}), 'Ciao {nome}'); // parametro mancante → placeholder preservato
});

test('setLang(): switch IT→EN cambia le traduzioni e getLang()', async () => {
  await setLang('en', { persist: false });
  assert.equal(getLang(), 'en');
  assert.equal(t('nav.scopri'), 'Discover');
  assert.equal(t('settings.custodi'), 'The Guardians of Gaia');
  await setLang('it', { persist: false }); // ripristino per non sporcare altri test
  assert.equal(t('nav.scopri'), 'Scopri');
});

test('setLang(): lingua non supportata → ripiega su EN', async () => {
  await setLang('xx', { persist: false });
  assert.equal(getLang(), 'en');
  await setLang('it', { persist: false });
});

// detectLang() legge localStorage e navigator. In Node 25 questi sono globali NATIVI con getter
// che possono lanciare (localStorage senza --localstorage-file): li sovrascriviamo via descriptor
// senza mai invocarne il getter, e li ripristiniamo dopo.
function setGlobal(name, value) { Object.defineProperty(globalThis, name, { value, configurable: true, writable: true }); }
function withGlobals(navLangs, savedLang, fn) {
  const dLS = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const dNav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  try {
    setGlobal('localStorage', { getItem: () => savedLang, setItem: () => {} });
    setGlobal('navigator', { languages: navLangs });
    return fn((langs) => setGlobal('navigator', { languages: langs }));
  } finally {
    if (dLS) Object.defineProperty(globalThis, 'localStorage', dLS); else delete globalThis.localStorage;
    if (dNav) Object.defineProperty(globalThis, 'navigator', dNav); else delete globalThis.navigator;
  }
}

test('detectLang(): scelta salvata ha la precedenza', () => {
  withGlobals(['it-IT'], 'en', () => {
    assert.equal(detectLang(), 'en'); // salvato vince sulla lingua del dispositivo
  });
});

test('detectLang(): senza scelta salvata usa la lingua del dispositivo, con fallback EN', () => {
  withGlobals(['it-IT', 'en-US'], null, (setNav) => {
    assert.equal(detectLang(), 'it');
    setNav(['de-DE', 'en-US']); // de non supportato → primo supportato = en
    assert.equal(detectLang(), 'en');
    setNav(['fr-FR']);          // nessuno supportato → default en
    assert.equal(detectLang(), 'en');
  });
});

// ---------------- parità dizionari & copertura chiavi (anti-drift IT/EN) ----------------
test('parità dizionari: IT ed EN hanno esattamente le stesse chiavi', () => {
  const missingInEn = Object.keys(IT).filter((k) => !(k in EN)).sort();
  const missingInIt = Object.keys(EN).filter((k) => !(k in IT)).sort();
  assert.deepEqual(missingInEn, [], 'chiavi in IT ma non in EN: ' + missingInEn.join(', '));
  assert.deepEqual(missingInIt, [], 'chiavi in EN ma non in IT: ' + missingInIt.join(', '));
});

test('placeholder coerenti: ogni {param} di IT esiste anche in EN', () => {
  const ph = (s) => (String(s).match(/\{(\w+)\}/g) || []).sort();
  for (const k of Object.keys(IT)) {
    if (k in EN) assert.deepEqual(ph(EN[k]), ph(IT[k]), `placeholder diversi per la chiave "${k}"`);
  }
});

// Scansiona il codice: OGNI chiave i18n usata (t('sezione.chiave')) deve esistere in it.js.
// Questo test avrebbe intercettato da solo il bug 'profile.saved' (usata ma non definita) e copre
// automaticamente ogni nuova schermata che viene tradotta.
test('ogni chiave t() usata nel codice esiste nel dizionario IT', () => {
  const files = fs.readdirSync(jsDir, { recursive: true }).filter((f) => typeof f === 'string' && f.endsWith('.js'));
  const used = new Set();
  for (const rel of files) {
    const src = fs.readFileSync(path.join(jsDir, rel), 'utf8');
    for (const m of src.matchAll(/\bt\(\s*['"]([a-z0-9]+\.[A-Za-z0-9.]+)['"]/g)) used.add(m[1]);
  }
  const missing = [...used].filter((k) => !(k in IT)).sort();
  assert.deepEqual(missing, [], 'chiavi usate nel codice ma assenti da it.js: ' + missing.join(', '));
  assert.ok(used.size > 40, 'attese molte chiavi in uso, trovate: ' + used.size);
});
