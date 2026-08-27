// Stato app + client API. Backend: /api/* (file-based ora, cloud poi). Fallback offline: data/producers.json.
// API_BASE vuoto = chiamate relative: in locale funziona, in produzione diventerà l'URL Render (es. 'https://gaia-food.onrender.com').
const API_BASE = '';
const state = {
  loaded: false, zone: null, categories: [], producers: [],
  query: '', category: null, radius: 15, role: null,
  user: null, // utente finale loggato (Google/email); null = nessuno (l'app è gated, niente ospite)
  saved: JSON.parse(localStorage.getItem('gf_saved') || '[]'),
  social: {
    scope: 'for-you', posts: [], context: null, status: 'idle', error: null,
    hasMore: false, nextOffset: null,
    stories: [], storiesStatus: 'idle', storiesError: null,
    suggestions: [], suggestionsStatus: 'idle', suggestionsError: null,
  },
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

// ---- Catalogo regionale (Scopri) ----
// Le schede pubblicate dopo una verifica hanno `socialLocation.region`, cioe' lo snapshot
// territoriale attestato dallo staff. I fallback servono soltanto per i record storici creati
// prima di quello snapshot; non assegnano mai un produttore alla regione scelta dal visitatore.
const LEGACY_ZONE_REGIONS = { 'alta-val-di-sangro': 'Abruzzo' };
const regionKey = (value) => String(value || '').trim().toLocaleLowerCase('it')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const ITALIAN_REGIONS = new Map([
  'Abruzzo', 'Basilicata', 'Calabria', 'Campania', 'Emilia-Romagna', 'Friuli-Venezia Giulia',
  'Lazio', 'Liguria', 'Lombardia', 'Marche', 'Molise', 'Piemonte', 'Puglia', 'Sardegna',
  'Sicilia', 'Toscana', 'Trentino-Alto Adige', 'Umbria', "Valle d'Aosta", 'Veneto',
].map(name => [regionKey(name), name]));
const categoriesOf = (p) => Array.isArray(p && p.categories) ? p.categories : [];
const distanceOf = (p) => {
  const raw = p && p.km;
  if (raw == null || raw === '') return Infinity;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : Infinity;
};

export function userRegion() {
  const u = state.user || {};
  const zone = u.zone;
  if (zone && typeof zone === 'object') {
    if (zone.region) return String(zone.region).trim();
    const legacy = LEGACY_ZONE_REGIONS[zone.id || zone.zoneId];
    if (legacy) return legacy;
    const named = ITALIAN_REGIONS.get(regionKey(zone.id)) || ITALIAN_REGIONS.get(regionKey(zone.label || zone.name));
    if (named) return named;
    return u.region ? String(u.region).trim() : '';
  }
  if (typeof zone === 'string') {
    return LEGACY_ZONE_REGIONS[zone] || ITALIAN_REGIONS.get(regionKey(zone)) || (u.region ? String(u.region).trim() : '');
  }
  return u.region ? String(u.region).trim() : '';
}

export function producerRegion(p) {
  if (!p || typeof p !== 'object') return '';
  const hasSnapshot = Object.prototype.hasOwnProperty.call(p, 'socialLocation');
  const snapshotRegion = hasSnapshot && p.socialLocation && p.socialLocation.region;
  if (snapshotRegion) return String(snapshotRegion).trim();
  const explicit = p.region
    || (p.territory && p.territory.region)
    || (p.location && p.location.region)
    || (p.zone && p.zone.region);
  if (explicit) return String(explicit).trim();
  // Uno snapshot presente ma senza regione non deve ereditare la vecchia zona seed.
  if (hasSnapshot) return '';
  const zoneId = p.zoneId || (p.location && p.location.zoneId) || (p.zone && (p.zone.id || p.zone.zoneId));
  if (zoneId) return LEGACY_ZONE_REGIONS[zoneId] || '';
  return LEGACY_ZONE_REGIONS[state.zone && state.zone.id] || '';
}

export function producersInUserRegion() {
  const wanted = regionKey(userRegion());
  if (!wanted) return [];
  return state.producers.filter((p) => regionKey(producerRegion(p)) === wanted);
}

function filterProducerList(list) {
  let r = list.slice();
  if (state.category) r = r.filter(p => categoriesOf(p).includes(state.category));
  if (state.query) {
    const q = regionKey(state.query);
    r = r.filter((p) => {
      const products = Array.isArray(p.products) ? p.products.flatMap(x => [x && x.name, x && x.label, x && x.category]) : [];
      const seasonal = Array.isArray(p.seasonal) ? p.seasonal.map(x => x && x.label) : [];
      return regionKey([p.name, p.place, ...categoriesOf(p), ...products, ...seasonal].filter(Boolean).join(' ')).includes(q);
    });
  }
  return r.sort((a, b) => distanceOf(a) - distanceOf(b)
    || String(a.name || '').localeCompare(String(b.name || ''), 'it', { sensitivity: 'base' }));
}

export function regionalResults() { return filterProducerList(producersInUserRegion()); }

export function results() {
  return filterProducerList(state.producers);
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
export async function adminLogin(password, name) { const d = await j('./api/login', { method: 'POST', body: JSON.stringify({ password, name }) }); state.role = d.role; return d.role; }
export async function adminLogout() { await fetch('./api/logout', { method: 'POST', credentials: 'same-origin' }); state.role = null; }
export async function createProducer(p) { const d = await j('./api/producers', { method: 'POST', body: JSON.stringify(p) }); await reloadData(); return d; }
export async function updateProducer(id, patch) { const d = await j('./api/producers/' + id, { method: 'PUT', body: JSON.stringify(patch) }); await reloadData(); return d; }
export async function deleteProducer(id) { await j('./api/producers/' + id, { method: 'DELETE' }); await reloadData(); }
export async function uploadPhoto(id, dataUrl) { const d = await j('./api/producers/' + id + '/photo', { method: 'POST', body: JSON.stringify({ dataUrl }) }); await reloadData(); return d; }

// ---- Auth utente finale (Google reale / email) ----
// credentials:'include' = il cookie httpOnly gf_user viaggia anche cross-origin (API su dominio separato in prod).
const ja = (url, opts = {}) => fetch(url, { headers: { 'Content-Type': 'application/json' }, credentials: 'include', ...opts }).then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) { const e = new Error(d.error || r.status); e.status = r.status; throw e; } return d; });

