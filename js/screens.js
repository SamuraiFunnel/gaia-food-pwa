import { Icon } from './icons.js';
import { StatusBar, Photo, VerifyBadge, ProducerCard, VideoBlock, BottomNav, catGlyph, catLabel, Lockup, toast, confirmSheet } from './components.js';
import { getState, results, regionalResults, producersInUserRegion, userRegion, producerRegion, producerById, toggleSaved, hubSeen, lastFunction, resetHub, currentUser, userZone, updateProfile, uploadAvatar, signOut, producerStatusNotice, socialState, loadSocialFeed, createSocialPost, likeSocialPost, saveSocialPost, commentSocialPost } from './store.js';
import { loadSocialSurface, loadSocialStories, loadSocialSuggestions, uploadSocialMedia, createSocialStory, followSocialAuthor, viewSocialStory, reportSocialStory, deleteSocialStory, shareSocialPost, reportSocialPost, deleteSocialPost } from './store.js';
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
let communityRouteActive = /^#\/(comunita|cibovero)$/.test(location.hash);
let communityEntryToken = communityRouteActive ? 1 : 0;
let communityHandledEntryToken = 0;
let socialARootController = null;
const communityOpenComments = new Set();
const communityCommentDrafts = new Map();
const SOCIAL_KINDS = ['question', 'tip', 'field', 'availability', 'story'];
const SOCIAL_KIND_KEYS = { question: 'social.kind.question', tip: 'social.kind.tip', field: 'social.kind.field', availability: 'social.kind.availability', story: 'social.kind.story' };
const SOCIAL_LOCALITY_KEYS = { city: 'social.locality.city', zone: 'social.locality.zone', region: 'social.locality.region', other: 'social.locality.other' };

function clearCommunityDrafts() {
  communityDraft = '';
  communityKind = 'question';
  communityOpenComments.clear();
  communityCommentDrafts.clear();
}
try { window.addEventListener('gf:social-context-changed', clearCommunityDrafts); } catch (_) {}
try {
  window.addEventListener('hashchange', () => {
    const active = /^#\/(comunita|cibovero)$/.test(location.hash);
    if (active && !communityRouteActive) communityEntryToken += 1;
    if (!active) { socialARootController?.abort(); socialARootController = null; socialAPostMenus.clear(); }
    communityRouteActive = active;
  });
} catch (_) {}

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
  share: '[data-social-share]',
  follow: '[data-social-follow]',
  menu: '[data-social-menu]',
  report: '[data-social-report]',
  delete: '[data-social-delete]',
  'load-more': '[data-social-load-more]',
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
        authorId: active.dataset.socialFollow || '',
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
    : ref.action === 'follow' && ref.authorId
      ? candidates.find(button => button.dataset.socialFollow === ref.authorId) || null
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
    if (u.username || u.password) return '';
    if (u.protocol === 'http:' && u.origin !== location.origin) return '';
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
function socialSkeleton() {
  return Array.from({ length: 3 }, () => `<div class="social-post social-skeleton" aria-hidden="true"><div class="sk-row"><i></i><span></span></div><b></b><b></b><b class="short"></b></div>`).join('');
}
function socialPlace(context) {
  const uz = userZone();
  return context?.city || context?.zone?.label || context?.region || (currentUser() || {}).city ||
    (typeof uz === 'string' ? uz : (uz && ((uz.comuni && uz.comuni[0]) || uz.label || uz.region))) || t('social.yourArea');
}
function socialAViralityLabel(score) {
  const value = Number(score || 0);
  return t(value >= 25 ? 'social.virality.high' : value >= 8 ? 'social.virality.rising' : 'social.virality.local');
}

/* Variante A · la superficie sociale scelta: gesto familiare, identita organica Gaia. */
const SOCIAL_A_SCOPES = ['for-you', 'following', 'nearby', 'producers'];
const SOCIAL_A_FILTER_KEYS = {
  'for-you': 'social.filter.for-you', following: 'social.filter.following',
  nearby: 'social.filter.nearby', producers: 'social.filter.producers',
};
const SOCIAL_A_EMPTY_KEYS = {
  'for-you': ['social.empty.for-you.title', 'social.empty.for-you.body'],
  following: ['social.empty.following.title', 'social.empty.following.body'],
  nearby: ['social.empty.nearby.title', 'social.empty.nearby.body'],
  producers: ['social.empty.producers.title', 'social.empty.producers.body'],
};
const socialACarousels = new Map();
const socialAPostMenus = new Set();
let socialADeferredRender = false;

