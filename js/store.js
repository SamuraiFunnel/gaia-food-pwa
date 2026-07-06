// Stato app + client API. Backend: /api/* (file-based ora, cloud poi). Fallback offline: data/producers.json.
// API_BASE vuoto = chiamate relative: in locale funziona, in produzione diventerà l'URL Render (es. 'https://gaia-food.onrender.com').
const API_BASE = '';
const state = {
  loaded: false, zone: null, categories: [], producers: [],
  query: '', category: null, radius: 15, role: null,
  user: null, // utente finale loggato (Google/email); null = nessuno (l'app è gated, niente ospite)
  saved: JSON.parse(localStorage.getItem('gf_saved') || '[]'),
};

async function fetchData() {
  try {
    const r = await fetch('./api/producers', { cache: 'no-store' });
    if (r.ok) return await r.json();
  } catch (e) { /* offline */ }
  const r = await fetch('./data/producers.json'); return await r.json();
}
function apply(d) {
  state.zone = d.zone; state.categories = d.categories;
  // Lo stato globale (mappa/home/salvati) mostra SOLO schede pubblicate: se lo staff è loggato il server
  // ritorna anche le bozze → le filtriamo qui, così le viste utente non le mostrano mai. L'admin usa adminProducers().
  state.producers = (d.producers || []).filter(p => !p.status || p.status === 'published').map(p => ({ ...p, saved: state.saved.includes(p.id) }));
}
export async function loadData() {
  if (state.loaded) return state;
  apply(await fetchData()); state.loaded = true;
  return state;
}
export async function reloadData() { apply(await fetchData()); return state; }
export const getState = () => state;

// ---- Hub "una-tantum": ricordiamo che l'utente ha già scelto una funzione ----
export const hubSeen = () => localStorage.getItem('gf_hubSeen') === '1';
export function markHubSeen(dest) {
  localStorage.setItem('gf_hubSeen', '1');
  if (dest) localStorage.setItem('gf_lastFn', dest);
}
export const lastFunction = () => localStorage.getItem('gf_lastFn') || '#/home';
export function resetHub() { localStorage.removeItem('gf_hubSeen'); }
export const producerById = (id) => state.producers.find(p => p.id === id);

export function results() {
  let r = state.producers.slice();
  if (state.category) r = r.filter(p => p.categories.includes(state.category));
  if (state.query) { const q = state.query.toLowerCase(); r = r.filter(p => (p.name + ' ' + p.place + ' ' + p.categories.join(' ')).toLowerCase().includes(q)); }
  return r.sort((a, b) => a.km - b.km);
}
export function toggleSaved(id) {
  const i = state.saved.indexOf(id);
  if (i >= 0) state.saved.splice(i, 1); else state.saved.push(id);
  localStorage.setItem('gf_saved', JSON.stringify(state.saved));
  const p = producerById(id); if (p) p.saved = state.saved.includes(id);
  return state.saved.includes(id);
}

// ---- API admin ----
const j = (url, opts = {}) => fetch(url, { headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', ...opts }).then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || r.status); return d; });
export async function adminMe() { const d = await j('./api/me'); state.role = d.role; return d.role; }
export async function adminLogin(password) { const d = await j('./api/login', { method: 'POST', body: JSON.stringify({ password }) }); state.role = d.role; return d.role; }
export async function adminLogout() { await fetch('./api/logout', { method: 'POST', credentials: 'same-origin' }); state.role = null; }
export async function createProducer(p) { const d = await j('./api/producers', { method: 'POST', body: JSON.stringify(p) }); await reloadData(); return d; }
export async function updateProducer(id, patch) { const d = await j('./api/producers/' + id, { method: 'PUT', body: JSON.stringify(patch) }); await reloadData(); return d; }
export async function deleteProducer(id) { await j('./api/producers/' + id, { method: 'DELETE' }); await reloadData(); }
export async function uploadPhoto(id, dataUrl) { const d = await j('./api/producers/' + id + '/photo', { method: 'POST', body: JSON.stringify({ dataUrl }) }); await reloadData(); return d; }

// ---- Auth utente finale (Google reale / email) ----
// credentials:'include' = il cookie httpOnly gf_user viaggia anche cross-origin (API su dominio separato in prod).
const ja = (url, opts = {}) => fetch(url, { headers: { 'Content-Type': 'application/json' }, credentials: 'include', ...opts }).then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) { const e = new Error(d.error || r.status); e.status = r.status; throw e; } return d; });