// ---- Rete Gaia · feed sociale locale ----
// Lo store conserva un solo feed alla volta: cambiando filtro la UI mostra subito lo skeleton e
// scarta le risposte arrivate in ritardo. Le mutazioni ritornano sempre il post canonico dal server.
const SOCIAL_SCOPES = new Set(['for-you', 'following', 'nearby', 'producers']);
const SOCIAL_KINDS = new Set(['question', 'tip', 'field', 'availability', 'story']);
let socialRequestSeq = 0;
let socialContextSeq = 0;
let socialStoriesRequestSeq = 0;
let socialSuggestionsRequestSeq = 0;

export const socialState = () => state.social;

function socialScope(scope) { return SOCIAL_SCOPES.has(scope) ? scope : 'for-you'; }
function socialIdentityOf(user) { return user ? String(user.id || user.email || '') : ''; }
function socialLocationOf(user) {
  if (!user) return '';
  const zone = user.zone;
  const zoneId = typeof zone === 'string' ? zone : (zone && (zone.id || zone.zoneId)) || '';
  const zoneLabel = typeof zone === 'object' && zone ? (zone.label || zone.name || '') : '';
  const zoneRegion = typeof zone === 'object' && zone ? (zone.region || '') : '';
  return JSON.stringify([user.city || '', user.region || '', zoneId, zoneLabel, zoneRegion]);
}
function socialPresentationOf(user) {
  if (!user) return '';
  return JSON.stringify([
    user.name || '', user.picture || '', user.producerId || '', user.producerStatus || '',
    user.role || '', user.status || '',
  ]);
}