function socialAOverlayOpen() {
  return !!document.querySelector('#app .socialA-modal-backdrop.open,#app .socialA-story-viewer.open,#app .gf-confirm-bd');
}
function socialARequestRerender(fallbackFocus = null) {
  if (socialAOverlayOpen()) { socialADeferredRender = true; return false; }
  socialADeferredRender = false; rerenderCommunity(fallbackFocus); return true;
}
function socialAFlushDeferredRender(screen) {
  try { window.dispatchEvent(new CustomEvent('gf:social-overlay-closed')); } catch (_) {}
  if (!socialADeferredRender || !screen || !screen.isConnected || !/^#\/(comunita|cibovero)$/.test(location.hash)) return;
  queueMicrotask(() => { if (!socialAOverlayOpen() && socialADeferredRender) socialARequestRerender(); });
}
try {
  window.addEventListener('gf:social-overlay-closed', () => {
    if (socialADeferredRender && !socialAOverlayOpen() && /^#\/(comunita|cibovero)$/.test(location.hash)) queueMicrotask(() => socialARequestRerender());
  });
} catch (_) {}

function socialAMedia(post) {
  const raw = Array.isArray(post && post.media) ? post.media.slice(0, 10) : [];
  if (!raw.length && post && post.mediaUrl) raw.push({ type: 'image', url: post.mediaUrl, mime: 'image/jpeg' });
  return raw.map((item) => {
    const url = socialSafeUrl(item && item.url);
    if (!url) return null;
    const mime = String(item && item.mime || '').toLowerCase();
    const type = item && item.type === 'video' || mime.startsWith('video/') ? 'video' : 'image';
    return { type, url, mime: esc(mime) };
  }).filter(Boolean);
}

function socialAMediaMarkup(post, id) {
  const media = socialAMedia(post);
  if (!media.length) return '';
  const authorName = String(post.author && post.author.name || t('social.member'));
  const alt = esc(t('social.mediaAlt', { name: authorName }));
  const render = (item, hidden = false) => item.type === 'video'
    ? `<video class="socialA-media video" src="${item.url}" controls preload="metadata" playsinline muted${hidden ? ' tabindex="-1"' : ''}></video>`
    : `<img class="socialA-media" src="${item.url}" alt="${alt}" loading="lazy">`;
  if (media.length === 1) return `<figure class="socialA-media-wrap ${media[0].type}">${render(media[0])}</figure>`;
  const index = Math.max(0, Math.min(media.length - 1, socialACarousels.get(id) || 0));
  return `<div class="socialA-carousel" data-social-carousel data-social-carousel-index="${index}">
    <div class="socialA-carousel-track" style="transform:translateX(-${index * 100}%)">${media.map((item, at) => `<div class="socialA-slide" aria-hidden="${at !== index}">${render(item, at !== index)}</div>`).join('')}</div>
    <button type="button" class="socialA-carousel-arrow prev" data-social-carousel-prev aria-label="${t('social.carouselPrev')}"${index === 0 ? ' disabled' : ''}>${Icon('chevron-right', { size: 20 })}</button>
    <button type="button" class="socialA-carousel-arrow next" data-social-carousel-next aria-label="${t('social.carouselNext')}"${index === media.length - 1 ? ' disabled' : ''}>${Icon('chevron-right', { size: 20 })}</button>
    <span class="socialA-carousel-count tnum" data-social-carousel-count>${index + 1} / ${media.length}</span>
    <div class="socialA-carousel-dots" aria-hidden="true">${media.map((_, at) => `<i class="${at === index ? 'active' : ''}"></i>`).join('')}</div>
  </div>`;
}

function socialAPostCard(post) {
  const id = String(post && post.id || '');
  const author = post && post.author || {};
  const viewer = post && post.viewer || {};
  const counts = post && post.counts || {};
  const isProducer = author.type === 'producer';
  const isSystem = author.type === 'system';
  const following = !!viewer.followingAuthor;
  const canFollow = !isSystem && !viewer.ownAuthor && author.id;
  const canReport = !isSystem && !viewer.ownAuthor;
  const canDelete = !isSystem && !!viewer.ownAuthor;
  const canMenu = canReport || canDelete;
  const authorName = esc(author.name || t('social.member'));
  const producerHref = isProducer && author.producerId ? `#/produttore/${encodeURIComponent(author.producerId)}` : '';
  const expanded = communityOpenComments.has(id);
  const menuOpen = socialAPostMenus.has(id);
  const comments = Array.isArray(post.comments) ? post.comments : [];
  const text = String(post.text || '');
  const role = isProducer ? t('social.producer') : (isSystem ? t('social.networkName') : t('social.member'));
  const authorMeta = [esc(role), socialLocation(post), post.createdAt ? esc(socialWhen(post.createdAt)) : ''].filter(Boolean).join(' · ');
  const authorCopy = `<span class="socialA-author-name social-author-name">${authorName}${author.verified ? `<span title="${t('social.verified')}">${Icon('check-circle', { size: 14 })}</span>` : ''}</span><span class="socialA-author-meta social-author-meta">${authorMeta}</span>`;
  const authorEl = producerHref
    ? `<a class="socialA-author" href="${producerHref}" data-link>${socialAvatar(author, 'socialA-avatar')}<span>${authorCopy}</span></a>`
    : `<div class="socialA-author">${socialAvatar(author, 'socialA-avatar')}<span>${authorCopy}</span></div>`;
  const commentRows = comments.map((comment) => {
    const ca = comment.author || {};
    return `<li class="social-comment">${socialAvatar(ca, 'small socialA-avatar')}<div><div class="social-comment-meta"><b>${esc(ca.name || t('social.member'))}</b>${comment.createdAt ? `<span>${esc(socialWhen(comment.createdAt))}</span>` : ''}</div><p>${esc(comment.text)}</p></div></li>`;
  }).join('');
  const virality = post.virality && communityScope === 'producers' ? post.virality : null;
  const menuId = `social-menu-${id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return `<article class="social-post socialA-post ${!socialAMedia(post).length ? 'socialA-text-card' : ''}" data-social-post="${esc(id)}">
    <header class="socialA-post-head">${authorEl}<div class="socialA-post-controls">
      ${canFollow ? `<button type="button" class="socialA-follow ${following ? 'following' : ''}" data-social-follow="${esc(author.id)}" data-social-following="${following}" aria-label="${following ? t('social.unfollowAria', { name: authorName }) : t('social.followAria', { name: authorName })}">${following ? t('social.following') : t('social.follow')}</button>` : ''}
      ${canMenu ? `<button type="button" class="socialA-post-menu" data-social-menu aria-haspopup="menu" aria-controls="${menuId}" aria-expanded="${menuOpen}" aria-label="${t('social.more')}">${Icon('more-horizontal', { size: 21 })}</button>` : ''}
      ${canMenu && menuOpen ? `<div class="socialA-menu-pop" id="${menuId}" role="menu">${canDelete
        ? `<button type="button" role="menuitem" data-social-delete>${Icon('trash', { size: 16 })}${t('social.deletePost')}</button>`
        : `<button type="button" role="menuitem" data-social-report ${viewer.reported ? 'disabled' : ''}>${Icon('flag', { size: 16 })}${viewer.reported ? t('social.reported') : t('social.report')}</button>`}</div>` : ''}
    </div></header>
    ${virality ? `<div class="socialA-virality"><strong>${virality.rank ? '#' + Number(virality.rank) : t('social.virality')}</strong><span>${socialAViralityLabel(virality.score)}</span><b class="tnum">${Number(virality.score || 0)}</b></div>` : ''}
    ${text ? `<div class="socialA-post-copy"><p class="social-post-text">${esc(text)}</p></div>` : ''}
    ${socialAMediaMarkup(post, id)}
    ${post.pendingModeration ? `<p class="socialA-moderation-note">${Icon('info', { size: 14 })}${t('social.pendingModeration')}</p>` : ''}
    <div class="social-actions" role="group" aria-label="${t('social.actionsAria')}">
      <button type="button" class="social-action ${viewer.liked ? 'on' : ''}" data-social-like aria-pressed="${!!viewer.liked}" aria-label="${t('social.like')}">${Icon('heart', { size: 21, fill: viewer.liked ? 'currentColor' : 'none' })}<b class="tnum">${Number(counts.likes || 0)}</b></button>
      <button type="button" class="social-action ${expanded ? 'on' : ''}" data-social-comments aria-expanded="${expanded}" aria-label="${t('social.comment')}">${Icon('message-circle', { size: 21 })}<b class="tnum">${Number(counts.comments == null ? comments.length : counts.comments)}</b></button>
      <button type="button" class="social-action" data-social-share aria-label="${t('social.share')}">${Icon('send', { size: 21 })}<b class="tnum">${Number(counts.shares || 0)}</b></button>
      <button type="button" class="social-action social-save ${viewer.saved ? 'on' : ''}" data-social-save aria-pressed="${!!viewer.saved}" aria-label="${t('social.save')}">${Icon('bookmark', { size: 21, fill: viewer.saved ? 'currentColor' : 'none' })}</button>
    </div>
    ${expanded ? `<div class="social-comments" data-social-comment-box><div class="social-comments-title">${t('social.commentsTitle')}</div>${comments.length ? `<ul>${commentRows}</ul>` : `<p class="social-no-comments">${t('social.noComments')}</p>`}<form class="social-comment-form" data-social-comment-form>${socialAvatar(currentUser() || {}, 'small socialA-avatar')}<label class="sr-only" for="social-comment-${esc(id.replace(/[^a-zA-Z0-9_-]/g, ''))}">${t('social.writeComment')}</label><input id="social-comment-${esc(id.replace(/[^a-zA-Z0-9_-]/g, ''))}" maxlength="280" value="${esc(communityCommentDrafts.get(id) || '')}" placeholder="${t('social.writeComment')}" autocomplete="off" data-social-comment-input><button type="submit" data-social-comment-submit aria-label="${t('social.sendComment')}">${Icon('arrow-right', { size: 18 })}</button></form><p class="social-inline-error" role="alert" data-social-comment-error></p></div>` : ''}
  </article>`;
}

function socialAStories(social, user) {
  const stories = Array.isArray(social.stories) ? social.stories : [];
  const own = `<button type="button" class="socialA-story is-you" data-social-create-story aria-label="${t('social.addStory')}"><span class="socialA-story-ring">${socialAvatar(user, 'socialA-avatar')}<span class="socialA-story-plus">+</span></span><span class="socialA-story-label">${t('social.yourStory')}</span></button>`;
  const rows = stories.map((story) => {
    const author = story.author || {};
    const media = socialAMedia(story);
    const thumb = media.find(item => item.type === 'image');
    const avatar = thumb ? `<img src="${thumb.url}" alt="" loading="lazy">` : socialAvatar(author, 'socialA-avatar');
    return `<button type="button" class="socialA-story ${story.viewer && story.viewer.seen ? 'is-seen' : ''}" data-social-story="${esc(story.id)}" aria-label="${t('social.openStoryAria', { name: esc(author.name || t('social.member')) })}"><span class="socialA-story-ring">${avatar}</span><span class="socialA-story-label">${esc(author.name || t('social.member'))}</span></button>`;
  }).join('');
  return `<div class="socialA-stories" aria-label="${t('social.storiesAria')}">${own}${rows}${social.storiesStatus === 'loading' ? `<span class="socialA-stories-loading" role="status">${t('social.loadingStories')}</span>` : ''}</div>`;
}

function socialASuggestions(social) {
  const list = Array.isArray(social.suggestions) ? social.suggestions : [];
  if (social.suggestionsStatus === 'error') return `<p class="socialA-suggest-state">${t('social.suggestionsUnavailable')}</p>`;
  if (social.suggestionsStatus === 'loading' && !list.length) return `<p class="socialA-suggest-state" role="status">${t('social.loadingSuggestions')}</p>`;
  if (!list.length) return `<p class="socialA-suggest-state">${t('social.noSuggestions')}</p>`;
  return list.map((item) => {
    const author = item.author || {};
    const authorName = String(author.name || t('social.member'));
    const location = socialLocation(item) || socialLocality(item.locality);
    const producerHref = author.type === 'producer' && author.producerId ? `#/produttore/${encodeURIComponent(author.producerId)}` : '';
    const copy = `<span class="socialA-suggest-copy"><strong>${esc(authorName)}</strong><small>${location}</small></span>`;
    const followLabel = item.following ? t('social.unfollowAria', { name: authorName }) : t('social.followAria', { name: authorName });
    return `<div class="socialA-suggestion">${producerHref ? `<a href="${producerHref}" data-link>${socialAvatar(author, 'socialA-avatar')}${copy}</a>` : `<div>${socialAvatar(author, 'socialA-avatar')}${copy}</div>`}<button type="button" class="socialA-follow ${item.following ? 'following' : ''}" data-social-follow="${esc(author.id)}" data-social-following="${!!item.following}" aria-label="${esc(followLabel)}">${item.following ? t('social.following') : t('social.follow')}</button></div>`;
  }).join('');
}

