// Unit test — motore i18n del front-end (ES module, testabile in Node grazie alla rilevazione ESM).
// t() è puro; detectLang()/setLang() toccano solo globali del browser (localStorage/navigator/document)
// che qui stubbiamo o lasciamo cadere nei try/catch del modulo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { t, detectLang, setLang, getLang, SUPPORTED, LANGS } from '../js/i18n.js';

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