// Invalida sia i dati visibili sia ogni risposta in volo. L'evento permette alla schermata
// di cancellare bozze locali senza accoppiare lo store ai dettagli della UI.
export function invalidateSocialState(reason = 'context') {
  socialRequestSeq += 1;
  socialContextSeq += 1;
  socialStoriesRequestSeq += 1;
  socialSuggestionsRequestSeq += 1;
  const scope = socialScope(state.social && state.social.scope);
  state.social = {
    scope, posts: [], context: null, status: 'idle', error: null,
    hasMore: false, nextOffset: null,
    stories: [], storiesStatus: 'idle', storiesError: null,
    suggestions: [], suggestionsStatus: 'idle', suggestionsError: null,
  };
  try { window.dispatchEvent(new CustomEvent('gf:social-context-changed', { detail: { reason } })); } catch (_) {}
  return state.social;
}
function assignUser(nextUser) {
  const previous = state.user;
  const next = nextUser || null;
  const identityChanged = socialIdentityOf(previous) !== socialIdentityOf(next);
  const locationChanged = socialLocationOf(previous) !== socialLocationOf(next);
  const presentationChanged = socialPresentationOf(previous) !== socialPresentationOf(next);
  state.user = next;
  if (identityChanged || locationChanged || presentationChanged) {
    invalidateSocialState(identityChanged ? 'identity' : (locationChanged ? 'location' : 'profile'));
  }
  return state.user;
}
function replaceSocialPost(post, { prepend = false } = {}) {
  if (!post || post.id == null) return post;
  const posts = state.social.posts || [];
  const at = posts.findIndex(p => String(p.id) === String(post.id));
  if (at >= 0) {
    if (!post.virality && posts[at] && posts[at].virality) post = { ...post, virality: posts[at].virality };
    posts.splice(at, 1, post);
  }
  else if (prepend) {
    const inScope = state.social.scope === 'for-you'
      || (state.social.scope === 'producers' && !!(post.author && post.author.type === 'producer'));
    if (inScope) posts.unshift(post);
  }
  return post;
}

function mergeSocialPosts(current, incoming) {
  const merged = [], seen = new Set();
  for (const post of [...(current || []), ...(incoming || [])]) {
    const id = String(post && post.id || '');
    if (!id || seen.has(id)) continue;
    seen.add(id); merged.push(post);
  }
  return merged;
}

export async function loadSocialFeed(scope = 'for-you', { force = false, append = false } = {}) {
  scope = socialScope(scope);
  if (!force && !append && state.social.scope === scope && state.social.status === 'ready') return state.social;
  if (append && (state.social.scope !== scope || !state.social.hasMore || state.social.status === 'loading')) return state.social;
  const seq = ++socialRequestSeq;
  const sameScope = state.social.scope === scope;
  const keepPosts = sameScope ? state.social.posts : [];
  const offset = append && sameScope ? (state.social.nextOffset == null ? keepPosts.length : state.social.nextOffset) : 0;
  state.social = { ...state.social, scope, posts: keepPosts, status: 'loading', error: null };
  try {
    const d = await ja('./api/social/feed?scope=' + encodeURIComponent(scope) + '&limit=20&offset=' + encodeURIComponent(offset));
    if (seq !== socialRequestSeq) return state.social;
    state.social = {
      ...state.social,
      scope,
      posts: append ? mergeSocialPosts(keepPosts, d.posts) : (Array.isArray(d.posts) ? d.posts : []),
      context: d.context || null,
      status: 'ready',
      error: null,
      hasMore: !!d.hasMore,
      nextOffset: Number.isInteger(d.nextOffset) ? d.nextOffset : null,
    };
    return state.social;
  } catch (error) {
    if (seq === socialRequestSeq) state.social = { ...state.social, scope, status: 'error', error };
    throw error;
  }
}

export async function loadSocialStories({ force = false } = {}) {
  if (!force && state.social.storiesStatus === 'ready') return state.social.stories;
  const seq = ++socialStoriesRequestSeq;
  state.social = { ...state.social, storiesStatus: 'loading', storiesError: null };
  try {
    const d = await ja('./api/social/stories');
    if (seq !== socialStoriesRequestSeq) return state.social.stories;
    state.social = { ...state.social, stories: Array.isArray(d.stories) ? d.stories : [], storiesStatus: 'ready', storiesError: null };
    return state.social.stories;
  } catch (error) {
    if (seq === socialStoriesRequestSeq) state.social = { ...state.social, storiesStatus: 'error', storiesError: error };
    throw error;
  }
}