function socialATrap(backdrop, opener, requestClose, forceClose, initial) {
  let released = false, observer = null;
  const focusable = () => [...backdrop.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),textarea:not([disabled]),select:not([disabled]),video[controls],[tabindex]:not([tabindex="-1"])')].filter(node => !node.hidden && node.getClientRects().length);
  const onKey = (event) => {
    if (document.querySelector('#app .gf-confirm-bd')) return;
    if (event.key === 'Escape') { event.preventDefault(); requestClose(); return; }
    if (event.key !== 'Tab') return;
    const nodes = focusable(); if (!nodes.length) { event.preventDefault(); return; }
    const first = nodes[0], last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  const onContextLost = () => forceClose({ restoreFocus: false });
  document.addEventListener('keydown', onKey);
  window.addEventListener('hashchange', onContextLost);
  if (typeof MutationObserver !== 'undefined' && document.body) {
    observer = new MutationObserver(() => { if (!backdrop.isConnected) onContextLost(); });
    observer.observe(document.body, { childList: true, subtree: true });
  }
  requestAnimationFrame(() => { if (!released && backdrop.isConnected) try { (initial || focusable()[0]).focus(); } catch (_) {} });
  return ({ restoreFocus = true } = {}) => {
    if (released) return;
    released = true;
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('hashchange', onContextLost);
    if (observer) observer.disconnect();
    try { if (restoreFocus && opener && opener.isConnected) opener.focus({ preventScroll: true }); } catch (_) {}
  };
}

function socialAOpenSoon(screen, title, opener) {
  const back = document.createElement('div');
  back.className = 'socialA-modal-backdrop open';
  back.innerHTML = `<section class="socialA-modal socialA-coming-panel" role="dialog" aria-modal="true" aria-labelledby="social-soon-title"><header class="socialA-modal-head"><div><span class="socialA-soon">${t('social.comingSoon')}</span><h2 id="social-soon-title">${esc(title)}</h2></div><button type="button" data-social-close aria-label="${t('social.close')}">${Icon('x', { size: 21 })}</button></header><div class="socialA-coming-body">${Icon('sprout', { size: 38 })}<p>${t('social.comingSoonBody')}</p></div></section>`;
  let closed = false, release = () => {};
  const forceClose = ({ restoreFocus = true } = {}) => { if (closed) return; closed = true; release({ restoreFocus }); back.remove(); socialAFlushDeferredRender(screen); };
  const close = () => forceClose();
  back.onclick = event => { if (event.target === back) close(); };
  back.querySelector('[data-social-close]').onclick = close;
  screen.appendChild(back);
  release = socialATrap(back, opener, close, forceClose, back.querySelector('[data-social-close]'));
}

function socialAOpenStory(screen, story, opener) {
  const author = story.author || {};
  const canReport = author.type !== 'system' && !(story.viewer && story.viewer.ownAuthor);
  const canDelete = author.type !== 'system' && !!(story.viewer && story.viewer.ownAuthor);
  const media = socialAMedia(story)[0] || null;
  const back = document.createElement('div');
  back.className = 'socialA-story-viewer open';
  const mediaMarkup = media ? (media.type === 'video'
    ? `<video class="socialA-story-media" src="${media.url}" controls autoplay playsinline muted></video>`
    : `<img class="socialA-story-media" src="${media.url}" alt="${esc(t('social.mediaAlt', { name: author.name || t('social.member') }))}">`)
    : `<div class="socialA-story-media socialA-story-text-bg" aria-hidden="true"></div>`;
  back.innerHTML = `<section class="socialA-story-dialog" role="dialog" aria-modal="true" aria-labelledby="social-story-name"><div class="socialA-story-progress"><span></span></div>${mediaMarkup}<div class="socialA-story-shade"></div><header class="socialA-story-top">${socialAvatar(author, 'socialA-avatar')}<div><strong id="social-story-name">${esc(author.name || t('social.member'))}</strong><small>${esc(socialWhen(story.createdAt))}</small></div>${canReport ? `<button type="button" data-social-story-report ${story.viewer && story.viewer.reported ? 'disabled' : ''} aria-label="${story.viewer && story.viewer.reported ? t('social.reported') : t('social.report')}">${Icon('flag', { size: 18 })}</button>` : ''}${canDelete ? `<button type="button" data-social-story-delete aria-label="${t('social.deleteStory')}">${Icon('trash', { size: 18 })}</button>` : ''}<button type="button" data-social-close-story aria-label="${t('social.closeStory')}">${Icon('x', { size: 22 })}</button></header>${story.text ? `<p class="socialA-story-message" style="overflow-wrap:anywhere">${esc(story.text)}</p>` : ''}</section>`;
  let closed = false, release = () => {};
  const forceClose = ({ restoreFocus = true } = {}) => {
    if (closed) return;
    closed = true;
    back.querySelectorAll('video').forEach(video => video.pause());
    release({ restoreFocus }); back.remove(); socialAFlushDeferredRender(screen);
  };
  const close = () => forceClose();
  back.onclick = event => { if (event.target === back) close(); };
  back.querySelector('[data-social-close-story]').onclick = close;
  const report = back.querySelector('[data-social-story-report]');
  if (report) report.onclick = async () => {
    report.disabled = true;
    try { await reportSocialStory(story.id); }
    catch (_) { report.disabled = false; toast(t('social.reportError'), 'error'); }
    if (!report.disabled || closed) return;
    forceClose(); toast(t('social.reported'), 'success');
    if (/^#\/(comunita|cibovero)$/.test(location.hash)) socialARequestRerender();
    loadSocialStories({ force: true }).then(() => { if (/^#\/(comunita|cibovero)$/.test(location.hash)) socialARequestRerender(); }).catch(() => {});
  };
  const remove = back.querySelector('[data-social-story-delete]');
  if (remove) remove.onclick = async () => {
    const confirmed = await confirmSheet(t('social.deleteStoryConfirmTitle'), { body: t('social.deleteStoryConfirmBody'), okLabel: t('social.delete'), cancelLabel: t('social.cancel'), danger: true });
    if (!confirmed || closed) return;
    remove.disabled = true;
    try { await deleteSocialStory(story.id); }
    catch (_) { remove.disabled = false; toast(t('social.deleteError'), 'error'); return; }
    if (closed) return;
    forceClose(); toast(t('social.storyDeleted'), 'success');
    if (/^#\/(comunita|cibovero)$/.test(location.hash)) socialARequestRerender();
    loadSocialStories({ force: true }).then(() => { if (/^#\/(comunita|cibovero)$/.test(location.hash)) socialARequestRerender(); }).catch(() => {});
  };
  screen.appendChild(back);
  release = socialATrap(back, opener, close, forceClose, back.querySelector('[data-social-close-story]'));
  opener.classList.add('is-seen');
  viewSocialStory(story.id).catch(() => {});
}

const socialAFileLimits = { image: 8 * 1024 * 1024, video: 18 * 1024 * 1024 };
function socialAFileType(file) {
  if (file && /^image\/(png|jpe?g|webp)$/i.test(file.type)) return 'image';
  if (file && /^video\/(mp4|webm)$/i.test(file.type)) return 'video';
  return '';
}
function socialAAbortError() {
  const error = new Error('aborted'); error.name = 'AbortError'; return error;
}
function socialAVideoDuration(file, signal) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    let done = false;
    const finish = (duration = null, aborted = false) => {
      if (done) return; done = true; clearTimeout(timer); signal?.removeEventListener('abort', onAbort);
      URL.revokeObjectURL(url); video.removeAttribute('src');
      if (aborted) reject(socialAAbortError()); else resolve(duration);
    };
    const onAbort = () => finish(null, true);
    const timer = setTimeout(() => finish(null), 4500);
    if (signal?.aborted) return finish(null, true);
    signal?.addEventListener('abort', onAbort, { once: true });
    video.preload = 'metadata';
    video.onloadedmetadata = () => finish(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => finish(null);
    video.src = url;
  });
}
function socialADataUrl(file, signal) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const cleanup = () => signal?.removeEventListener('abort', onAbort);
    const onAbort = () => { try { reader.abort(); } catch (_) {} cleanup(); reject(socialAAbortError()); };
    if (signal?.aborted) return reject(socialAAbortError());
    signal?.addEventListener('abort', onAbort, { once: true });
    reader.onload = () => { cleanup(); resolve(reader.result); };
    reader.onerror = () => { cleanup(); reject(reader.error || new Error('read_error')); };
    reader.onabort = () => { cleanup(); reject(socialAAbortError()); };
    reader.readAsDataURL(file);
  });
}

function socialAOpenCreate(screen, destination, opener) {
  const user = currentUser() || {};
  const isStory = destination === 'story';
  const back = document.createElement('div');
  back.className = 'socialA-modal-backdrop open';
  const formats = isStory ? ['text', 'image', 'video'] : ['text', 'image', 'video', 'carousel'];
  const formatKeys = { text: 'social.format.text', image: 'social.format.image', video: 'social.format.video', carousel: 'social.format.carousel' };
  const formatIcons = { text: 'message-circle', image: 'image', video: 'video', carousel: 'images' };
  back.innerHTML = `<section class="socialA-modal" role="dialog" aria-modal="true" aria-labelledby="social-create-title"><header class="socialA-modal-head"><h2 id="social-create-title">${isStory ? t('social.createStoryTitle') : t('social.createTitle')}</h2><button type="button" data-social-close aria-label="${t('social.close')}">${Icon('x', { size: 21 })}</button></header><div class="socialA-composer"><div class="socialA-composer-profile">${socialAvatar(user, 'socialA-avatar')}<div><strong>${esc(user.name || t('social.member'))}</strong><small>${t('social.publishFrom', { place: esc(socialPlace(socialState().context)) })}</small></div></div><div class="socialA-formats" role="group" aria-label="${t('social.formatLabel')}">${formats.map((format, index) => `<button type="button" class="socialA-format ${index === 0 ? 'active' : ''}" data-social-format="${format}" aria-pressed="${index === 0}">${Icon(formatIcons[format], { size: 18 })}<span>${t(formatKeys[format])}</span></button>`).join('')}</div><label class="sr-only" for="social-modal-text">${t('social.postTextLabel')}</label><textarea id="social-modal-text" maxlength="${isStory ? 280 : 700}" rows="4" data-social-modal-draft placeholder="${t('social.modalPlaceholder')}"></textarea><div class="socialA-media-drop" data-social-media-drop hidden><input type="file" data-social-media-input aria-label="${t('social.selectMedia')}"><span>${Icon('image', { size: 25 })}</span><strong>${t('social.selectMedia')}</strong><small>${t('social.mediaRules')}</small></div><div class="socialA-media-preview" data-social-media-preview></div>${!isStory ? `<label class="socialA-kind-select"><span>${t('social.kindLabel')}</span><select data-social-modal-kind>${SOCIAL_KINDS.map(kind => `<option value="${kind}"${kind === communityKind ? ' selected' : ''}>${t(SOCIAL_KIND_KEYS[kind])}</option>`).join('')}</select></label>` : ''}<p class="social-inline-error" role="alert" data-social-modal-error></p><div class="socialA-upload-status" role="status" aria-live="polite" data-social-upload-status></div><div class="socialA-composer-foot"><span>${isStory ? t('social.storyDuration') : t('social.audienceAll')}</span><button type="button" data-social-modal-publish>${isStory ? t('social.publishStory') : t('social.publish')}</button></div></div></section>`;
  let currentFormat = 'text', files = [], objectUrls = [], busy = false, validating = false, closed = false, validationSeq = 0, validationController = null, release = () => {};
  const lifetimeController = new AbortController();
  const input = back.querySelector('[data-social-media-input]');
  const drop = back.querySelector('[data-social-media-drop]');
  const preview = back.querySelector('[data-social-media-preview]');
  const error = back.querySelector('[data-social-modal-error]');
  const status = back.querySelector('[data-social-upload-status]');
  const publish = back.querySelector('[data-social-modal-publish]');
  const routeAtOpen = location.hash;
  const isActive = () => !closed && back.isConnected && location.hash === routeAtOpen;
  const revoke = () => { objectUrls.forEach(url => URL.revokeObjectURL(url)); objectUrls = []; };
  const syncPublish = () => { publish.disabled = busy || validating; };
  const cancelValidation = () => {
    validationSeq += 1;
    if (validationController) validationController.abort();
    validationController = null; validating = false; status.textContent = ''; syncPublish();
  };
  const forceClose = ({ restoreFocus = true } = {}) => {
    if (closed) return;
    closed = true; cancelValidation(); lifetimeController.abort(); revoke(); release({ restoreFocus }); back.remove(); socialAFlushDeferredRender(screen);
  };
  const close = () => forceClose();
  const renderPreview = () => {
    revoke(); preview.replaceChildren();
    files.forEach((file, index) => {
      const type = socialAFileType(file), url = URL.createObjectURL(file); objectUrls.push(url);
      const card = document.createElement('figure'); card.className = 'socialA-preview-item';
      const media = document.createElement(type === 'video' ? 'video' : 'img'); media.src = url;
      if (type === 'video') { media.muted = true; media.playsInline = true; media.controls = true; } else media.alt = '';
      const cap = document.createElement('figcaption'); cap.textContent = file.name;
      const remove = document.createElement('button'); remove.type = 'button'; remove.setAttribute('aria-label', t('social.removeMedia')); remove.innerHTML = Icon('x', { size: 16 });
      remove.onclick = () => { cancelValidation(); files.splice(index, 1); input.value = ''; renderPreview(); };
      card.append(media, cap, remove); preview.appendChild(card);
    });
  };
  const configureInput = () => {
    const media = currentFormat !== 'text'; drop.hidden = !media;
    input.accept = currentFormat === 'image' ? 'image/png,image/jpeg,image/webp' : currentFormat === 'video' ? 'video/mp4,video/webm' : 'image/png,image/jpeg,image/webp,video/mp4,video/webm';
    input.multiple = currentFormat === 'carousel';
  };
  const acceptFiles = async (incoming) => {
    cancelValidation();
    error.textContent = '';
    const candidates = [...incoming];
    if (!candidates.length || closed) return;
    const format = currentFormat, existing = files.slice(), max = format === 'carousel' ? 10 : 1;
    if (candidates.length + existing.length > max) { error.textContent = t('social.tooManyFiles'); return; }
    const seq = ++validationSeq, controller = new AbortController();
    validationController = controller; validating = true; syncPublish();
    try {
      const validated = [];
      for (const file of candidates) {
        const type = socialAFileType(file);
        if (!type || (format !== 'carousel' && type !== format)) throw Object.assign(new Error('validation'), { i18nKey: 'social.unsupportedFile' });
        if (file.size > socialAFileLimits[type]) throw Object.assign(new Error('validation'), { i18nKey: type === 'image' ? 'social.imageTooBig' : 'social.videoTooBig' });
        if (type === 'video') {
          status.textContent = t('social.checkingVideo');
          const duration = await socialAVideoDuration(file, controller.signal);
          if (duration != null && duration > 90.05) throw Object.assign(new Error('validation'), { i18nKey: 'social.videoTooLong' });
        }
        validated.push(file);
      }
      if (seq !== validationSeq || controller.signal.aborted || !isActive() || format !== currentFormat) return;
      files = [...existing, ...validated]; renderPreview();
    } catch (validationError) {
      if (validationError && validationError.name !== 'AbortError' && seq === validationSeq && isActive()) {
        error.textContent = t(validationError.i18nKey || 'social.unsupportedFile');
      }
    } finally {
      if (seq === validationSeq) { validationController = null; validating = false; status.textContent = ''; syncPublish(); }
    }
  };
  back.querySelectorAll('[data-social-format]').forEach(button => button.onclick = () => {
    if (busy || button.dataset.socialFormat === currentFormat) return;
    cancelValidation(); currentFormat = button.dataset.socialFormat; files = []; renderPreview(); input.value = ''; error.textContent = '';
    back.querySelectorAll('[data-social-format]').forEach(item => { const on = item === button; item.classList.toggle('active', on); item.setAttribute('aria-pressed', String(on)); });
    configureInput();
  });
  input.onchange = () => { const selected = [...(input.files || [])]; input.value = ''; acceptFiles(selected); };
  drop.ondragover = event => { event.preventDefault(); drop.classList.add('dragging'); };
  drop.ondragleave = () => drop.classList.remove('dragging');
  drop.ondrop = event => { event.preventDefault(); drop.classList.remove('dragging'); acceptFiles([...(event.dataTransfer && event.dataTransfer.files || [])]); };
  publish.onclick = async () => {
    const text = back.querySelector('[data-social-modal-draft]').value.trim();
    error.textContent = '';
    if (!text && !files.length) { error.textContent = t('social.emptyPost'); back.querySelector('[data-social-modal-draft]').focus(); return; }
    if (currentFormat !== 'text' && !files.length) { error.textContent = t('social.selectMediaError'); input.focus(); return; }
    if (currentFormat === 'carousel' && files.length < 2) { error.textContent = t('social.carouselMin'); input.focus(); return; }
    busy = true; publish.disabled = true; publish.textContent = t('social.publishing');
    const scopeAtPublish = communityScope;
    try {
      const refs = [];
      for (let index = 0; index < files.length; index++) {
        if (!isActive()) throw socialAAbortError();
        status.textContent = t('social.uploadProgress', { current: index + 1, total: files.length });
        const dataUrl = await socialADataUrl(files[index], lifetimeController.signal);
        const uploaded = await uploadSocialMedia(dataUrl, { signal: lifetimeController.signal }); refs.push(uploaded.mediaRef);
      }
      if (!isActive()) throw socialAAbortError();
      status.textContent = '';
      if (isStory) {
        await createSocialStory({ text, mediaRef: refs[0] || null }, { signal: lifetimeController.signal });
      } else {
        const kind = back.querySelector('[data-social-modal-kind]');
        communityKind = kind && SOCIAL_KINDS.includes(kind.value) ? kind.value : communityKind;
        await createSocialPost({ text, kind: communityKind, mediaRefs: refs }, { signal: lifetimeController.signal });
      }
    } catch (uploadError) {
      if (closed || uploadError && uploadError.name === 'AbortError') return;
      busy = false; publish.disabled = false; publish.textContent = isStory ? t('social.publishStory') : t('social.publish');
      const locationMetadata = String(uploadError && uploadError.message || '').toLocaleLowerCase('it').includes('metadata di localizzazione');
      error.textContent = t(locationMetadata ? 'social.videoLocationMetadata' : 'social.uploadOrPublishError');
      return;
    }
    if (!isActive()) return;
    busy = false; forceClose(); toast(t(isStory ? 'social.storyPublished' : 'social.published'), 'success');
    if (/^#\/(comunita|cibovero)$/.test(location.hash)) socialARequestRerender({ action: 'publish' });
    const refresh = isStory ? loadSocialStories({ force: true }) : loadSocialFeed(scopeAtPublish, { force: true });
    refresh.then(() => { if (/^#\/(comunita|cibovero)$/.test(location.hash)) socialARequestRerender(); }).catch(() => {});
  };
  back.onclick = event => { if (event.target === back) close(); };
  back.querySelector('[data-social-close]').onclick = close;
  configureInput(); screen.appendChild(back);
  release = socialATrap(back, opener, close, forceClose, back.querySelector('[data-social-modal-draft]'));
}

function socialAScopeNote(scope, place) {
  if (scope === 'following') return t('social.scopeNoteFollowing');
  if (scope === 'nearby') return t('social.scopeNoteNearby', { place: esc(place) });
  if (scope === 'producers') return t('social.scopeNoteProducers');
  return t('social.scopeNoteForYou', { place: esc(place) });
}

export function Comunita() {
  const social = socialState();
  if (!SOCIAL_A_SCOPES.includes(communityScope)) communityScope = 'for-you';
  if (social.scope !== communityScope && social.status !== 'loading' && SOCIAL_A_SCOPES.includes(social.scope)) communityScope = social.scope;
  const user = currentUser() || {};
  const place = socialPlace(social.context);
  const filters = SOCIAL_A_SCOPES.map(scope => `<button type="button" role="tab" tabindex="${communityScope === scope ? '0' : '-1'}" class="${communityScope === scope ? 'active' : ''}" data-social-scope="${scope}" aria-selected="${communityScope === scope}" aria-controls="social-feed">${t(SOCIAL_A_FILTER_KEYS[scope])}</button>`).join('');
  let feed = '';
  if ((social.status === 'idle' || social.status === 'loading') && !(social.posts || []).length) feed = `<div class="sr-only" role="status">${t('social.loading')}</div>${socialSkeleton()}`;
  else if (social.status === 'error' && !(social.posts || []).length) feed = `<div class="social-state" role="alert">${Icon('sprout', { size: 36 })}<h2>${t('social.loadErrorTitle')}</h2><p>${t('social.loadErrorBody')}</p><button class="btn btn-outline" type="button" data-social-retry>${t('social.retry')}</button></div>`;
  else if (!(social.posts || []).length) {
    const keys = SOCIAL_A_EMPTY_KEYS[communityScope];
    feed = `<div class="social-state">${Icon('message-circle', { size: 38 })}<h2>${t(keys[0])}</h2><p>${t(keys[1])}</p></div>`;
  } else feed = social.posts.map(socialAPostCard).join('');
  const profileName = esc(user.name || t('social.member'));
  const quickKinds = SOCIAL_KINDS.map(kind => `<option value="${kind}"${communityKind === kind ? ' selected' : ''}>${t(SOCIAL_KIND_KEYS[kind])}</option>`).join('');
  return {
    html: `<div class="screen social-screen socialA-screen">${StatusBar()}
      <header class="socialA-mobile-head"><a href="#/comunita" data-link aria-label="${t('social.networkName')}">${Lockup()}</a><div><button type="button" data-social-open-create aria-label="${t('social.create')}">${Icon('plus', { size: 22 })}</button><button type="button" data-social-soon="messages" aria-label="${t('social.messages')}">${Icon('send', { size: 22 })}</button></div></header>
      <div class="scroll socialA-scroll"><div class="socialA-shell">
        <aside class="socialA-rail" aria-label="${t('nav.primary')}"><a class="socialA-lockup" href="#/comunita" data-link>${Lockup()}</a><nav>
          <a class="socialA-nav-item active" href="#/comunita" data-link aria-current="page">${Icon('home', { size: 22 })}<span>${t('nav.rete')}</span></a>
          <a class="socialA-nav-item" href="#/mappa" data-link>${Icon('map-pin', { size: 22 })}<span>${t('rail.map')}</span></a>
          <a class="socialA-nav-item" href="#/ricerca" data-link>${Icon('search', { size: 22 })}<span>${t('social.searchProducers')}</span></a>
          <button type="button" class="socialA-nav-item" data-social-soon="messages">${Icon('send', { size: 22 })}<span>${t('social.messages')}</span><small class="socialA-soon">${t('social.comingSoon')}</small></button>
          <button type="button" class="socialA-nav-item" data-social-soon="notifications">${Icon('bell', { size: 22 })}<span>${t('social.notifications')}</span><small class="socialA-soon">${t('social.comingSoon')}</small></button>
          <button type="button" class="socialA-nav-item" data-social-open-create>${Icon('plus', { size: 22 })}<span>${t('social.create')}</span></button>
        </nav><a class="socialA-rail-profile" href="#/profilo" data-link>${socialAvatar(user, 'socialA-avatar')}<span>${t('nav.tu')}</span></a></aside>

        <main class="socialA-center">
          <header class="socialA-feed-head"><div class="socialA-title-row"><div><span class="eyebrow">${t('social.eyebrow')}</span><h1>${t('social.networkName')}</h1></div><span class="socialA-location">${Icon('map-pin', { size: 15 })}${esc(place)}</span></div>
            <div class="socialA-tabs" role="tablist" aria-label="${t('social.filtersAria')}">${filters}</div>
          </header>
          ${socialAStories(social, user)}
          <section class="socialA-quick-compose" aria-label="${t('social.composerAria')}">${socialAvatar(user, 'socialA-avatar')}<label class="sr-only" for="social-post-text-a">${t('social.composerAria')}</label><textarea id="social-post-text-a" rows="1" maxlength="700" data-social-draft placeholder="${t('social.quickPlaceholder')}">${esc(communityDraft)}</textarea><label class="socialA-quick-kind"><span class="sr-only">${t('social.kindLabel')}</span><select data-social-kind>${quickKinds}</select></label><button type="button" class="socialA-quick-media" data-social-open-create aria-label="${t('social.addMedia')}">${Icon('image', { size: 20 })}</button><button type="button" class="socialA-quick-publish" data-social-publish>${t('social.publish')}</button><p class="social-inline-error" role="alert" data-social-publish-error></p></section>
          <p class="socialA-scope-note">${socialAScopeNote(communityScope, place)}</p>
          ${social.status === 'loading' && (social.posts || []).length ? `<p class="social-refreshing" role="status">${t('social.refreshing')}</p>` : ''}
          <section id="social-feed" class="social-feed" role="feed" aria-label="${t('social.feedAria')}" aria-busy="${social.status === 'loading'}">${feed}</section>
          ${social.hasMore ? `<button type="button" class="socialA-load-more" data-social-load-more>${t('social.loadMore')}</button>` : ''}
        </main>

        <aside class="socialA-right" aria-label="${t('social.profileAndSuggestions')}"><a class="socialA-self" href="#/profilo" data-link>${socialAvatar(user, 'socialA-avatar')}<span><strong>${profileName}</strong><small>${esc(place)}</small></span><b>${t('social.viewProfile')}</b></a><div class="socialA-suggest-head"><strong>${t('social.suggestionsTitle')}</strong><button type="button" data-social-show-nearby>${t('social.showNearby')}</button></div><div class="socialA-suggest-list">${socialASuggestions(social)}</div><footer class="socialA-right-foot"><strong>${t('social.localCommunityTitle')}</strong><p>${t('social.localCommunityBody')}</p></footer></aside>
      </div></div>
      <div class="socialA-mobile-nav">${BottomNav('comunita')}</div>
    </div>`,
    onMount(el) {
      const onThisScreen = () => /^#\/(comunita|cibovero)$/.test(location.hash);
      const finishLoad = () => { if (onThisScreen()) socialARequestRerender(); };
      const initial = [];
      const refreshEntry = communityHandledEntryToken !== communityEntryToken;
      if (refreshEntry) {
        communityHandledEntryToken = communityEntryToken;
        initial.push(loadSocialFeed(communityScope, { force: true }), loadSocialSurface({ force: true }));
      } else {
        if (social.status === 'idle' || social.scope !== communityScope) initial.push(loadSocialFeed(communityScope));
        if (social.storiesStatus === 'idle' || social.suggestionsStatus === 'idle') initial.push(loadSocialSurface());
      }
      if (initial.length) Promise.allSettled(initial).then(finishLoad);

      const draft = el.querySelector('[data-social-draft]');
      if (draft) draft.oninput = () => { communityDraft = draft.value; };
      const kind = el.querySelector('[data-social-kind]');
      if (kind) kind.onchange = () => { communityKind = SOCIAL_KINDS.includes(kind.value) ? kind.value : 'question'; };
      const publish = el.querySelector('[data-social-publish]');
      if (publish) publish.onclick = async () => {
        const text = (draft ? draft.value : communityDraft).trim();
        const error = el.querySelector('[data-social-publish-error]');
        if (!text) { if (error) error.textContent = t('social.emptyPost'); if (draft) draft.focus(); return; }
        publish.disabled = true; publish.textContent = t('social.publishing'); if (error) error.textContent = '';
        const scopeAtPublish = communityScope;
        try { await createSocialPost({ text, kind: communityKind }); }
        catch (_) { publish.disabled = false; publish.textContent = t('social.publish'); if (error) error.textContent = t('social.publishError'); return; }
        communityDraft = ''; toast(t('social.published'), 'success');
        if (onThisScreen()) socialARequestRerender({ action: 'publish' });
        if (onThisScreen() && communityScope === scopeAtPublish) {
          loadSocialFeed(scopeAtPublish, { force: true }).then(() => { if (onThisScreen() && communityScope === scopeAtPublish) socialARequestRerender(); }).catch(() => {});
        }
      };

      el.querySelectorAll('[data-social-open-create]').forEach(button => button.onclick = () => socialAOpenCreate(el, 'post', button));
      const createStory = el.querySelector('[data-social-create-story]');
      if (createStory) createStory.onclick = () => socialAOpenCreate(el, 'story', createStory);
      el.querySelectorAll('[data-social-soon]').forEach(button => button.onclick = () => socialAOpenSoon(el, button.dataset.socialSoon === 'notifications' ? t('social.notifications') : t('social.messages'), button));
      el.querySelectorAll('[data-social-story]').forEach(button => button.onclick = () => {
        const story = (socialState().stories || []).find(item => String(item.id) === button.dataset.socialStory);
        if (story) socialAOpenStory(el, story, button);
      });

      const scopeButtons = [...el.querySelectorAll('[data-social-scope]')];
      scopeButtons.forEach((button, index) => {
        button.onclick = () => {
          const next = button.dataset.socialScope;
          if (next === communityScope || !SOCIAL_A_SCOPES.includes(next)) return;
          communityScope = next; socialAPostMenus.clear();
          loadSocialFeed(next, { force: true }).then(finishLoad).catch(finishLoad);
          socialARequestRerender({ action: 'scope', scope: next });
        };
        button.onkeydown = (event) => {
          const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
          if (!keys.includes(event.key)) return;
          event.preventDefault();
          const targetIndex = event.key === 'Home' ? 0 : event.key === 'End' ? scopeButtons.length - 1
            : (index + (event.key === 'ArrowRight' ? 1 : -1) + scopeButtons.length) % scopeButtons.length;
          const target = scopeButtons[targetIndex]; target.focus(); target.click();
        };
      });
      const showNearby = el.querySelector('[data-social-show-nearby]');
      if (showNearby) showNearby.onclick = () => {
        communityScope = 'nearby'; loadSocialFeed('nearby', { force: true }).then(finishLoad).catch(finishLoad); socialARequestRerender({ action: 'scope', scope: 'nearby' });
      };
      const retry = el.querySelector('[data-social-retry]');
      if (retry) retry.onclick = () => { loadSocialFeed(communityScope, { force: true }).then(finishLoad).catch(finishLoad); socialARequestRerender({ action: 'retry' }); };
      const more = el.querySelector('[data-social-load-more]');
      if (more) more.onclick = async () => { more.disabled = true; more.textContent = t('social.loadingMore'); try { await loadSocialFeed(communityScope, { append: true }); finishLoad(); } catch (_) { more.disabled = false; more.textContent = t('social.loadMore'); } };

      el.querySelectorAll('[data-social-follow]').forEach(button => button.onclick = async () => {
        if (button.disabled) return; button.disabled = true;
        const id = button.dataset.socialFollow, next = button.dataset.socialFollowing !== 'true';
        try {
          await followSocialAuthor(id, next);
          await Promise.allSettled([loadSocialFeed(communityScope, { force: true }), loadSocialSuggestions({ force: true }), loadSocialStories({ force: true })]);
          if (onThisScreen()) socialARequestRerender({ action: 'follow', authorId: id });
        } catch (_) { button.disabled = false; toast(t('social.followError'), 'error'); }
      });

      socialARootController?.abort(); socialARootController = new AbortController();
      const socialRootSignal = socialARootController.signal;
      const dismissPostMenus = ({ restoreFocus = false } = {}) => {
        if (!socialAPostMenus.size) return;
        socialAPostMenus.clear();
        el.querySelectorAll('.socialA-menu-pop').forEach(pop => pop.remove());
        el.querySelectorAll('[data-social-menu][aria-expanded="true"]').forEach(button => {
          button.setAttribute('aria-expanded', 'false');
          if (restoreFocus) try { button.focus({ preventScroll: true }); } catch (_) { button.focus(); }
        });
      };
      el.addEventListener('keydown', event => {
        if (event.key === 'Escape' && socialAPostMenus.size && !event.target.closest('.socialA-modal-backdrop,.socialA-story-viewer')) {
          event.preventDefault(); dismissPostMenus({ restoreFocus: true });
        }
      }, { signal: socialRootSignal });
      el.addEventListener('click', event => {
        if (socialAPostMenus.size && !event.target.closest('[data-social-menu],.socialA-menu-pop')) dismissPostMenus();
      }, { signal: socialRootSignal });

      el.querySelectorAll('[data-social-post]').forEach(card => {
        const id = card.dataset.socialPost;
        const run = async (button, action, focusAction) => {
          if (!button || button.disabled) return; button.disabled = true;
          const scopeAtMutation = communityScope;
          try { await action(); }
          catch (_) { button.disabled = false; toast(t('social.actionError'), 'error'); return; }
          if (scopeAtMutation === 'producers' && communityScope === scopeAtMutation && onThisScreen()) try { await loadSocialFeed('producers', { force: true }); } catch (_) {}
          if (onThisScreen()) socialARequestRerender({ action: focusAction, postId: id });
        };
        const like = card.querySelector('[data-social-like]'); if (like) like.onclick = () => run(like, () => likeSocialPost(id), 'like');
        const save = card.querySelector('[data-social-save]'); if (save) save.onclick = () => run(save, () => saveSocialPost(id), 'save');
        const menu = card.querySelector('[data-social-menu]'); if (menu) menu.onclick = () => { if (socialAPostMenus.has(id)) socialAPostMenus.delete(id); else { socialAPostMenus.clear(); socialAPostMenus.add(id); } socialARequestRerender({ action: 'menu', postId: id }); };
        const report = card.querySelector('[data-social-report]'); if (report) report.onclick = async () => {
          report.disabled = true; const scopeAtMutation = communityScope;
          try { await reportSocialPost(id); }
          catch (_) { report.disabled = false; toast(t('social.reportError'), 'error'); return; }
          socialAPostMenus.delete(id); toast(t('social.reported'), 'success'); if (onThisScreen()) socialARequestRerender();
          if (onThisScreen() && communityScope === scopeAtMutation) {
            loadSocialFeed(scopeAtMutation, { force: true }).then(() => { if (onThisScreen() && communityScope === scopeAtMutation) socialARequestRerender(); }).catch(() => {});
          }
        };
        const remove = card.querySelector('[data-social-delete]'); if (remove) remove.onclick = async () => {
          const confirmed = await confirmSheet(t('social.deletePostConfirmTitle'), { body: t('social.deletePostConfirmBody'), okLabel: t('social.delete'), cancelLabel: t('social.cancel'), danger: true });
          if (!confirmed) return;
          remove.disabled = true; const scopeAtMutation = communityScope;
          try { await deleteSocialPost(id); }
          catch (_) { remove.disabled = false; toast(t('social.deleteError'), 'error'); return; }
          communityOpenComments.delete(id); communityCommentDrafts.delete(id); socialAPostMenus.delete(id);
          toast(t('social.postDeleted'), 'success'); if (onThisScreen()) socialARequestRerender();
          if (onThisScreen() && communityScope === scopeAtMutation) {
            loadSocialFeed(scopeAtMutation, { force: true }).then(() => { if (onThisScreen() && communityScope === scopeAtMutation) socialARequestRerender(); }).catch(() => {});
          }
        };
        const share = card.querySelector('[data-social-share]'); if (share) share.onclick = async () => {
          const post = (socialState().posts || []).find(item => String(item.id) === id) || {};
          const data = { title: t('social.shareTitle'), text: String(post.text || t('social.shareFallback')).slice(0, 220), url: location.origin + location.pathname + '#/comunita' };
          let completed = false;
          try {
            if (navigator.share) { await navigator.share(data); completed = true; }
            else if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(data.url); completed = true; }
            else { const area = document.createElement('textarea'); area.value = data.url; area.style.position = 'fixed'; area.style.opacity = '0'; document.body.appendChild(area); area.select(); completed = document.execCommand('copy'); area.remove(); }
            if (completed) {
              const scopeAtMutation = communityScope; await shareSocialPost(id);
              if (scopeAtMutation === 'producers' && communityScope === scopeAtMutation && onThisScreen()) try { await loadSocialFeed('producers', { force: true }); } catch (_) {}
              toast(t('social.shared'), 'success'); if (onThisScreen()) socialARequestRerender({ action: 'share', postId: id });
            }
          } catch (error) { if (!(error && error.name === 'AbortError')) toast(t('social.shareError'), 'error'); }
        };
        const comments = card.querySelector('[data-social-comments]'); if (comments) comments.onclick = () => { if (communityOpenComments.has(id)) communityOpenComments.delete(id); else communityOpenComments.add(id); socialARequestRerender({ action: 'comments', postId: id }); };
        const commentInput = card.querySelector('[data-social-comment-input]'); if (commentInput) commentInput.oninput = () => communityCommentDrafts.set(id, commentInput.value);
        const form = card.querySelector('[data-social-comment-form]'); if (form) form.onsubmit = async event => {
          event.preventDefault(); const text = (commentInput && commentInput.value || '').trim(); const formError = card.querySelector('[data-social-comment-error]');
          if (!text) { if (commentInput) commentInput.focus(); return; }
          const submit = form.querySelector('button[type="submit"]'); submit.disabled = true;
          const scopeAtMutation = communityScope;
          try { await commentSocialPost(id, text); }
          catch (_) { submit.disabled = false; if (formError) formError.textContent = t('social.commentError'); return; }
          communityCommentDrafts.delete(id);
          if (scopeAtMutation === 'producers' && communityScope === scopeAtMutation && onThisScreen()) try { await loadSocialFeed('producers', { force: true }); } catch (_) {}
          if (onThisScreen()) socialARequestRerender({ action: 'comment-input', postId: id });
        };
        const carousel = card.querySelector('[data-social-carousel]');
        if (carousel) {
          const slides = [...carousel.querySelectorAll('.socialA-slide')];
          const move = delta => {
            const at = Math.max(0, Math.min(slides.length - 1, Number(carousel.dataset.socialCarouselIndex || 0) + delta));
            carousel.dataset.socialCarouselIndex = String(at); socialACarousels.set(id, at);
            const track = carousel.querySelector('.socialA-carousel-track'); if (track) track.style.transform = `translateX(-${at * 100}%)`;
            slides.forEach((slide, index) => { slide.setAttribute('aria-hidden', String(index !== at)); slide.querySelectorAll('video').forEach(video => { video.tabIndex = index === at ? 0 : -1; if (index !== at) video.pause(); }); });
            const prev = carousel.querySelector('[data-social-carousel-prev]'), next = carousel.querySelector('[data-social-carousel-next]');
            if (at === 0 && prev && document.activeElement === prev && next) try { next.focus({ preventScroll: true }); } catch (_) { next.focus(); }
            if (at === slides.length - 1 && next && document.activeElement === next && prev) try { prev.focus({ preventScroll: true }); } catch (_) { prev.focus(); }
            if (prev) prev.disabled = at === 0; if (next) next.disabled = at === slides.length - 1;
            const count = carousel.querySelector('[data-social-carousel-count]'); if (count) count.textContent = `${at + 1} / ${slides.length}`;
            carousel.querySelectorAll('.socialA-carousel-dots i').forEach((dot, index) => dot.classList.toggle('active', index === at));
          };
          const prev = carousel.querySelector('[data-social-carousel-prev]'), next = carousel.querySelector('[data-social-carousel-next]'); if (prev) prev.onclick = () => move(-1); if (next) next.onclick = () => move(1);
          let touchStart = null;
          carousel.addEventListener('touchstart', event => { const touch = event.touches && event.touches[0]; touchStart = touch ? { x: touch.clientX, y: touch.clientY } : null; }, { passive: true });
          carousel.addEventListener('touchend', event => {
            const touch = event.changedTouches && event.changedTouches[0]; if (!touch || !touchStart) return;
            const dx = touch.clientX - touchStart.x, dy = touch.clientY - touchStart.y; touchStart = null;
            if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy)) move(dx < 0 ? 1 : -1);
          }, { passive: true });
        }
      });
    },
  };
}

/* ---------------- SCHEDA PRODUTTORE ---------------- */
export function Producer(id) {
  const p = producerById(id);
  if (!p) return { html: `<div class="screen no-nav"><div class="pad mt22">${t('producer.notFound')} <a href="#/home" data-link>${t('producer.backHome')}</a></div></div>` };
  const categories = Array.isArray(p.categories) ? p.categories : [];
  const seasonal = Array.isArray(p.seasonal) ? p.seasonal : [];
  const verify = p.verify || { state: 'valid', date: '' };
  const region = producerRegion(p) || userRegion() || '';
  const locationParts = [...new Set([p.place, region].filter(Boolean).map(String))];
  const location = locationParts.join(', ');
  const hasDistance = p.km !== null && p.km !== '' && Number.isFinite(Number(p.km));
  const distance = hasDistance ? `${km(p.km)} km` : t('producer.distanceUnavailable');
  const story = String(p.story || '');
  const lead = story.length > 190 ? story.slice(0, 187).replace(/\s+\S*$/, '') + '…' : story;
  const cats = categories.map(c => `<span>${Icon(catGlyph[c], { size: 14 })}${catLabel(c)}</span>`).join('');
  // Pull-quote: cita le parole vere del produttore (estratte da story tra « »), con attribuzione.
  const quoteMatch = story.match(/«([^»]+)»/);
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
        <section class="prod-section prod-video-section">
          <div class="prod-section-head"><h2>${t('producer.watchVisit')}</h2><span class="tnum">${t('producer.videoCount', { n: vids.length })}</span></div>
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
        </section>` : '';
  const seasonalCards = seasonal.map(si => `<article class="prod-product-card">
    ${Photo(si.tone, '', 'prod-product-photo')}
    <div class="prod-product-copy"><h3>${esc(si.label)}</h3><p>${esc(si.note || t('producer.productAvailable'))}</p></div>
  </article>`).join('');
  const verificationLine = verify.date
    ? t('producer.profileVerified', { date: locDate(verify.date) })
    : t('producer.noVerifier');
  return {
    html: `<div class="screen no-nav prod prod-profile">
      <div class="scroll">
        <header class="prod-profile-hero">
          <div class="prod-profile-cover">
            ${Photo(p.tone, '', 'prod-profile-cover-photo', p.photo, p.photoPos || 'center')}
            <div class="prod-profile-nav">
              <button class="iconbtn" data-back aria-label="${t('common.back')}">${Icon('arrow-left', { size: 19 })}</button>
              <button class="iconbtn ${p.saved ? 'saved' : ''}" data-save aria-label="${p.saved ? t('producer.saveRemoveAria') : t('producer.saveAria')}" aria-pressed="${p.saved ? 'true' : 'false'}">${Icon(p.saved ? 'heart' : 'bookmark', { size: 19, color: p.saved ? '#fff' : 'var(--ink)', fill: p.saved ? '#fff' : 'none' })}</button>
            </div>
            <div class="prod-profile-cover-copy">
              <span class="eyebrow">${t('producer.localProducer')}</span>
              <h1>${esc(p.name)}</h1>
              <p>${Icon('map-pin', { size: 15 })}<span>${esc(location)}${hasDistance ? ` · <b class="tnum">${esc(distance)}</b>` : ''}</span></p>
            </div>
          </div>

          <div class="prod-profile-intro">
            <div class="prod-profile-trust">${VerifyBadge(verify)}</div>
            ${cats ? `<div class="prod-profile-cats">${cats}</div>` : ''}
            <p class="prod-profile-lead">${esc(lead || quote)}</p>
            <div class="prod-profile-actions">
              <button class="prod-profile-primary" type="button" data-contact>${Icon('message-circle', { size: 18 })}<span>${t('producer.askAvailability')}</span></button>
              <button class="prod-profile-secondary" type="button" data-nav aria-label="${t('producer.directionsAria')}">${Icon('navigation', { size: 19 })}</button>
            </div>
            <div class="prod-profile-open">
              <span>${Icon('clock', { size: 17 })}</span>
              <div><b>${t('producer.pickupDirect')}</b><small>${esc(p.hours || t('producer.contactPickup'))}</small></div>
            </div>
          </div>
        </header>

        <div class="prod-profile-content">
          <main class="prod-profile-main">
            <section class="prod-section">
              <div class="prod-section-head"><h2>${t('producer.availableNow')}</h2><span>${seasonal.length} ${seasonal.length === 1 ? t('producer.productOne') : t('producer.productMany')} · ${t('producer.smallLots')}</span></div>
              ${seasonalCards ? `<div class="prod-products">${seasonalCards}</div>` : `<div class="prod-empty-products">${t('producer.noSeasonal')}</div>`}
            </section>

            ${videoSection}

            <section class="prod-section prod-story-section">
              <div class="prod-section-head"><h2>${t('producer.storyMethod')}</h2><span>${t('producer.fromTerritory')}</span></div>
              <p class="prod-profile-story">${esc(story || quote)}</p>
              <figure class="prod-profile-quote">
                <blockquote>“${esc(quote)}”</blockquote>
                <figcaption>— ${esc(quoteWho)}</figcaption>
              </figure>
              <div class="prod-method">
                <div class="prod-method-step"><span>01</span><div><b>${t('producer.originDeclared')}</b><small>${t('producer.originBody')}</small></div></div>
                <div class="prod-method-step"><span>02</span><div><b>${t('producer.processTold')}</b><small>${t('producer.processBody')}</small></div></div>
                <div class="prod-method-step"><span>03</span><div><b>${t('producer.directPurchase')}</b><small>${t('producer.directPurchaseBody')}</small></div></div>
              </div>
            </section>
          </main>

          <aside class="prod-profile-side" aria-label="${t('producer.practicalInfoAria')}">
            <section class="prod-info-card">
              <h2>${t('producer.howToBuy')}</h2>
              <div class="prod-info-row"><span>${Icon('clock', { size: 17 })}</span><div><b>${t('producer.pickupDirect')}</b><small>${esc(p.hours || t('producer.contactPickup'))}</small></div></div>
              <div class="prod-info-row"><span>${Icon('map-pin', { size: 17 })}</span><div><b>${esc(location || p.name)}</b><small>${esc(p.address || t('producer.addressOnContact'))}</small></div></div>
              <div class="prod-info-row"><span>${Icon('navigation', { size: 17 })}</span><div><b>${hasDistance ? t('producer.distanceFromCity', { distance }) : t('producer.distanceUnavailable')}</b><small>${t('producer.distancePrinciple')}</small></div></div>
            </section>

            <section class="prod-info-card prod-verify-card">
              <h2>${t('producer.whatVerified')}</h2>
              ${VerifyBadge(verify, { compact: true })}
              <p>${esc(verificationLine)}${verify.by ? ` · ${esc(t('producer.verifiedBy', { name: verify.by }))}` : ''}</p>
            </section>

            <section class="prod-info-card prod-delivery-card">
              <h2>${t('producer.homeDelivery')}</h2>
              <div class="prod-info-row"><span>${Icon('truck', { size: 17 })}</span><div><b>${t('producer.deliveryUnavailable')}</b><small>${t('producer.deliveryNote')}</small></div></div>
            </section>

            <section class="prod-info-card prod-reviews-card">
              <h2>${t('producer.reviews')}</h2>
              <p>${t('producer.noReviews1')} <b>${esc(verificationLine)}</b>.</p>
            </section>
          </aside>
        </div>
      </div>

      <div class="cta-sticky prod-profile-sticky">
        <button class="btn btn-grad" data-contact aria-label="${t('producer.askAvailability')}">${Icon('message-circle', { size: 18, color: '#fff' })} ${t('producer.askAvailability')}</button>
        <button class="iconbtn" data-nav aria-label="${t('producer.directionsAria')}">${Icon('navigation', { size: 20, color: 'var(--verde)' })}</button>
      </div>
    </div>`,
    onMount(el) {
      const back = el.querySelector('[data-back]'); if (back) back.onclick = () => history.back();
      const save = el.querySelector('[data-save]'); if (save) save.onclick = (e) => { toggleSaved(p.id); rerender(); };
      el.querySelectorAll('[data-contact]').forEach(contact => { contact.onclick = () => openContact(p); });
      el.querySelectorAll('[data-nav]').forEach(nav => { nav.onclick = () => openContact(p); });

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