// "Seme" del referral: se l'app è aperta con ?seme=<codice> (nell'URL o nell'hash), lo ricordiamo
// per collegare l'iscrizione all'invitante (Custodi). Catturato una volta al caricamento del modulo.
try {
  const q = new URLSearchParams(location.search.slice(1));
  const hq = new URLSearchParams((location.hash.split('?')[1]) || '');
  const seme = (q.get('seme') || hq.get('seme') || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60);
  if (seme) localStorage.setItem('gf_seed', seme);
} catch (_) {}
export const getSeed = () => { try { return localStorage.getItem('gf_seed') || ''; } catch { return ''; } };

export async function signInWithGoogle(idToken) { const d = await ja('./api/auth/google', { method: 'POST', body: JSON.stringify({ idToken, seme: getSeed() }) }); state.user = d.user; return d.user; }
// Email + password: login e registrazione (auth v2).
export async function loginPassword(email, password) { const d = await ja('./api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }); state.user = d.user; return d.user; }
export async function registerPassword(email, password) { const d = await ja('./api/auth/register', { method: 'POST', body: JSON.stringify({ email, password, seme: getSeed() }) }); state.user = d.user; return d.user; }
// Dati della sezione "I Custodi di Gaia" (seme, persone portate, credito, livello) dell'utente loggato.
export async function custodiMe() { return ja('./api/custodi/me'); }
export async function authMe() { try { const d = await ja('./api/auth/me'); state.user = d.user; return d.user; } catch (e) { state.user = null; return null; } }
// Google client id dal server (env GF_GOOGLE_CLIENT_ID). Vuoto = login Google non configurato.
export async function authConfig() { try { return await ja('./api/auth/config'); } catch (e) { return { googleClientId: '' }; } }
export async function signOut() { try { await ja('./api/auth/logout', { method: 'POST' }); } catch (e) {} state.user = null; }
export const currentUser = () => state.user;

// ---- Regione/Zona dell'utente (onboarding "alla Glovo") ----
// setZone: persiste la zona scelta sul profilo utente. L'endpoint PUT /api/auth/profile {zone} -> {user}
// è aggiunto a parte lato server; qui lo ASSUMIAMO esistente. Usa API_BASE per essere pronto al deploy.
export async function setZone(zone) {
  const d = await ja(`${API_BASE}/api/auth/profile`, { method: 'PUT', body: JSON.stringify({ zone }) });
  state.user = d.user || { ...(state.user || {}), zone };
  return state.user;
}
// Aggiorna i dati del profilo (nome, città, lingua, notifiche): solo i campi passati.
export async function updateProfile(fields) {
  const d = await ja(`${API_BASE}/api/auth/profile`, { method: 'PATCH', body: JSON.stringify(fields) });
  state.user = d.user; return state.user;
}
// Carica un avatar (dataURL base64) per l'utente loggato → aggiorna user.picture.
export async function uploadAvatar(dataUrl) {
  const d = await ja(`${API_BASE}/api/auth/avatar`, { method: 'POST', body: JSON.stringify({ dataUrl }) });
  state.user = d.user; return state.user;
}
// Zona scelta dall'utente (dal profilo). null finché non l'ha scelta.
export const userZone = () => (state.user && state.user.zone) || null;
// Id della zona "attiva" nei dati attuali (es. 'alta-val-di-sangro' in Abruzzo): l'unica con produttori.
export const activeZoneId = () => (state.zone && state.zone.id) || null;
// La zona dell'utente coincide con quella attiva (= ha produttori da mostrare)?
export function userZoneIsActive() {
  const uz = userZone();
  if (!uz) return false;
  const id = typeof uz === 'string' ? uz : (uz.id || uz.zoneId);
  return !!id && id === activeZoneId();
}

// ---- Candidature produttore ----
// Invio pubblico (nessun login). Ricorda l'ultima candidatura inviata per la schermata di stato.
export async function submitCandidatura(payload) {
  const d = await j('./api/candidature', { method: 'POST', body: JSON.stringify(payload) });
  try { localStorage.setItem('gf_candidatura', JSON.stringify(d.candidatura || payload)); } catch (e) {}
  return d;
}
export function lastCandidatura() {
  try { return JSON.parse(localStorage.getItem('gf_candidatura') || 'null'); } catch (e) { return null; }
}
// Lista candidature (solo staff loggato).
export async function fetchCandidature() { const d = await j('./api/candidature'); return d.candidature || []; }
export async function updateCandidatura(id, patch) { return j('./api/candidature/' + id, { method: 'PUT', body: JSON.stringify(patch) }); }

// ---- Admin: pipeline produttori self-service (staff, cookie gf_sess via `j`) ----
// Lista COMPLETA (include bozze/in-verifica): lato staff il server non filtra. NON tocca lo stato globale
// (che resta la lista pubblica), così le viste utente non mostrano mai le bozze.
export async function adminProducers() { const d = await j('./api/producers'); return d.producers || []; }
export async function approveProducer(userId, name) { return j('./api/producer/approve', { method: 'POST', body: JSON.stringify({ userId, name }) }); }
export async function directUnlockProducer(userId, name) { return j('./api/producer/direct-unlock', { method: 'POST', body: JSON.stringify({ userId, name }) }); }
export async function verifyProducer(producerId, date, next) { return j('./api/producer/verify', { method: 'POST', body: JSON.stringify({ producerId, date, next }) }); }
export async function publishProducer(producerId) { return j('./api/producer/publish', { method: 'POST', body: JSON.stringify({ producerId }) }); }

// ---- Produttore self-service "La mia azienda" (piano 13) ----
// Endpoint utente-owner (cookie gf_user) via `ja` (credentials:'include'). Quando l'endpoint ritorna
// {user}, aggiorniamo state.user così il router/UI vedono subito il nuovo producerStatus.
export async function requestProducer(payload = {}) {
  const d = await ja('./api/producer/request', { method: 'POST', body: JSON.stringify(payload) });
  if (d.user) state.user = d.user; return d;
}
export async function getMyProducer() { return ja('./api/producer/me'); } // { status, producer, readiness }
export async function patchMyProducer(patch) { const d = await ja('./api/producer/me', { method: 'PATCH', body: JSON.stringify(patch) }); return d.producer; }
export async function addMyProduct(prod) { const d = await ja('./api/producer/me/products', { method: 'POST', body: JSON.stringify(prod) }); return d.producer; }
export async function updateMyProduct(pid, patch) { const d = await ja('./api/producer/me/products/' + pid, { method: 'PATCH', body: JSON.stringify(patch) }); return d.producer; }
export async function deleteMyProduct(pid) { return ja('./api/producer/me/products/' + pid, { method: 'DELETE' }); }
export async function uploadProducerMedia(dataUrl) { const d = await ja('./api/producer/me/media', { method: 'POST', body: JSON.stringify({ dataUrl }) }); return d.url; }
export async function submitMyProducer(payload = {}) { const d = await ja('./api/producer/me/submit', { method: 'POST', body: JSON.stringify(payload) }); if (d.user) state.user = d.user; return d; }
export async function setProductAvailability(pid, availability, returnsMonth) { return ja('./api/producer/me/availability/' + pid, { method: 'POST', body: JSON.stringify({ availability, returnsMonth }) }); }