export async function loadSocialSuggestions({ force = false } = {}) {
  if (!force && state.social.suggestionsStatus === 'ready') return state.social.suggestions;
  const seq = ++socialSuggestionsRequestSeq;
  state.social = { ...state.social, suggestionsStatus: 'loading', suggestionsError: null };
  try {
    const d = await ja('./api/social/suggestions?limit=5');
    if (seq !== socialSuggestionsRequestSeq) return state.social.suggestions;
    state.social = { ...state.social, suggestions: Array.isArray(d.suggestions) ? d.suggestions : [], suggestionsStatus: 'ready', suggestionsError: null };
    return state.social.suggestions;
  } catch (error) {
    if (seq === socialSuggestionsRequestSeq) state.social = { ...state.social, suggestionsStatus: 'error', suggestionsError: error };
    throw error;
  }
}

export async function loadSocialSurface({ force = false } = {}) {
  return Promise.allSettled([loadSocialStories({ force }), loadSocialSuggestions({ force })]);
}

export async function searchSocial(query, { limit = 20, signal } = {}) {
  const q = String(query == null ? '' : query).trim();
  const safeLimit = Math.max(1, Math.min(30, Number.isFinite(Number(limit)) ? Math.trunc(Number(limit)) : 20));
  return ja('./api/social/search?q=' + encodeURIComponent(q) + '&limit=' + encodeURIComponent(safeLimit), { signal });
}

export async function uploadSocialMedia(dataUrl, { signal } = {}) {
  return ja('./api/social/media', { method: 'POST', body: JSON.stringify({ dataUrl }), signal });
}

export async function createSocialPost({ text, kind = 'question', mediaRefs = [] }, { signal } = {}) {
  const contextSeq = socialContextSeq;
  const cleanKind = SOCIAL_KINDS.has(kind) ? kind : 'question';
  const refs = Array.isArray(mediaRefs) ? mediaRefs.filter(Boolean).slice(0, 10) : [];
  const d = await ja('./api/social/posts', { method: 'POST', body: JSON.stringify({ text, kind: cleanKind, mediaRefs: refs }), signal });
  return contextSeq === socialContextSeq ? replaceSocialPost(d.post, { prepend: true }) : d.post;
}

export async function createSocialStory({ text, mediaRef = null }, { signal } = {}) {
  const contextSeq = socialContextSeq;
  const d = await ja('./api/social/stories', { method: 'POST', body: JSON.stringify({ text, mediaRef: mediaRef || undefined }), signal });
  if (contextSeq === socialContextSeq && d.story) {
    state.social.stories = [d.story, ...(state.social.stories || []).filter(story => String(story.id) !== String(d.story.id))];
  }
  return d.story;
}

function replaceSocialStory(story) {
  if (!story || story.id == null) return story;
  const at = (state.social.stories || []).findIndex(item => String(item.id) === String(story.id));
  if (at >= 0) state.social.stories.splice(at, 1, story);
  return story;
}

function setFollowingAuthor(authorId, following) {
  const id = String(authorId || '');
  const patchAuthor = (item) => {
    if (!item || String(item.author && item.author.id || '') !== id) return;
    item.viewer = { ...(item.viewer || {}), followingAuthor: following };
  };
  (state.social.posts || []).forEach(patchAuthor);
  (state.social.stories || []).forEach(patchAuthor);
  (state.social.suggestions || []).forEach((item) => {
    if (String(item && item.author && item.author.id || '') === id) item.following = following;
  });
}

export async function followSocialAuthor(authorId, following = true) {
  const contextSeq = socialContextSeq;
  const id = encodeURIComponent(String(authorId || ''));
  const d = await ja('./api/social/authors/' + id + '/follow', { method: following ? 'PUT' : 'DELETE', body: '{}' });
  if (contextSeq === socialContextSeq) setFollowingAuthor(d.authorId || authorId, !!d.following);
  return d;
}

export async function viewSocialStory(id) {
  const contextSeq = socialContextSeq;
  const d = await ja('./api/social/stories/' + encodeURIComponent(id) + '/view', { method: 'POST', body: '{}' });
  return contextSeq === socialContextSeq ? replaceSocialStory(d.story) : d.story;
}

export async function reportSocialStory(id) {
  const contextSeq = socialContextSeq;
  const d = await ja('./api/social/stories/' + encodeURIComponent(id) + '/report', { method: 'POST', body: '{}' });
  if (contextSeq === socialContextSeq) {
    state.social.stories = (state.social.stories || []).filter(item => String(item.id) !== String(id));
  }
  return d;
}

