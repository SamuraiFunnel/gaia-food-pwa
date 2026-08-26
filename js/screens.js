import { Icon } from './icons.js';
import { StatusBar, Photo, VerifyBadge, ProducerCard, VideoBlock, BottomNav, catGlyph, catLabel, Lockup, toast } from './components.js';
import { getState, results, regionalResults, producersInUserRegion, userRegion, producerById, toggleSaved, hubSeen, lastFunction, resetHub, currentUser, userZone, updateProfile, uploadAvatar, signOut, producerStatusNotice, socialState, loadSocialFeed, createSocialPost, likeSocialPost, saveSocialPost, commentSocialPost } from './store.js';
import { t, getLang, setLang, LANGS, locDate } from './i18n.js';

// Escape HTML a livello modulo (per valori dinamici inseriti nell'HTML, es. nome del verificatore).
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Avatar utente: mostra la foto (URL Google o path caricato) se c'è, altrimenti l'iniziale.
function avatarSrc(u) {
  const p = u && u.picture;
  if (!p) return '';
  return /^https?:\/\//.test(p) ? p : './' + String(p).replace(/^\.?\//, '');
}
function avatarInner(u, name) {
  const src = avatarSrc(u);
  return src ? `<img src="${src}" alt="" loading="lazy" onerror="this.remove()">` : (String(name || 'U').trim()[0] || 'U').toUpperCase();
}
// Bottom-sheet di scelta lingua (riusa gli stili .sheet globali).
function openLangSheet() {
  const back = document.createElement('div'); back.className = 'sheet-backdrop';
  back.setAttribute('role', 'dialog'); back.setAttribute('aria-modal', 'true');
  back.innerHTML = `<div class="sheet"><div class="handle"></div>
    <div class="sh-title">${t('settings.chooseLanguage')}</div>
    <div style="margin-top:6px">${LANGS.map(l => `<button type="button" class="lang-row" data-lang="${l.code}"
      style="display:flex;align-items:center;gap:12px;width:100%;text-align:left;background:${l.code === getLang() ? 'var(--verde-pale)' : 'none'};border:none;border-radius:12px;padding:14px 12px;cursor:pointer;font-family:inherit">
      <span style="font-size:20px">${l.flag}</span><span style="flex:1;font-size:15px;font-weight:600;color:var(--ink)">${l.label}</span>
      ${l.code === getLang() ? Icon('check-circle', { size: 18, color: 'var(--verde)' }) : ''}</button>`).join('')}</div></div>`;
  const close = () => back.remove();
  back.onclick = (e) => { if (e.target === back) close(); };
  back.querySelectorAll('[data-lang]').forEach(b => b.onclick = async () => {
    const code = b.dataset.lang; close();
    await setLang(code);                                   // ridisegna nella nuova lingua
    try { if (currentUser()) updateProfile({ lang: code }); } catch (_) {}  // best-effort (multi-dispositivo)
  });
  document.getElementById('app').appendChild(back);
}

const km = n => String(n).replace('.', ',');

/* ---------------- SPLASH ----------------
   App "alla Glovo": nessun ospite. Se l'utente è loggato → entra nell'app
   (#/hub la prima volta, poi l'ultima funzione usata). Altrimenti → accesso.
   Il gating del router (main.js) è la rete di sicurezza: qui scegliamo solo la destinazione. */
export function Splash() {
  const logged = !!currentUser();
  const hasZone = !!userZone();
  const dest = (logged && hasZone) ? (hubSeen() ? lastFunction() : '#/hub') : null;
  const ctaLabel = logged
    ? `${Icon('arrow-right', { size: 18, color: '#fff' })} ${t('splash.ctaEnter')}`
    : `${Icon('user', { size: 18, color: '#fff' })} ${t('splash.ctaLogin')}`;
  // Non loggato → apri il POP-UP di accesso; loggato senza zona → pop-up allo step zona;
  // loggato con zona → entra direttamente. Niente più pagina intera #/registrati.
  const cta = (logged && hasZone)
    ? `<a class="s02-cta" href="${dest}">${ctaLabel}</a>`
    : `<button class="s02-cta" type="button" data-open-auth="${logged ? 'zone' : 'auth'}">${ctaLabel}</button>`;
  return {
    html: `<div class="splash s02">
      <style>
      /* SPLASH · "Split netto". MOBILE: foto sopra + blocco carta sotto (logo, headline serif, 1 CTA).
         DESKTOP(≥1024): testo su carta a sinistra, foto piena a destra. Niente scroll (100dvh). Scope: .s02. */
      .s02{ min-height:100vh; min-height:100dvh; display:flex; flex-direction:column; overflow:hidden; background:var(--carta); }
      .s02 .s02-ph{ position:relative; flex:1 1 auto; min-height:40dvh; overflow:hidden; }
      .s02 .s02-ph .photo{ position:absolute; inset:0; width:100%; height:100%; border-radius:0; }
      .s02 .s02-fade{ position:absolute; inset:0; z-index:1;
        background:linear-gradient(180deg, rgba(10,16,10,.12) 0%, rgba(244,241,235,0) 42%, var(--carta) 100%); }
      .s02 .s02-body{ position:relative; z-index:2; flex:none; display:flex; flex-direction:column;
        padding:6px 26px calc(env(safe-area-inset-bottom, 0px) + 26px); }
      .s02 .s02-logo{ font-size:22px; margin:0 0 16px; }
      .s02 .s02-eyebrow{ font-size:11px; font-weight:700; letter-spacing:.2em; text-transform:uppercase;
        color:var(--verde-deep); display:inline-flex; align-items:center; gap:8px; }
      .s02 .s02-eyebrow::before{ content:''; width:15px; height:1.5px; background:var(--verde); border-radius:2px; }
      .s02 .s02-title{ font-family:var(--serif); font-size:34px; font-weight:600; letter-spacing:-.02em;
        line-height:1.08; margin:12px 0 12px; color:var(--ink); }
      .s02 .s02-title em{ font-style:italic; color:var(--verde); }
      .s02 .s02-sub{ font-size:14px; line-height:1.6; color:var(--muted); max-width:34ch; }
      .s02 .s02-cta{ margin-top:20px; width:100%; display:flex; align-items:center; justify-content:center;
        gap:10px; padding:16px; border-radius:16px; background:var(--grad-azione); color:#fff;
        font-family:var(--sans); font-size:15.5px; font-weight:600; text-decoration:none;
        border:none; cursor:pointer; box-shadow:0 14px 30px -14px rgba(22,163,74,.7); }
      .s02 .s02-cta:active{ transform:translateY(1px); }
      /* DESKTOP: split netto — testo sinistra su carta, foto piena destra */
      @media(min-width:1024px){
        .s02{ flex-direction:row; }
        .s02 .s02-body{ order:0; width:46%; min-width:440px; max-width:680px; justify-content:center; padding:64px 68px; }
        .s02 .s02-ph{ order:1; width:54%; flex:1 1 auto; min-height:100dvh; }
        .s02 .s02-fade{ background:none; }
        .s02 .s02-logo{ position:absolute; top:46px; left:68px; margin:0; }
        .s02 .s02-title{ font-size:54px; margin:16px 0 16px; }
        .s02 .s02-sub{ font-size:16.5px; max-width:40ch; }
        .s02 .s02-cta{ width:auto; align-self:flex-start; padding:18px 36px; font-size:16.5px; }
      }
      @media(prefers-reduced-motion:reduce){ .s02 *{ transition:none !important; } }
      </style>
      <div class="s02-ph">
        ${Photo('paesaggio', '', '')}
        <div class="s02-fade"></div>
      </div>
      <div class="s02-body">
        <div class="s02-logo">${Lockup('')}</div>
        <span class="s02-eyebrow">${logged ? t('splash.eyebrowBack') : t('splash.eyebrowNew')}</span>
        <h1 class="s02-title">${t('splash.title1')}<br><em>${t('splash.title2')}</em></h1>
        <p class="s02-sub">${logged ? t('splash.subLogged') : t('splash.subNew')}</p>
        ${cta}
      </div>
    </div>`,
  };
}

/* ---------------- HOME / SCOPRI · ELENCO ESSENZIALE ----------------
   Catalogo per REGIONE: la distanza ordina, ma non esclude nessuna scheda della regione scelta. */
let directorySort = 'distance';

