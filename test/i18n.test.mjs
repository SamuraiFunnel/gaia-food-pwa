// Unit test — motore i18n del front-end (ES module, testabile in Node grazie alla rilevazione ESM).
// t() è puro; detectLang()/setLang() toccano solo globali del browser (localStorage/navigator/document)
// che qui stubbiamo o lasciamo cadere nei try/catch del modulo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { t, detectLang, setLang, getLang, initI18n, SUPPORTED, LANGS } from '../js/i18n.js';
import IT from '../js/i18n/it.js';
import EN from '../js/i18n/en.js';
import DE from '../js/i18n/de.js';
import ZH from '../js/i18n/zh.js';

const DICTS = { en: EN, de: DE, zh: ZH }; // tutte le lingue non-IT, confrontate con IT (base)
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

test('setLang(): il bootstrap può caricare la lingua senza render anticipato', async () => {
  let renders = 0;
  initI18n(() => { renders += 1; });
  await setLang('en', { persist: false, notify: false });
  assert.equal(renders, 0, 'il caricamento iniziale deve attendere authMe prima del primo render');
  await setLang('it', { persist: false });
  assert.equal(renders, 1, 'i cambi lingua interattivi continuano a ridisegnare la UI');
  initI18n(() => {});
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
    setNav(['de-DE', 'en-US']); // de ora è supportato → de
    assert.equal(detectLang(), 'de');
    setNav(['zh-CN', 'en-US']); // zh ora è supportato → zh
    assert.equal(detectLang(), 'zh');
    setNav(['fr-FR', 'es-ES']); // nessuno supportato → default en
    assert.equal(detectLang(), 'en');
  });
});

// ---------------- parità dizionari & copertura chiavi (anti-drift IT/EN) ----------------
test('parità dizionari: ogni lingua ha esattamente le chiavi di IT', () => {
  for (const [code, D] of Object.entries(DICTS)) {
    const missing = Object.keys(IT).filter((k) => !(k in D)).sort();
    const extra = Object.keys(D).filter((k) => !(k in IT)).sort();
    assert.deepEqual(missing, [], `[${code}] chiavi in IT ma non in ${code}: ` + missing.join(', '));
    assert.deepEqual(extra, [], `[${code}] chiavi in ${code} ma non in IT: ` + extra.join(', '));
  }
});

test('placeholder coerenti: ogni {param} di IT esiste in ogni lingua', () => {
  const ph = (s) => (String(s).match(/\{\w+\}/g) || []).sort();
  for (const [code, D] of Object.entries(DICTS)) {
    for (const k of Object.keys(IT)) {
      if (k in D) assert.deepEqual(ph(D[k]), ph(IT[k]), `[${code}] placeholder diversi per "${k}"`);
    }
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