export async function deleteSocialStory(id) {
  const contextSeq = socialContextSeq;
  const d = await ja('./api/social/stories/' + encodeURIComponent(id), { method: 'DELETE' });
  if (contextSeq === socialContextSeq) {
    state.social.stories = (state.social.stories || []).filter(item => String(item.id) !== String(id));
  }
  return d;
}

export async function likeSocialPost(id) {
  const contextSeq = socialContextSeq;
  const d = await ja('./api/social/posts/' + encodeURIComponent(id) + '/like', { method: 'POST', body: '{}' });
  return contextSeq === socialContextSeq ? replaceSocialPost(d.post) : d.post;
}
export async function saveSocialPost(id) {
  const contextSeq = socialContextSeq;
  const d = await ja('./api/social/posts/' + encodeURIComponent(id) + '/save', { method: 'POST', body: '{}' });
  return contextSeq === socialContextSeq ? replaceSocialPost(d.post) : d.post;
}
export async function commentSocialPost(id, text) {
  const contextSeq = socialContextSeq;
  const d = await ja('./api/social/posts/' + encodeURIComponent(id) + '/comments', { method: 'POST', body: JSON.stringify({ text }) });
  return contextSeq === socialContextSeq ? replaceSocialPost(d.post) : d.post;
}
export async function shareSocialPost(id) {
  const contextSeq = socialContextSeq;
  const d = await ja('./api/social/posts/' + encodeURIComponent(id) + '/share', { method: 'POST', body: '{}' });
  return contextSeq === socialContextSeq ? replaceSocialPost(d.post) : d.post;
}
export async function reportSocialPost(id) {
  const contextSeq = socialContextSeq;
  const d = await ja('./api/social/posts/' + encodeURIComponent(id) + '/report', { method: 'POST', body: '{}' });
  if (contextSeq === socialContextSeq) {
    state.social.posts = (state.social.posts || []).filter(item => String(item.id) !== String(id));
  }
  return d;
}

export async function deleteSocialPost(id) {
  const contextSeq = socialContextSeq;
  const d = await ja('./api/social/posts/' + encodeURIComponent(id), { method: 'DELETE' });
  if (contextSeq === socialContextSeq) {
    state.social.posts = (state.social.posts || []).filter(item => String(item.id) !== String(id));
  }
  return d;
}

// "Seme" del referral: se l'app è aperta con ?seme=<codice> (nell'URL o nell'hash), lo ricordiamo
// per collegare l'iscrizione all'invitante (Custodi). Catturato una volta al caricamento del modulo.
try {
  const q = new URLSearchParams(location.search.slice(1));
  const hq = new URLSearchParams((location.hash.split('?')[1]) || '');
  const seme = (q.get('seme') || hq.get('seme') || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60);
  if (seme) localStorage.setItem('gf_seed', seme);
} catch (_) {}
export const getSeed = () => { try { return localStorage.getItem('gf_seed') || ''; } catch { return ''; } };