const directoryDistance = (p) => {
  const raw = p && p.km;
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

function sortDirectory(list, mode) {
  const collator = new Intl.Collator(getLang(), { sensitivity: 'base' });
  return list.slice().sort((a, b) => {
    if (mode === 'name') return collator.compare(a.name || '', b.name || '');
    const ad = directoryDistance(a), bd = directoryDistance(b);
    if (ad == null && bd == null) return collator.compare(a.name || '', b.name || '');
    if (ad == null) return 1;
    if (bd == null) return -1;
    return ad - bd || collator.compare(a.name || '', b.name || '');
  });
}

function directoryCategoryLabel(p, categories) {
  const byId = new Map((categories || []).map(c => [c.id, c]));
  const labels = (Array.isArray(p.categories) ? p.categories : []).map(id => catLabel(byId.get(id) || id));
  return labels.join(', ') || t('home.unknownCategory');
}

function DirectoryThumb(p) {
  const tone = esc(p.tone || 'paesaggio');
  const image = p.photo
    ? `<img src="${esc(p.photo)}" alt="" width="132" height="116" loading="lazy" decoding="async" onerror="this.remove()">`
    : '';
  return `<div class="photo discover-thumb" data-tone="${tone}">${image}<div class="pgrain"></div></div>`;
}

function DirectoryRow(p, categories) {
  const distance = directoryDistance(p);
  const place = p.place || (p.socialLocation && p.socialLocation.city) || userRegion();
  const status = p.verify
    ? VerifyBadge(p.verify, { compact: true })
    : `<span class="discover-verification-missing">${Icon('info', { size: 13 })}<span>${t('home.verificationUnavailable')}</span></span>`;
  return `<a class="discover-row" href="#/produttore/${esc(p.id)}" data-link>
    ${DirectoryThumb(p)}
    <span class="discover-identity"><strong>${esc(p.name)}</strong><span>${esc(place)}</span></span>
    <span class="discover-category">${esc(directoryCategoryLabel(p, categories))}</span>
    <span class="discover-status">${status}</span>
    <span class="discover-distance tnum">${distance == null ? t('home.distanceUnavailable') : `${km(distance)} km`}</span>
    <span class="discover-arrow">${Icon('chevron-right', { size: 18, color: 'var(--faint)' })}</span>
  </a>`;
}

function directoryFilteredEmpty() {
  return `<div class="discover-empty compact" role="status">
    <span class="discover-empty-icon">${Icon('search', { size: 24, color: 'var(--terra-deep)' })}</span>
    <h2>${t('home.emptyFiltersTitle')}</h2>
    <p>${t('home.emptyFiltersBody')}</p>
    <button class="btn btn-outline" type="button" data-reset-discover>${t('home.clearFilters')}</button>
  </div>`;
}

function syncDirectoryFilters(el) {
  const s = getState();
  el.querySelectorAll('[data-cat]').forEach((button) => {
    const active = (button.dataset.cat || null) === (s.category || null);
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function paintDirectory(el) {
  const s = getState();
  const all = producersInUserRegion();
  const hasDistance = all.some(p => directoryDistance(p) != null);
  if (!hasDistance && directorySort === 'distance') directorySort = 'name';
  const list = sortDirectory(regionalResults(), directorySort);
  const count = el.querySelector('[data-discover-count]');
  const rows = el.querySelector('[data-discover-list]');
  const clear = el.querySelector('[data-clear-search]');
  if (count) count.textContent = t('home.resultsCount', { shown: list.length, total: all.length });
  if (clear) clear.hidden = !s.query;
  if (rows) {
    rows.innerHTML = list.length ? list.map(p => DirectoryRow(p, s.categories)).join('') : directoryFilteredEmpty();
    const reset = rows.querySelector('[data-reset-discover]');
    if (reset) reset.onclick = () => {
      s.query = ''; s.category = null;
      const q = el.querySelector('[data-discover-search]'); if (q) q.value = '';
      syncDirectoryFilters(el); paintDirectory(el);
      const target = q || el.querySelector('[data-cat=""]'); if (target) target.focus();
    };
  }
}

export function Home() {
  const s = getState();
  const regionName = userRegion();
  const all = producersInUserRegion();
  const presentCategories = (s.categories || []).filter(c => all.some(p => Array.isArray(p.categories) && p.categories.includes(c.id)));
  if (s.category && !presentCategories.some(c => c.id === s.category)) s.category = null;
  const hasDistance = all.some(p => directoryDistance(p) != null);
  if (!hasDistance && directorySort === 'distance') directorySort = 'name';
  const list = sortDirectory(regionalResults(), directorySort);
  const filters = [
    `<button class="discover-filter ${s.category ? '' : 'active'}" type="button" data-cat="" aria-pressed="${String(!s.category)}"><span>${t('home.allCategories')}</span><b class="tnum">${all.length}</b></button>`,
    ...presentCategories.map(c => {
      const n = all.filter(p => Array.isArray(p.categories) && p.categories.includes(c.id)).length;
      return `<button class="discover-filter ${s.category === c.id ? 'active' : ''}" type="button" data-cat="${esc(c.id)}" aria-pressed="${String(s.category === c.id)}">${Icon(c.glyph, { size: 15 })}<span>${esc(catLabel(c))}</span><b class="tnum">${n}</b></button>`;
    }),
  ].join('');
  const regionTitle = regionName
    ? t('home.directoryTitle', { region: `<em>${esc(regionName)}</em>` })
    : t('home.directoryTitleNoRegion');
  const topLabel = regionName || t('home.regionFallback');
  const noRegion = `<div class="discover-empty">
    <span class="discover-empty-icon">${Icon('map-pin', { size: 28, color: 'var(--verde-deep)' })}</span>
    <h2>${t('home.noRegionTitle')}</h2><p>${t('home.noRegionBody')}</p>
    <button class="btn btn-outline" type="button" data-open-auth="zone">${Icon('map-pin', { size: 17 })}${t('home.chooseRegion')}</button>
  </div>`;
  const noProducers = `<div class="discover-empty">
    <span class="discover-empty-icon">${Icon('sprout', { size: 28, color: 'var(--verde-deep)' })}</span>
    <h2>${t('home.emptyRegionTitle', { region: esc(regionName) })}</h2><p>${t('home.emptyRegionBody')}</p>
    <button class="btn btn-outline" type="button" data-open-auth="zone">${Icon('settings', { size: 17 })}${t('home.changeRegion')}</button>
  </div>`;

  return {
    html: `<div class="screen home home-directory">
      ${StatusBar()}
      <div class="toprow">
        <button class="loc" type="button" data-open-auth="zone" aria-label="${t('home.changeRegion')}">${Icon('map-pin', { size: 16, color: 'var(--verde)' })}<b>${esc(topLabel)}</b>${Icon('chevron-down', { size: 14, color: 'var(--faint)' })}</button>
        <a class="iconbtn" href="#/profilo" data-link aria-label="${t('nav.tu')}">${Icon('user', { size: 18 })}</a>
      </div>
      <div class="scroll discover-scroll">
        <main class="discover-shell">
          <header class="discover-head">
            <span class="discover-eyebrow">${Icon('compass', { size: 14 })}${t('home.catalogEyebrow')}</span>
            <h1 class="discover-title">${regionTitle}</h1>
            <p>${t('home.directoryBody')}</p>
            ${regionName && all.length ? `<div class="discover-toolbar">
              <div class="discover-search">
                ${Icon('search', { size: 19, color: 'var(--terra-deep)' })}
                <input type="search" data-discover-search aria-label="${t('home.searchAria')}" placeholder="${t('home.searchPlaceholder')}" value="${esc(s.query)}" autocomplete="off">
                <button type="button" data-clear-search aria-label="${t('home.clearSearch')}"${s.query ? '' : ' hidden'}>${Icon('x', { size: 17 })}</button>
              </div>
              <label class="discover-sort">${Icon('sliders', { size: 17, color: 'var(--terra-deep)' })}<span class="sr-only">${t('home.sortAria')}</span>
                <select data-discover-sort aria-label="${t('home.sortAria')}">
                  ${hasDistance ? `<option value="distance"${directorySort === 'distance' ? ' selected' : ''}>${t('home.sortDistance')}</option>` : ''}
                  <option value="name"${directorySort === 'name' ? ' selected' : ''}>${t('home.sortName')}</option>
                </select>${Icon('chevron-down', { size: 14, color: 'var(--faint)' })}
              </label>
            </div>` : ''}
          </header>
          ${!regionName ? noRegion : (!all.length ? noProducers : `<div class="discover-layout">
            <aside class="discover-categories" aria-label="${t('home.categoryAria')}">${filters}</aside>
            <section class="discover-results" aria-labelledby="discover-results-title">
              <div class="discover-results-head"><h2 id="discover-results-title">${t('home.resultsTitle')}</h2><span class="tnum" role="status" aria-live="polite" data-discover-count>${t('home.resultsCount', { shown: list.length, total: all.length })}</span></div>
              <div class="discover-row-head" aria-hidden="true"><span></span><span>${t('home.columnProducer')}</span><span>${t('home.columnCategory')}</span><span>${t('home.columnStatus')}</span><span>${t('home.columnDistance')}</span><span></span></div>
              <div class="discover-list" data-discover-list>${list.length ? list.map(p => DirectoryRow(p, s.categories)).join('') : directoryFilteredEmpty()}</div>
            </section>
          </div>`)}
        </main>
        <div class="discover-bottom-space" aria-hidden="true"></div>
      </div>
      ${BottomNav('scopri')}
    </div>`,
    onMount(el) {
      const q = el.querySelector('[data-discover-search]');
      if (q) q.oninput = () => { s.query = q.value; paintDirectory(el); };
      const clear = el.querySelector('[data-clear-search]');
      if (clear) clear.onclick = () => { s.query = ''; q.value = ''; q.focus(); paintDirectory(el); };
      const sort = el.querySelector('[data-discover-sort]');
      if (sort) sort.onchange = () => { directorySort = sort.value === 'name' ? 'name' : 'distance'; paintDirectory(el); };
      el.querySelectorAll('[data-cat]').forEach(button => button.onclick = () => {
        s.category = button.dataset.cat || null; syncDirectoryFilters(el); paintDirectory(el);
      });
      const reset = el.querySelector('[data-reset-discover]');
      if (reset) reset.onclick = () => {
        s.query = ''; s.category = null; if (q) q.value = ''; syncDirectoryFilters(el); paintDirectory(el);
        const target = q || el.querySelector('[data-cat=""]'); if (target) target.focus();
      };
    },
  };
}

/* ---------------- RETE GAIA / COMUNITÀ ----------------
   Una piazza editoriale local-first: persone e produttori si incontrano intorno al cibo.
   La quantità di pubblicazione non è un segnale di merito: utilità, relazione e vicinanza sì. */
let communityScope = 'for-you';
let communityDraft = '';
let communityKind = 'question';
const communityOpenComments = new Set();
const communityCommentDrafts = new Map();
const SOCIAL_KINDS = ['question', 'tip', 'field', 'availability', 'story'];
const SOCIAL_KIND_ICONS = { question: 'message-circle', tip: 'sprout', field: 'leaf', availability: 'calendar', story: 'heart' };
const SOCIAL_KIND_KEYS = { question: 'social.kind.question', tip: 'social.kind.tip', field: 'social.kind.field', availability: 'social.kind.availability', story: 'social.kind.story' };
const SOCIAL_LOCALITY_KEYS = { city: 'social.locality.city', zone: 'social.locality.zone', region: 'social.locality.region', other: 'social.locality.other' };
const SOCIAL_FILTER_KEYS = { 'for-you': 'social.filter.for-you', nearby: 'social.filter.nearby', producers: 'social.filter.producers' };
const SOCIAL_EMPTY_KEYS = {
  'for-you': ['social.empty.for-you.title', 'social.empty.for-you.body'],
  nearby: ['social.empty.nearby.title', 'social.empty.nearby.body'],
  producers: ['social.empty.producers.title', 'social.empty.producers.body'],
};

function clearCommunityDrafts() {
  communityDraft = '';
  communityKind = 'question';
  communityOpenComments.clear();
  communityCommentDrafts.clear();
}
try { window.addEventListener('gf:social-context-changed', clearCommunityDrafts); } catch (_) {}

// `rerender()` ricrea l'intera schermata. Prima di usarlo per una micro-azione salviamo quindi
// lo scroll del contenitore e il controllo attivo; dopo il render lo stesso controllo torna nello
// stesso punto visivo. È importante soprattutto quando un nuovo commento allunga la card.
const SOCIAL_FOCUS_SELECTORS = {
  draft: '[data-social-draft]',
  kind: '[data-social-kind]',
  publish: '[data-social-publish]',
  scope: '[data-social-scope]',
  retry: '[data-social-retry]',
  like: '[data-social-like]',
  comments: '[data-social-comments]',
  save: '[data-social-save]',
  'comment-input': '[data-social-comment-input]',
  'comment-submit': '[data-social-comment-submit]',
};
function socialFocusRef(screen, fallback = null) {
  const active = document.activeElement;
  if (active && screen && screen.contains(active)) {
    const entry = Object.entries(SOCIAL_FOCUS_SELECTORS).find(([, selector]) => active.matches(selector));
    if (entry) {
      const card = active.closest('[data-social-post]');
      return {
        action: entry[0],
        postId: card ? card.dataset.socialPost : '',
        scope: active.dataset.socialScope || '',
        selectionStart: typeof active.selectionStart === 'number' ? active.selectionStart : null,
        selectionEnd: typeof active.selectionEnd === 'number' ? active.selectionEnd : null,
      };
    }
  }
  return fallback;
}
function socialFocusElement(screen, ref) {
  if (!screen || !ref || !SOCIAL_FOCUS_SELECTORS[ref.action]) return null;
  let owner = screen;
  if (ref.postId) {
    owner = [...screen.querySelectorAll('[data-social-post]')]
      .find(card => card.dataset.socialPost === String(ref.postId));
  }
  if (!owner) return null;
  const candidates = [...owner.querySelectorAll(SOCIAL_FOCUS_SELECTORS[ref.action])];
  return ref.action === 'scope' && ref.scope
    ? candidates.find(button => button.dataset.socialScope === ref.scope) || null
    : candidates[0] || null;
}
function rerenderCommunity(fallbackFocus = null) {
  const screen = document.querySelector('#app .social-screen');
  const scroller = screen && screen.querySelector('.scroll');
  const scrollTop = scroller ? scroller.scrollTop : 0;
  const focusRef = socialFocusRef(screen, fallbackFocus);
  const anchor = socialFocusElement(screen, focusRef);
  const anchorTop = anchor ? anchor.getBoundingClientRect().top : null;

  rerender();

  const nextScreen = document.querySelector('#app .social-screen');
  const nextScroller = nextScreen && nextScreen.querySelector('.scroll');
  if (nextScroller) nextScroller.scrollTop = scrollTop;
  const nextFocus = socialFocusElement(nextScreen, focusRef);
  if (!nextFocus) return;
  if (nextScroller && anchorTop != null) {
    nextScroller.scrollTop += nextFocus.getBoundingClientRect().top - anchorTop;
  }
  try { nextFocus.focus({ preventScroll: true }); } catch (_) { nextFocus.focus(); }
  if (focusRef.selectionStart != null && typeof nextFocus.setSelectionRange === 'function') {
    const end = focusRef.selectionEnd == null ? focusRef.selectionStart : focusRef.selectionEnd;
    try { nextFocus.setSelectionRange(focusRef.selectionStart, end); } catch (_) {}
  }
}

function socialSafeUrl(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.startsWith('//')) return '';
  try {
    const u = new URL(raw, location.origin);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return esc(raw);
  } catch (_) { return ''; }
}
function socialAvatar(author = {}, cls = '') {
  const name = String(author.name || t('social.member'));
  const initial = esc((name.trim()[0] || 'G').toUpperCase());
  const picture = socialSafeUrl(author.picture);
  return `<span class="social-avatar ${cls}" aria-hidden="true"><span>${initial}</span>${picture ? `<img src="${picture}" alt="" loading="lazy" onerror="this.remove()">` : ''}</span>`;
}
function socialWhen(value) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return '';
  const delta = time - Date.now();
  const abs = Math.abs(delta);
  if (abs < 45 * 1000) return t('social.timeNow');
  const units = [
    ['year', 365 * 864e5], ['month', 30 * 864e5], ['day', 864e5],
    ['hour', 36e5], ['minute', 60e3],
  ];
  const [unit, size] = units.find(([, n]) => abs >= n) || ['minute', 60e3];
  try { return new Intl.RelativeTimeFormat(getLang(), { numeric: 'auto' }).format(Math.round(delta / size), unit); }
  catch (_) { return new Intl.DateTimeFormat(getLang(), { day: 'numeric', month: 'short' }).format(new Date(time)); }
}
function socialLocation(post) {
  const l = post.location || {};
  const values = [l.city, l.zoneLabel, l.region].filter(Boolean).map(String);
  return [...new Set(values)].slice(0, 2).map(esc).join(' · ');
}
function socialLocality(locality) {
  const key = ['city', 'zone', 'region', 'other'].includes(locality) ? locality : 'other';
  return t(SOCIAL_LOCALITY_KEYS[key]);
}
function socialPostCard(post) {
  const id = String(post.id == null ? '' : post.id);
  const idAttr = esc(id);
  const author = post.author || {};
  const isProducer = author.type === 'producer' || !!author.producerId;
  const authorName = esc(author.name || t('social.member'));
  const authorBody = `<span class="social-author-name">${authorName}${author.verified ? `<span class="social-verified" title="${t('social.verified')}">${Icon('check-circle', { size: 14 })}<span>${t('social.verified')}</span></span>` : ''}</span>
    <span class="social-author-meta">${isProducer ? t('social.producer') + ' · ' : ''}${socialLocation(post)}${post.createdAt ? ` · ${esc(socialWhen(post.createdAt))}` : ''}</span>`;
  const authorEl = isProducer && author.producerId
    ? `<a class="social-author" href="#/produttore/${encodeURIComponent(author.producerId)}" data-link>${socialAvatar(author)}<span>${authorBody}</span></a>`
    : `<div class="social-author">${socialAvatar(author)}<span>${authorBody}</span></div>`;
  const kind = SOCIAL_KINDS.includes(post.kind) ? post.kind : 'story';
  const media = socialSafeUrl(post.mediaUrl);
  const counts = post.counts || {};
  const comments = Array.isArray(post.comments) ? post.comments : [];
  const likeCount = Number(counts.likes || 0);
  const commentCount = Number(counts.comments == null ? comments.length : counts.comments);
  const saved = !!(post.viewer && post.viewer.saved);
  const liked = !!(post.viewer && post.viewer.liked);
  const expanded = communityOpenComments.has(id);
  const commentRows = comments.map(c => {
    const ca = c.author || {};
    return `<li class="social-comment">${socialAvatar(ca, 'small')}<div><div class="social-comment-meta"><b>${esc(ca.name || t('social.member'))}</b>${c.createdAt ? `<span>${esc(socialWhen(c.createdAt))}</span>` : ''}</div><p>${esc(c.text)}</p></div></li>`;
  }).join('');
  return `<article class="social-post" data-social-post="${idAttr}">
    <div class="social-post-top">
      ${authorEl}
      <span class="social-kind">${Icon(SOCIAL_KIND_ICONS[kind], { size: 14 })}${t(SOCIAL_KIND_KEYS[kind])}</span>
    </div>
    <div class="social-locality">${Icon('map-pin', { size: 13 })}<span>${socialLocality(post.locality)}</span></div>
    <p class="social-post-text">${esc(post.text)}</p>
    ${media ? `<figure class="social-media"><img src="${media}" alt="${t('social.mediaAlt', { name: authorName })}" loading="lazy" onerror="this.closest('figure').remove()"></figure>` : ''}
    <div class="social-actions" role="group" aria-label="${t('social.actionsAria')}">
      <button type="button" class="social-action ${liked ? 'on' : ''}" data-social-like aria-pressed="${liked}">${Icon('heart', { size: 19, fill: liked ? 'currentColor' : 'none' })}<span>${t('social.like')}</span><b class="tnum">${likeCount}</b></button>
      <button type="button" class="social-action ${expanded ? 'on' : ''}" data-social-comments aria-expanded="${expanded}">${Icon('message-circle', { size: 19 })}<span>${t('social.comment')}</span><b class="tnum">${commentCount}</b></button>
      <button type="button" class="social-action social-save ${saved ? 'on' : ''}" data-social-save aria-pressed="${saved}">${Icon('bookmark', { size: 19, fill: saved ? 'currentColor' : 'none' })}<span>${t('social.save')}</span></button>
    </div>
    ${expanded ? `<div class="social-comments" data-social-comment-box>
      <div class="social-comments-title">${t('social.commentsTitle')}</div>
      ${comments.length ? `<ul>${commentRows}</ul>` : `<p class="social-no-comments">${t('social.noComments')}</p>`}
      <form class="social-comment-form" data-social-comment-form>
        ${socialAvatar(currentUser() || {}, 'small')}
        <label class="sr-only" for="social-comment-${esc(id.replace(/[^a-zA-Z0-9_-]/g, ''))}">${t('social.writeComment')}</label>
        <input id="social-comment-${esc(id.replace(/[^a-zA-Z0-9_-]/g, ''))}" maxlength="280" value="${esc(communityCommentDrafts.get(id) || '')}" placeholder="${t('social.writeComment')}" autocomplete="off" data-social-comment-input>
        <button type="submit" data-social-comment-submit aria-label="${t('social.sendComment')}">${Icon('arrow-right', { size: 18 })}</button>
      </form>
      <p class="social-inline-error" role="alert" data-social-comment-error></p>
    </div>` : ''}
  </article>`;
}
function socialSkeleton() {
  return Array.from({ length: 3 }, () => `<div class="social-post social-skeleton" aria-hidden="true"><div class="sk-row"><i></i><span></span></div><b></b><b></b><b class="short"></b></div>`).join('');
}
function socialPlace(context) {
  const uz = userZone();
  return context?.city || context?.zone?.label || context?.region || (currentUser() || {}).city ||
    (typeof uz === 'string' ? uz : (uz && ((uz.comuni && uz.comuni[0]) || uz.label || uz.region))) || t('social.yourArea');
}

export function Comunita() {
  const social = socialState();
  if (social.scope !== communityScope && social.status !== 'loading') communityScope = social.scope || 'for-you';
  const u = currentUser() || {};
  // Solo una scheda già pubblicata parla nella rete come produttore; gli altri stati restano persona.
  const producer = u.producerStatus === 'published' && !!u.producerId;
  const place = socialPlace(social.context);
  const filters = ['for-you', 'nearby', 'producers'].map(scope => `<button type="button" class="social-filter ${communityScope === scope ? 'active' : ''}" data-social-scope="${scope}" aria-pressed="${communityScope === scope}">${t(SOCIAL_FILTER_KEYS[scope])}</button>`).join('');
  const kindOptions = SOCIAL_KINDS.map(kind => `<option value="${kind}"${communityKind === kind ? ' selected' : ''}>${t(SOCIAL_KIND_KEYS[kind])}</option>`).join('');
  let feed;
  if ((social.status === 'idle' || social.status === 'loading') && !(social.posts || []).length) {
    feed = `<div class="sr-only" role="status">${t('social.loading')}</div>${socialSkeleton()}`;
  } else if (social.status === 'error' && !(social.posts || []).length) {
    feed = `<div class="social-state" role="alert">${Icon('sprout', { size: 36 })}<h2>${t('social.loadErrorTitle')}</h2><p>${t('social.loadErrorBody')}</p><button class="btn btn-outline" type="button" data-social-retry>${t('social.retry')}</button></div>`;
  } else if (!(social.posts || []).length) {
    const emptyKeys = SOCIAL_EMPTY_KEYS[communityScope] || SOCIAL_EMPTY_KEYS['for-you'];
    feed = `<div class="social-state">${Icon('message-circle', { size: 38 })}<h2>${t(emptyKeys[0])}</h2><p>${t(emptyKeys[1])}</p></div>`;
  } else {
    feed = social.posts.map(socialPostCard).join('');
  }

  return {
    html: `<div class="screen social-screen">
      ${StatusBar()}
      <div class="scroll">
        <header class="social-hero">
          <div class="social-topline">
            <div class="social-place">${Icon('map-pin', { size: 16 })}<span>${esc(place)}</span></div>
            <a class="iconbtn" href="#/profilo" data-link aria-label="${t('social.profileAria')}">${Icon('user', { size: 18 })}</a>
          </div>
          <span class="eyebrow">${t('social.eyebrow')}</span>
          <h1>${t('social.title1')} <em>${t('social.titleEm')}</em></h1>
          <p>${t('social.localFirst', { place: `<strong>${esc(place)}</strong>` })}</p>
        </header>

        <div class="social-layout">
          <main class="social-main">
            <section class="social-composer" aria-label="${t('social.composerAria')}">
              <div class="social-composer-who">${socialAvatar(u)}<div><b>${producer ? t('social.composerProducer') : t('social.composerPerson')}</b><span>${producer ? t('social.composerProducerSub') : t('social.composerPersonSub')}</span></div></div>
              <label class="sr-only" for="social-post-text">${t('social.composerAria')}</label>
              <textarea id="social-post-text" maxlength="700" rows="3" placeholder="${producer ? t('social.placeholderProducer') : t('social.placeholderPerson')}" data-social-draft>${esc(communityDraft)}</textarea>
              <div class="social-composer-foot">
                <label class="social-kind-select"><span data-social-kind-icon aria-hidden="true">${Icon(SOCIAL_KIND_ICONS[communityKind], { size: 15 })}</span><span class="sr-only">${t('social.kindLabel')}</span><select data-social-kind aria-label="${t('social.kindLabel')}">${kindOptions}</select>${Icon('chevron-down', { size: 14 })}</label>
                <button class="social-publish" type="button" data-social-publish>${t('social.publish')}</button>
              </div>
              ${producer ? `<p class="social-producer-note">${Icon('info', { size: 14 })}${t('social.producerFairness')}</p>` : ''}
              <p class="social-inline-error" role="alert" data-social-publish-error></p>
            </section>

            <div class="social-feed-head">
              <div class="social-filters" role="group" aria-label="${t('social.filtersAria')}">${filters}</div>
              ${social.status === 'loading' && (social.posts || []).length ? `<span class="social-refreshing" role="status">${t('social.refreshing')}</span>` : ''}
            </div>
            <section class="social-feed" role="feed" aria-label="${t('social.feedAria')}" aria-busy="${social.status === 'loading'}">${feed}</section>
          </main>

          <aside class="social-side" aria-label="${t('social.howTitle')}">
            <div class="social-side-card local"><span class="social-side-icon">${Icon('map-pin', { size: 18 })}</span><div><h2>${t('social.localVisibilityTitle')}</h2><p>${t('social.localVisibilityBody')}</p></div></div>
            <div class="social-side-card"><span class="social-side-icon">${Icon('sprout', { size: 18 })}</span><div><h2>${t('social.usefulTitle')}</h2><p>${t('social.usefulBody')}</p></div></div>
            <div class="social-side-card social-allowed"><h2>${t('social.allowedTitle')}</h2><ul>
              <li>${Icon('message-circle', { size: 15 })}${t('social.allowedQuestions')}</li>
              <li>${Icon('leaf', { size: 15 })}${t('social.allowedField')}</li>
              <li>${Icon('calendar', { size: 15 })}${t('social.allowedAvailability')}</li>
              <li>${Icon('heart', { size: 15 })}${t('social.allowedStories')}</li>
            </ul></div>
            <p class="social-side-principle">${t('social.producerPrinciple')}</p>
          </aside>
        </div>
      </div>
      ${BottomNav('comunita')}
    </div>`,
    onMount(el) {
      const onThisScreen = () => /^#\/(comunita|cibovero)$/.test(location.hash);
      const finishLoad = () => { if (onThisScreen()) rerenderCommunity(); };
      if (social.status === 'idle' || social.scope !== communityScope) loadSocialFeed(communityScope).then(finishLoad).catch(finishLoad);

      const draft = el.querySelector('[data-social-draft]');
      if (draft) draft.oninput = () => { communityDraft = draft.value; };
      const kind = el.querySelector('[data-social-kind]');
      if (kind) kind.onchange = () => {
        communityKind = SOCIAL_KINDS.includes(kind.value) ? kind.value : 'question';
        const icon = el.querySelector('[data-social-kind-icon]');
        if (icon) icon.innerHTML = Icon(SOCIAL_KIND_ICONS[communityKind], { size: 15 });
      };
      const publish = el.querySelector('[data-social-publish]');
      if (publish) publish.onclick = async () => {
        const text = (draft ? draft.value : communityDraft).trim();
        const error = el.querySelector('[data-social-publish-error]');
        if (!text) { if (error) error.textContent = t('social.emptyPost'); if (draft) draft.focus(); return; }
        publish.disabled = true; publish.setAttribute('aria-busy', 'true'); publish.textContent = t('social.publishing');
        if (error) error.textContent = '';
        try {
          await createSocialPost({ text, kind: communityKind });
          communityDraft = '';
          // Scope e prossimità sono canonici sul server: rileggerli evita che un post-persona
          // resti temporaneamente nel filtro “Produttori” (o un post lontano in “Vicino”).
          try { await loadSocialFeed(communityScope, { force: true }); } catch (_) {}
          toast(t('social.published'), 'success');
          if (onThisScreen()) rerenderCommunity({ action: 'publish' });
        } catch (_) {
          publish.disabled = false; publish.removeAttribute('aria-busy'); publish.textContent = t('social.publish');
          if (error) error.textContent = t('social.publishError');
        }
      };

      el.querySelectorAll('[data-social-scope]').forEach(button => button.onclick = () => {
        const next = button.dataset.socialScope;
        if (next === communityScope) return;
        communityScope = next;
        loadSocialFeed(next, { force: true }).then(finishLoad).catch(finishLoad);
        rerenderCommunity({ action: 'scope', scope: next });
      });
      const retry = el.querySelector('[data-social-retry]');
      if (retry) retry.onclick = () => { loadSocialFeed(communityScope, { force: true }).then(finishLoad).catch(finishLoad); rerenderCommunity({ action: 'retry' }); };

      el.querySelectorAll('[data-social-post]').forEach(card => {
        const id = card.dataset.socialPost;
        const run = async (button, action, focusAction) => {
          if (button.disabled) return;
          button.disabled = true;
          try { await action(); if (onThisScreen()) rerenderCommunity({ action: focusAction, postId: id }); }
          catch (_) { button.disabled = false; toast(t('social.actionError'), 'error'); }
        };
        const like = card.querySelector('[data-social-like]');
        if (like) like.onclick = () => run(like, () => likeSocialPost(id), 'like');
        const save = card.querySelector('[data-social-save]');
        if (save) save.onclick = () => run(save, () => saveSocialPost(id), 'save');
        const comments = card.querySelector('[data-social-comments]');
        if (comments) comments.onclick = () => {
          if (communityOpenComments.has(id)) communityOpenComments.delete(id); else communityOpenComments.add(id);
          rerenderCommunity({ action: 'comments', postId: id });
        };
        const commentForm = card.querySelector('[data-social-comment-form]');
        const commentInput = card.querySelector('[data-social-comment-input]');
        if (commentInput) commentInput.oninput = () => communityCommentDrafts.set(id, commentInput.value);
        if (commentForm) commentForm.onsubmit = async (event) => {
          event.preventDefault();
          const text = (commentInput ? commentInput.value : '').trim();
          const error = card.querySelector('[data-social-comment-error]');
          if (!text) { if (commentInput) commentInput.focus(); return; }
          const submit = commentForm.querySelector('button[type="submit"]');
          submit.disabled = true;
          try {
            await commentSocialPost(id, text);
            communityCommentDrafts.delete(id);
            if (onThisScreen()) rerenderCommunity({ action: 'comment-input', postId: id });
          } catch (_) {
            submit.disabled = false;
            if (error) error.textContent = t('social.commentError');
          }
        };
      });
    },
  };
}

/* ---------------- SCHEDA PRODUTTORE ---------------- */
export function Producer(id) {
  const p = producerById(id);
  if (!p) return { html: `<div class="screen no-nav"><div class="pad mt22">${t('producer.notFound')} <a href="#/home" data-link>${t('producer.backHome')}</a></div></div>` };
  const cats = p.categories.map(c => `<span class="chip" style="padding:5px 11px">${Icon(catGlyph[c], { size: 14 })}${catLabel(c)}</span>`).join('');
  // Pull-quote: cita le parole vere del produttore (estratte da story tra « »), con attribuzione.
  const quoteMatch = (p.story || '').match(/«([^»]+)»/);
  const quote = quoteMatch ? quoteMatch[1].trim() : t('producer.defaultQuote');
  const quoteWho = `${(p.name || '').replace(/^Az\.\s*Agricola\s+di\s+/i, '')}, ${p.place || ''}`.replace(/,\s*$/, '');

  // ---- Sezione video "full-swipe" (stile storie) — un grande stage; si scorre in orizzontale tra i video ----
  const vids = Array.isArray(p.videos) ? p.videos : [];
  const VCHIP = { presentazione: t('producer.videoPresentazione'), storia: t('producer.videoStoria'), metodo: t('producer.videoMetodo') };
  const VCLS = { presentazione: 'pre', storia: 'sto', metodo: 'met' };
  let mainIdx = vids.findIndex(v => v.type === 'presentazione');
  if (mainIdx < 0) mainIdx = 0;
  // Ordine: presentazione per prima, poi gli altri. Ogni slide ricorda l'indice REALE (per la rotta del player).
  const vOrdered = vids.length
    ? [{ v: vids[mainIdx], i: mainIdx }, ...vids.map((v, i) => ({ v, i })).filter(x => x.i !== mainIdx)]
    : [];
  const chev = (d) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M${d === 'l' ? '15 6l-6 6 6 6' : '9 6l6 6-6 6'}"/></svg>`;
  const slide = ({ v, i }) => `
        <a class="pv3-slide" href="#/video/${p.id}/${i}" data-link aria-label="${t('producer.watchAria', { title: v.title || 'video' })}">
          ${Photo(v.tone, '', '', i === mainIdx ? p.photo : '', p.photoPos || 'center')}
          <span class="pv3-scr"></span>
          <span class="pv-cat ${VCLS[v.type] || 'pre'}">${VCHIP[v.type] || t('producer.videoGeneric')}</span>
          ${v.state === 'coming'
            ? `<span class="pv3-soon">${Icon('clock', { size: 15, color: '#fff' })} ${t('common.comingSoon')}</span>`
            : `<span class="pv3-play">${Icon('play', { size: 26, color: 'var(--ink)' })}</span>`}
          <div class="pv3-cap"><h3>${v.title || t('producer.chapter')}</h3>
            <div class="pv3-d">${v.duration ? v.duration + ' · ' : ''}${v.state === 'coming' ? t('producer.notAvailableYet') : t('producer.tapToPlay')}</div></div>
        </a>`;
  // Capitolo (lista laterale su desktop — variante 02): miniatura + tipo + titolo + durata.
  const chapterRow = ({ v, i }, k) => `
        <button class="pv3-ch ${k === 0 ? 'on' : ''}" type="button" data-pv3-goto="${k}">
          <span class="pv3-ch-th">${Photo(v.tone, '', '', i === mainIdx ? p.photo : '', p.photoPos || 'center')}<span class="pv3-ch-pl">${Icon(v.state === 'coming' ? 'clock' : 'play', { size: 13, color: '#fff' })}</span></span>
          <span class="pv3-ch-meta"><span class="pv3-ch-k">${VCHIP[v.type] || t('producer.videoGeneric')}</span><span class="pv3-ch-t">${v.title || t('producer.chapter')}</span>
            <span class="pv3-ch-d">${v.state === 'coming' ? t('producer.notAvailableYet') : (v.duration || '')}</span></span>
        </button>`;
  const multi = vOrdered.length > 1;
  const videoSection = vOrdered.length ? `
        <div class="block">
          <div class="block-h"><div class="section-t">${t('producer.watchVisit')}</div><span class="eyebrow tnum">${t('producer.videoCount', { n: vids.length })}</span></div>
          <div class="pv3-wrap ${multi ? '' : 'solo'}">
            <div class="pv3">
              <div class="pv3-track" data-pv3-track>${vOrdered.map(slide).join('')}</div>
              ${multi ? `
              <div class="pv3-count" data-pv3-count>1 / ${vOrdered.length}</div>
              <button class="pv3-arrow pv3-l" type="button" data-pv3-prev aria-label="${t('producer.prevVideo')}">${chev('l')}</button>
              <button class="pv3-arrow pv3-r" type="button" data-pv3-next aria-label="${t('producer.nextVideo')}">${chev('r')}</button>
              <div class="pv3-dots" data-pv3-dots>${vOrdered.map((_, k) => `<i class="${k === 0 ? 'on' : ''}"></i>`).join('')}</div>` : ''}
            </div>
            ${multi ? `<div class="pv3-chapters">${vOrdered.map(chapterRow).join('')}</div>` : ''}
          </div>
          ${multi ? `<div class="pv3-hint">${t('producer.swipeHint')}</div>` : ''}
        </div>` : '';
  return {
    html: `<div class="screen no-nav prod">
      <div class="scroll">
        <div class="hero">
          ${Photo(p.tone, '', '', p.photo, p.photoPos || 'center')}
          <div class="hero-top">
            <button class="iconbtn" data-back aria-label="${t('common.back')}">${Icon('arrow-left', { size: 18 })}</button>
            <button class="iconbtn" data-save aria-label="${t('producer.saveAria')}" aria-pressed="${p.saved ? 'true' : 'false'}">${Icon(p.saved ? 'heart' : 'bookmark', { size: 18, color: p.saved ? 'var(--verde)' : 'var(--ink)', fill: p.saved ? 'var(--verde)' : 'none' })}</button>
          </div>
          <div class="hero-cap"><div class="pn">${p.name}</div><div class="pl">${p.place} · Alta Val di Sangro</div></div>
        </div>
        <div class="metarow">${VerifyBadge(p.verify)} ${cats} <span class="km tnum">${km(p.km)} km</span></div>

        ${videoSection}

        <div class="block">
          <p class="story">${p.story}</p>
          <figure class="pullquote" style="margin:0">
            <blockquote style="margin:0">“${quote}”</blockquote>
            <figcaption class="pq-by">— ${quoteWho}</figcaption>
          </figure>
        </div>

        <div class="block">
          <div class="block-h"><div class="section-t">${t('producer.seasonNow')}</div><span class="eyebrow tnum">${p.seasonal.length} ${p.seasonal.length === 1 ? t('producer.productOne') : t('producer.productMany')}</span></div>
          <div class="seasonal">${p.seasonal.map(si => `<div class="si">${Photo(si.tone, '')}<div class="sl">${si.label}${si.note ? `<span class="sn">${si.note}</span>` : ''}</div></div>`).join('')}</div>
        </div>

        <div class="block">
          <div class="kv"><span class="open">${Icon('clock', { size: 17, color: 'var(--verde-deep)' })}</span> ${p.hours}</div>
          <div class="kv">${Icon('map-pin', { size: 17, color: 'var(--muted)' })} ${p.address}</div>
          <div class="dlv-sel"><div class="dlv-soon">${Icon('truck', { size: 17, color: 'var(--muted)' })} <b style="color:var(--ink)">${t('producer.homeDelivery')}</b> · ${t('producer.deliveryUnavailable')}</div>
            <div class="muted" style="font-size:12.5px;margin-top:6px">${t('producer.deliveryNote')}</div></div>
        </div>

        <div class="block">
          <div class="block-h"><div class="section-t">${t('producer.reviews')}</div></div>
          <div class="muted" style="font-size:14px">${t('producer.noReviews1')} <b style="color:var(--verde-deep)">${t('producer.verifiedByTech', { date: locDate(p.verify.date) })}${p.verify.by ? ' — ' + esc(p.verify.by) : ''}</b>.</div>
        </div>
        <div style="height:12px"></div>
      </div>
      <div class="cta-sticky">
        <button class="btn btn-grad" style="flex:1" data-contact aria-label="${t('producer.contactPickup')}">${Icon('message-circle', { size: 18, color: '#fff' })} ${t('producer.contactPickup')}</button>
        <button class="iconbtn" style="width:52px;height:52px" data-nav aria-label="${t('producer.directionsAria')}">${Icon('navigation', { size: 20, color: 'var(--verde)' })}</button>
      </div>
    </div>`,
    onMount(el) {
      const back = el.querySelector('[data-back]'); if (back) back.onclick = () => history.back();
      const save = el.querySelector('[data-save]'); if (save) save.onclick = (e) => { toggleSaved(p.id); rerender(); };
      const contact = el.querySelector('[data-contact]'); if (contact) contact.onclick = () => openContact(p);
      const nav = el.querySelector('[data-nav]'); if (nav) nav.onclick = () => openContact(p);

      // Carosello video "storie": scroll orizzontale (swipe) + frecce + pallini + contatore.
      const track = el.querySelector('[data-pv3-track]');
      if (track && track.children.length > 1) {
        const n = track.children.length;
        const countEl = el.querySelector('[data-pv3-count]');
        const dots = [...el.querySelectorAll('[data-pv3-dots] i')];
        const chaps = [...el.querySelectorAll('[data-pv3-goto]')]; // capitoli laterali (desktop, variante 02)
        const prevB = el.querySelector('[data-pv3-prev]');
        const nextB = el.querySelector('[data-pv3-next]');
        let cur = 0;
        const paint = (i) => {
          if (countEl) countEl.textContent = `${i + 1} / ${n}`;
          dots.forEach((d, k) => d.classList.toggle('on', k === i));
          chaps.forEach((c, k) => c.classList.toggle('on', k === i));
          if (prevB) prevB.style.opacity = i === 0 ? '.4' : '1';
          if (nextB) nextB.style.opacity = i === n - 1 ? '.4' : '1';
        };
        track.addEventListener('scroll', () => {
          const w = track.clientWidth || 1;
          const i = Math.max(0, Math.min(n - 1, Math.round(track.scrollLeft / w)));
          if (i !== cur) { cur = i; paint(i); }
        }, { passive: true });
        const go = (i) => { i = Math.max(0, Math.min(n - 1, i)); track.scrollTo({ left: i * track.clientWidth, behavior: 'smooth' }); };
        if (prevB) prevB.onclick = (e) => { e.preventDefault(); go(cur - 1); };
        if (nextB) nextB.onclick = (e) => { e.preventDefault(); go(cur + 1); };
        chaps.forEach((c, k) => c.onclick = () => go(k)); // clic sul capitolo → porta il player su quel video
        paint(0);
      }
    },
  };
}

/* ---------------- CONTATTO (sheet) ----------------
   I bottoni ora portano davvero da qualche parte:
   - WhatsApp  -> wa.me/<solo-cifre>  (con messaggio precompilato)
   - Chiama    -> tel:<numero>
   - Indicazioni -> Google Maps (lat/lng se presenti, altrimenti indirizzo) */
const onlyDigits = s => String(s || '').replace(/[^\d]/g, '');
const telHref = s => 'tel:' + String(s || '').replace(/[^\d+]/g, '');
function waHref(num, name) {
  let d = onlyDigits(num);
  // numero italiano scritto senza prefisso (parte con 3, 9-10 cifre) -> aggiungi 39
  if (d && !String(num).trim().startsWith('+') && d.length <= 10 && d[0] === '3') d = '39' + d;
  const msg = encodeURIComponent(t('contact.waMsg', { name: name ? ' ' + name : '' }));
  return `https://wa.me/${d}?text=${msg}`;
}
function mapsHref(p) {
  if (p && p.lat != null && p.lng != null) return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
  const q = [p && p.address, p && p.place, p && p.name].filter(Boolean).join(', ');
  return q ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}` : 'https://www.google.com/maps';
}
export function openContact(p) {
  const c = p.contact || {};
  const rows = [];
  if (c.whatsapp) rows.push(`<a href="${waHref(c.whatsapp, p.name)}" target="_blank" rel="noopener" class="contact-row wa" aria-label="${t('contact.waAria')}"><span class="cr-ic">${Icon('message-circle', { size: 20 })}</span> WhatsApp</a>`);
  if (c.phone) rows.push(`<a href="${telHref(c.phone)}" class="contact-row ph" aria-label="${t('contact.callAria')}"><span class="cr-ic">${Icon('phone', { size: 20 })}</span> ${t('contact.call')}</a>`);
  if (c.email) rows.push(`<a href="mailto:${c.email}" class="contact-row em" aria-label="${t('contact.emailAria')}"><span class="cr-ic">${Icon('mail', { size: 20 })}</span> Email</a>`);
  rows.push(`<a href="${mapsHref(p)}" target="_blank" rel="noopener" class="contact-row dir" aria-label="${t('contact.directionsAria')}"><span class="cr-ic">${Icon('navigation', { size: 20 })}</span> ${t('contact.directions')}</a>`);
  const back = document.createElement('div'); back.className = 'sheet-backdrop';
  back.setAttribute('role', 'dialog');
  back.setAttribute('aria-modal', 'true');
  back.setAttribute('aria-label', `Contatti · ${p.name}`);
  back.innerHTML = `<div class="sheet"><div class="handle"></div>
    <div class="sh-title">${p.name}</div>
    <div class="sh-sub">${p.hours || ''}</div>
    ${rows.join('')}
    <div class="sh-note">${t('contact.note')}</div></div>`;
  const close = () => { document.removeEventListener('keydown', onKey); back.remove(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  back.onclick = (e) => { if (e.target === back) close(); };
  document.addEventListener('keydown', onKey);
  document.getElementById('app').appendChild(back);
  // focus iniziale sul primo elemento interattivo dello sheet
  const first = back.querySelector('.sheet button, .sheet [href], .sheet input');
  if (first) first.focus();
}

/* ---------------- SALVATI ---------------- */
let salvatiFilter = null; // null = "Tutti"
export function Salvati() {
  const s = getState();
  const saved = s.producers.filter(p => p.saved);
  // categorie presenti tra i salvati (chip "Tutti" + solo le categorie utili)
  const present = s.categories.filter(c => saved.some(p => p.categories.includes(c.id)));
  // se il filtro attivo non è più rappresentato tra i salvati, torna a "Tutti"
  if (salvatiFilter && !present.some(c => c.id === salvatiFilter)) salvatiFilter = null;
  const shown = salvatiFilter ? saved.filter(p => p.categories.includes(salvatiFilter)) : saved;
  const chips = [
    `<button class="chip ${salvatiFilter === null ? 'active' : ''}" data-filter="">${t('saved.all', { n: saved.length })}</button>`,
    ...present.map(c => `<button class="chip ${salvatiFilter === c.id ? 'active' : ''}" data-filter="${c.id}">${Icon(c.glyph, { size: 14 })}${catLabel(c)}</button>`),
  ].join('');
  const renderList = () => shown.length
    ? shown.map(ProducerCard).join('')
    : `<div class="center muted" style="padding:40px 20px">${t('saved.emptyCategory')}</div>`;
  return {
    html: `<div class="screen">${StatusBar()}
      <div class="pad mt8"><h1 class="h1">${t('saved.title')}</h1></div>
      ${saved.length ? `<div class="pad mt12"><div class="chips">${chips}</div></div>` : ''}
      <div class="scroll"><div class="pad mt16 gap8" id="saved-list">
        ${saved.length ? renderList()
        : `<div class="center muted" style="padding:60px 20px">${Icon('bookmark', { size: 40, color: 'var(--faint)' })}<div class="mt12">${t('saved.empty')}</div></div>`}
      </div></div>
      ${BottomNav('salvati')}</div>`,
    onMount(el) {
      el.querySelectorAll('[data-filter]').forEach(b => b.onclick = () => {
        salvatiFilter = b.dataset.filter || null;
        rerender();
      });
    },
  };
}

/* ---------------- PROFILO ---------------- */
export function Profilo() {
  const notifOn = localStorage.getItem('gf_notif') !== '0'; // default: attive
  const u = currentUser() || {};
  const uName = u.name || (u.email ? u.email.split('@')[0] : t('profile.yourProfile'));
  const uMeta = u.email || t('settings.member');
  const langCur = LANGS.find(l => l.code === getLang()) || LANGS[0];
  const uz = userZone();
  const zoneLabel = uz ? ((uz.comuni && uz.comuni[0]) || uz.label || uz.region || t('profile.zone')) : t('profile.zone');
  const chevr = Icon('chevron-right', { size: 18, color: 'var(--faint)' });
  const rowIc = (bg, col, ic) => `<span class="p5-ic" style="background:${bg};color:${col}">${ic}</span>`;
  // Etichetta dinamica dell'ingresso produttore: form di richiesta → area sbloccata dopo l'approvazione.
  const pst = u.producerStatus;
  const prodLabel = pst === 'requested' ? 'Richiesta in corso' : (pst ? 'La mia area' : t('settings.producer'));
  return {
    html: `<div class="screen prof05">
      <style>
      .prof05 .scroll{ padding:0 16px 16px; }
      .prof05 .p5-hero{ background:linear-gradient(160deg,#eaf6ee,#e3f0f6); border-radius:0 0 22px 22px; margin:0 -16px; padding:26px 18px 18px; text-align:center; }
      .prof05 .p5-ava{ width:74px; height:74px; border-radius:50%; margin:0 auto; background:var(--verde-pale); color:var(--verde-deep); display:flex; align-items:center; justify-content:center; font-family:var(--serif); font-weight:700; font-size:30px; overflow:hidden; }
      .prof05 .p5-ava img{ width:100%; height:100%; object-fit:cover; }
      .prof05 .p5-name{ font-family:var(--serif); font-size:21px; font-weight:600; color:var(--ink); margin-top:9px; }
      .prof05 .p5-mail{ font-size:12.5px; color:var(--muted); margin-top:1px; }
      .prof05 .p5-chips{ display:flex; gap:8px; justify-content:center; margin-top:12px; flex-wrap:wrap; }
      .prof05 .p5-chip{ display:inline-flex; align-items:center; gap:6px; font-size:12.5px; font-weight:600; color:var(--verde-deep); background:#fff; border:1px solid var(--verde-pale); padding:8px 13px; border-radius:100px; cursor:pointer; font-family:inherit; }
      .prof05 .p5-chip.cel{ color:var(--celeste-deep); border-color:var(--celeste-pale); }
      .prof05 .p5-card{ background:var(--bianco); border:1px solid var(--bd); border-radius:16px; box-shadow:var(--sh-card); overflow:hidden; margin-top:16px; }
      .prof05 .p5-row{ display:flex; align-items:center; gap:13px; width:100%; text-align:left; padding:14px 15px; border-bottom:1px solid var(--bd2); background:none; border-left:none; border-right:none; border-top:none; cursor:pointer; font-family:inherit; }
      .prof05 .p5-row:last-child{ border-bottom:none; }
      .prof05 .p5-ic{ width:34px; height:34px; border-radius:10px; display:flex; align-items:center; justify-content:center; flex:none; }
      .prof05 .p5-lb{ flex:1; font-size:14.5px; color:var(--ink); font-weight:500; }
      .prof05 .p5-sect{ font-size:11px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:var(--muted2); margin:20px 4px 8px; }
      .prof05 .p5-logout .p5-lb{ color:#C0392B; }
      .prof05 .p5-toggle{ width:44px; height:26px; border-radius:100px; border:none; padding:0; position:relative; flex:none; cursor:pointer; transition:background .18s; }
      .prof05 .p5-toggle i{ position:absolute; top:3px; width:20px; height:20px; border-radius:50%; background:#fff; box-shadow:0 1px 3px rgba(0,0,0,.25); transition:left .18s; }
      </style>
      ${StatusBar()}
      <div class="scroll">
        <div class="p5-hero">
          <div class="p5-ava">${avatarInner(u, uName)}</div>
          <div class="p5-name">${uName}</div>
          <div class="p5-mail">${uMeta}</div>
          <div class="p5-chips">
            <button class="p5-chip" type="button" data-lang-open>${langCur.flag} ${langCur.label} ${Icon('chevron-down', { size: 14, color: 'var(--faint)' })}</button>
            <button class="p5-chip cel" type="button" data-open-auth="zone">${Icon('map-pin', { size: 14, color: 'var(--celeste-deep)' })} ${zoneLabel}</button>
          </div>
        </div>

        <div class="p5-card">
          <a class="p5-row" href="#/profilo/modifica" data-link>${rowIc('var(--verde-pale)', 'var(--verde-deep)', Icon('user', { size: 18 }))}<span class="p5-lb">${t('settings.editProfile')}</span>${chevr}</a>
          <div class="p5-row" style="cursor:default">${rowIc('var(--carta-scura)', 'var(--ink-soft)', Icon('bell', { size: 18 }))}<span class="p5-lb">${t('settings.notifications')}</span>
            <button type="button" role="switch" aria-checked="${notifOn}" aria-label="${t('settings.notifications')}" data-notif class="p5-toggle" style="background:${notifOn ? 'var(--verde)' : 'var(--bd3,#d8cdb8)'}"><i style="left:${notifOn ? '21px' : '3px'}"></i></button></div>
        </div>

        <div class="p5-card">
          <a class="p5-row" href="#/azienda" data-link>${rowIc('var(--verde-pale)', 'var(--verde-deep)', Icon('leaf', { size: 18 }))}<span class="p5-lb">${prodLabel}</span>${producerStatusNotice() ? '<span style="width:9px;height:9px;border-radius:50%;background:var(--verde);flex:none;margin-right:6px"></span>' : ''}${chevr}</a>
        </div>

        ${(() => {
          // Ingresso staff (audit A4): mostrato SOLO se sei già staff loggato (ruolo risolto) → i clienti non lo vedono.
          // Dà allo staff un accesso anche su mobile (il rail è solo desktop). Coerente con la RBAC (B1).
          const role = getState().role;
          if (role !== 'admin' && role !== 'verificatore') return '';
          const srow = (href, ic, label) => `<a class="p5-row" href="${href}" data-link>${rowIc('var(--carta-scura)', 'var(--ink-soft)', Icon(ic, { size: 18 }))}<span class="p5-lb">${label}</span>${chevr}</a>`;
          return `<div class="p5-sect">Staff</div><div class="p5-card">${role === 'admin' ? srow('#/admin', 'sliders', 'Gestione') : ''}${srow('#/sasha', 'check-circle', 'Area verificatore')}</div>`;
        })()}

        <div class="p5-card" style="margin-top:16px">
          <a class="p5-row" href="#/termini" data-link>${rowIc('var(--carta-scura)', 'var(--ink-soft)', Icon('info', { size: 18 }))}<span class="p5-lb">${t('settings.terms')}</span>${chevr}</a>
          <a class="p5-row" href="#/privacy" data-link>${rowIc('var(--carta-scura)', 'var(--ink-soft)', Icon('lock', { size: 18 }))}<span class="p5-lb">${t('settings.privacy')}</span>${chevr}</a>
          <button class="p5-row p5-logout" type="button" data-logout>${rowIc('#f6e4e1', '#C0392B', Icon('arrow-left', { size: 18 }))}<span class="p5-lb">${t('settings.logout')}</span></button>
        </div>
        <div style="height:14px"></div>
      </div>
      ${BottomNav('tu')}</div>`,
    onMount(el) {
      const lang = el.querySelector('[data-lang-open]'); if (lang) lang.onclick = () => openLangSheet();
      const notif = el.querySelector('[data-notif]');
      if (notif) notif.onclick = () => {
        const on = notif.getAttribute('aria-checked') !== 'true';
        localStorage.setItem('gf_notif', on ? '1' : '0');
        notif.setAttribute('aria-checked', String(on));
        notif.style.background = on ? 'var(--verde)' : 'var(--bd3,#d8cdb8)';
        notif.firstElementChild.style.left = on ? '21px' : '3px';
        try { if (currentUser()) updateProfile({ notif: on }); } catch (_) {}
      };
      const out = el.querySelector('[data-logout]');
      if (out) out.onclick = async () => { try { await signOut(); } catch (_) {} location.hash = '#/'; setTimeout(() => location.reload(), 40); };
    },
  };
}

/* ---------------- MODIFICA PROFILO (variante "riga-per-riga") ---------------- */
export function ProfiloEdit() {
  const u = currentUser() || {};
  const uName = u.name || (u.email ? u.email.split('@')[0] : '');
  const uz = userZone();
  const cityPh = (uz && ((uz.comuni && uz.comuni[0]) || uz.label)) || t('profile.cityPlaceholder');
  const esc = s => String(s || '').replace(/"/g, '&quot;');
  return {
    html: `<div class="screen no-nav pedit">
      <style>
      .pedit .scroll{ padding:0 16px 24px; }
      .pedit .pe-top{ display:flex; align-items:center; gap:10px; padding:12px 4px; }
      .pedit .pe-top .tt{ flex:1; text-align:center; font-weight:600; color:var(--ink); }
      .pedit .pe-ava{ position:relative; width:96px; height:96px; margin:8px auto 6px; }
      .pedit .pe-ava .av{ width:96px; height:96px; border-radius:50%; background:var(--verde-pale); color:var(--verde-deep); display:flex; align-items:center; justify-content:center; font-family:var(--serif); font-weight:700; font-size:38px; overflow:hidden; }
      .pedit .pe-ava .av img{ width:100%; height:100%; object-fit:cover; }
      .pedit .pe-ava .cam{ position:absolute; right:-2px; bottom:-2px; width:32px; height:32px; border-radius:50%; background:var(--verde); color:#fff; display:flex; align-items:center; justify-content:center; border:3px solid var(--carta); cursor:pointer; }
      .pedit .pe-chg{ text-align:center; font-size:13px; font-weight:600; color:var(--verde-deep); margin-bottom:18px; cursor:pointer; }
      .pedit .pe-card{ background:var(--bianco); border:1px solid var(--bd); border-radius:16px; box-shadow:var(--sh-card); overflow:hidden; }
      .pedit .pe-row{ display:flex; align-items:center; gap:12px; padding:13px 15px; border-bottom:1px solid var(--bd2); }
      .pedit .pe-row:last-child{ border-bottom:none; }
      .pedit .pe-row label{ font-size:14.5px; color:var(--ink); font-weight:500; flex:none; width:92px; }
      .pedit .pe-row input{ flex:1; border:none; background:none; text-align:right; font-family:inherit; font-size:14.5px; color:var(--ink); min-width:0; }
      .pedit .pe-row input::placeholder{ color:var(--faint); }
      .pedit .pe-row input:focus{ outline:none; }
      .pedit .pe-row.ro span{ flex:1; text-align:right; font-size:13px; color:var(--muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .pedit .pe-note{ font-size:11.5px; color:var(--faint); margin:10px 6px; line-height:1.5; }
      .pedit .pe-msg{ min-height:18px; text-align:center; font-size:12.5px; font-weight:600; margin-top:8px; }
      </style>
      ${StatusBar()}
      <div class="scroll">
        <div class="pe-top"><button class="iconbtn" data-back aria-label="${t('common.back')}">${Icon('arrow-left', { size: 18 })}</button><span class="tt">${t('profile.title')}</span><span style="width:44px;flex:none"></span></div>
        <div class="pe-ava"><span class="av" data-ava>${avatarInner(u, uName)}</span><button class="cam" type="button" data-cam aria-label="${t('profile.changePhoto')}">${Icon('camera', { size: 17, color: '#fff' })}</button></div>
        <div class="pe-chg" data-cam-txt>${t('profile.changePhoto')}</div>
        <input type="file" accept="image/*" data-avatar-input style="display:none">
        <div class="pe-card">
          <div class="pe-row"><label>${t('profile.name')}</label><input data-field="name" value="${esc(u.name)}" placeholder="${t('profile.namePlaceholder')}"></div>
          <div class="pe-row"><label>${t('profile.city')}</label><input data-field="city" value="${esc(u.city)}" placeholder="${esc(cityPh)}"></div>
          <div class="pe-row"><label>${t('profile.phone')}</label><input data-field="phone" inputmode="tel" value="${esc(u.phone)}" placeholder="${t('profile.add')}"></div>
          <div class="pe-row ro"><label>${t('profile.email')}</label><span>${u.email || ''}</span></div>
        </div>
        <div class="pe-msg" data-msg></div>
        <div class="pe-note">${t('profile.emailNote')}</div>
      </div>
    </div>`,
    onMount(el) {
      const back = el.querySelector('[data-back]'); if (back) back.onclick = () => { location.hash = '#/profilo'; };
      const msg = el.querySelector('[data-msg]');
      const flash = (txt, ok = true) => { if (msg) { msg.textContent = txt; msg.style.color = ok ? 'var(--verde-deep)' : 'var(--red-alert)'; setTimeout(() => { if (msg.textContent === txt) msg.textContent = ''; }, 1600); } };
      el.querySelectorAll('[data-field]').forEach(inp => {
        const save = async () => {
          const field = inp.dataset.field, val = inp.value.trim();
          if (val === ((currentUser() || {})[field] || '')) return;
          try { await updateProfile({ [field]: val }); flash(t('profile.saved') + ' ✓'); }
          catch (e) { flash(t('profile.saveError'), false); }
        };
        inp.addEventListener('blur', save);
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } });
      });
      const fileInp = el.querySelector('[data-avatar-input]');
      const pick = () => fileInp && fileInp.click();
      const cam = el.querySelector('[data-cam]'); if (cam) cam.onclick = pick;
      const camTxt = el.querySelector('[data-cam-txt]'); if (camTxt) camTxt.onclick = pick;
      if (fileInp) fileInp.onchange = () => {
        const f = fileInp.files && fileInp.files[0]; if (!f) return;
        if (f.size > 5 * 1024 * 1024) { flash(t('profile.photoTooBig'), false); return; }
        const fr = new FileReader();
        fr.onload = async () => {
          try {
            await uploadAvatar(fr.result);
            const av = el.querySelector('[data-ava]'); if (av) av.innerHTML = avatarInner(currentUser(), uName);
            flash(t('profile.saved') + ' ✓');
          } catch (e) { flash(t('profile.photoError'), false); }
        };
        fr.readAsDataURL(f);
      };
    },
  };
}

/* ---------------- stub "in arrivo" ---------------- */
export function Soon(title) {
  return {
    html: `<div class="screen no-nav">${StatusBar()}
      <div class="toprow"><button class="iconbtn" data-back aria-label="${t('common.back')}">${Icon('arrow-left', { size: 18 })}</button></div>
      <div class="center" style="padding:80px 30px">${Icon('truck', { size: 44, color: 'var(--terra)' })}
      <h2 class="h2 mt16">${title}</h2><p class="muted mt8">${t('soon.body')}</p></div></div>`,
    onMount(el) { const back = el.querySelector('[data-back]'); if (back) back.onclick = () => history.back(); },
  };
}

// rerender hook (impostato da main.js)
export let rerender = () => {};
export function setRerender(fn) { rerender = fn; }
