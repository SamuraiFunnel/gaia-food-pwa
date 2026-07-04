// ---------------- i18n · motore multi-lingua (zero dipendenze, zero build) ----------------
// Dizionari per-lingua come moduli ES caricati a richiesta. IT è la base (sempre in memoria,
// fallback di chiave). Cambiare lingua = carica il dizionario + chiama rerender() (il router
// ridisegna la schermata corrente). Aggiungere una lingua = 1 file js/i18n/<code>.js + 1 riga in LOADERS.
import IT from './i18n/it.js';

const LOADERS = {
  it: () => Promise.resolve({ default: IT }),
  en: () => import('./i18n/en.js'),
  // de: () => import('./i18n/de.js'),   ← futura (basta creare il file)
  // zh: () => import('./i18n/zh.js'),
};
export const SUPPORTED = Object.keys(LOADERS);
// Lingue mostrate nello switcher (in ordine). Estendere qui quando si aggiunge un dizionario.
export const LANGS = [
  { code: 'it', flag: '🇮🇹', label: 'Italiano' },
  { code: 'en', flag: '🇬🇧', label: 'English' },
];
const RTL = ['ar', 'he', 'fa', 'ur'];
const DEFAULT_UNSUPPORTED = 'en'; // turista con locale non supportato → inglese

let dict = IT, lang = 'it', onChange = () => {};

export const getLang = () => lang;

// t('nav.scopri') → stringa. Fallback: lingua attiva → IT base → chiave nuda (bug visibile in QA).
export function t(key, params) {
  let s = (dict[key] != null ? dict[key] : (IT[key] != null ? IT[key] : key));
  if (params) s = s.replace(/\{(\w+)\}/g, (_, k) => (params[k] != null ? params[k] : `{${k}}`));
  return s;
}

// Rileva la lingua: scelta salvata > lingua del dispositivo (navigator.languages) > default EN.
export function detectLang() {
  try { const saved = localStorage.getItem('gf_lang'); if (saved && SUPPORTED.includes(saved)) return saved; } catch (_) {}
  const cands = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || ''];
  for (const l of cands) { const base = String(l).toLowerCase().split('-')[0]; if (SUPPORTED.includes(base)) return base; }
  return DEFAULT_UNSUPPORTED;
}

export async function setLang(code, { persist = true } = {}) {
  if (!SUPPORTED.includes(code)) code = DEFAULT_UNSUPPORTED;
  const mod = await LOADERS[code]();
  dict = mod.default; lang = code;
  try { document.documentElement.lang = code; document.documentElement.dir = RTL.includes(code) ? 'rtl' : 'ltr'; } catch (_) {}
  if (persist) { try { localStorage.setItem('gf_lang', code); } catch (_) {} }
  onChange();
}

export function initI18n(rerender) { onChange = typeof rerender === 'function' ? rerender : (() => {}); }