// Dopo OGNI login va riletto lo staff-role (l'utente potrebbe essere admin/verificatore):
// altrimenti la tab "Gestione"/"Verifica" non compare finché non si ricarica la pagina.
async function syncRole() { try { const m = await j('./api/me'); state.role = m.role; } catch { state.role = null; } return state.role; }
export async function signInWithGoogle(idToken) { const d = await ja('./api/auth/google', { method: 'POST', body: JSON.stringify({ idToken, seme: getSeed() }) }); assignUser(d.user); await syncRole(); return d.user; }
// Email + password: login e registrazione (auth v2).
export async function loginPassword(email, password) { const d = await ja('./api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }); assignUser(d.user); await syncRole(); return d.user; }
export async function registerPassword(email, password) { const d = await ja('./api/auth/register', { method: 'POST', body: JSON.stringify({ email, password, seme: getSeed() }) }); assignUser(d.user); await syncRole(); return d.user; }
// Dati della sezione "I Custodi di Gaia" (seme, persone portate, credito, livello) dell'utente loggato.
export async function custodiMe() { return ja('./api/custodi/me'); }
export async function authMe() { try { const d = await ja('./api/auth/me'); assignUser(d.user); return d.user; } catch (e) { assignUser(null); return null; } }
// Google client id dal server (env GF_GOOGLE_CLIENT_ID). Vuoto = login Google non configurato.
export async function authConfig() { try { return await ja('./api/auth/config'); } catch (e) { return { googleClientId: '' }; } }
export async function signOut() { try { await ja('./api/auth/logout', { method: 'POST' }); } catch (e) {} assignUser(null); state.role = null; }
export const currentUser = () => state.user;

// ---- Regione/Zona dell'utente (onboarding "alla Glovo") ----
// setZone: persiste la zona scelta sul profilo utente. L'endpoint PUT /api/auth/profile {zone} -> {user}
// è aggiunto a parte lato server; qui lo ASSUMIAMO esistente. Usa API_BASE per essere pronto al deploy.
export async function setZone(zone) {
  const d = await ja(`${API_BASE}/api/auth/profile`, { method: 'PUT', body: JSON.stringify({ zone }) });
  assignUser(d.user || { ...(state.user || {}), zone });
  return state.user;
}
// Aggiorna i dati del profilo (nome, città, lingua, notifiche): solo i campi passati.
export async function updateProfile(fields) {
  const d = await ja(`${API_BASE}/api/auth/profile`, { method: 'PATCH', body: JSON.stringify(fields) });
  assignUser(d.user); return state.user;
}
// Carica un avatar (dataURL base64) per l'utente loggato → aggiorna user.picture.
export async function uploadAvatar(dataUrl) {
  const d = await ja(`${API_BASE}/api/auth/avatar`, { method: 'POST', body: JSON.stringify({ dataUrl }) });
  assignUser(d.user); return state.user;
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

// ---- Gestione utenti & Inviti (admin via account, cookie gf_user → `ja`) ----
export async function adminListUsers() { return ja('./api/admin/users'); } // { users, invites, owners }
export async function adminSetLevel(userId, level) { return ja('./api/admin/users/level', { method: 'POST', body: JSON.stringify({ userId, level }) }); }
export async function adminDeleteUser(userId) { return ja('./api/admin/users?id=' + encodeURIComponent(userId), { method: 'DELETE' }); }
export async function adminCreateInvite(email, level) { return ja('./api/admin/invites', { method: 'POST', body: JSON.stringify({ email, level }) }); }
export async function adminRevokeInvite(token) { return ja('./api/admin/invites?token=' + encodeURIComponent(token), { method: 'DELETE' }); }
export async function adminListSocialModeration({ status = 'pending', signal } = {}) {
  const queueStatus = status === 'pending' ? status : 'pending';
  return ja('./api/admin/social/moderation?status=' + encodeURIComponent(queueStatus), { signal });
}
export async function adminResolveSocialModeration(type, id, decision, { signal } = {}) {
  const itemType = type === 'story' ? 'story' : 'post';
  const outcome = decision === 'remove' ? 'remove' : 'keep';
  return ja('./api/admin/social/moderation/resolve', {
    method: 'POST', signal, body: JSON.stringify({ type: itemType, id: String(id || ''), decision: outcome }),
  });
}
export async function inviteInfo(token) { return ja('./api/invite/' + encodeURIComponent(token)); }
export async function acceptInvite(token) { const d = await ja('./api/invite/' + encodeURIComponent(token) + '/accept', { method: 'POST' }); if (d.user) assignUser(d.user); await syncRole(); return d; }

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
// Notifica in-app: c'è una tappa positiva non ancora vista (area sbloccata / scheda pubblicata)?
// Ritorna lo stato ('approved'|'published') se è una novità, altrimenti null. Si "consuma" aprendo l'area.
export function producerStatusNotice() {
  const u = state.user; if (!u || !u.producerStatus) return null;
  let seen = ''; try { seen = localStorage.getItem('gf_prodSeen') || ''; } catch (_) {}
  const milestones = { approved: 1, published: 1 };
  return (u.producerStatus !== seen && milestones[u.producerStatus]) ? u.producerStatus : null;
}
export function markProducerSeen() {
  const u = state.user; if (u && u.producerStatus) { try { localStorage.setItem('gf_prodSeen', u.producerStatus); } catch (_) {} }
}
